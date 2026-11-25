# Phase 2 Backend Architecture

Phase 2 adds the backend foundation only. No feature screens are implemented.

## Naming boundaries

- Firebase infrastructure project ID: `FIREBASE_PROJECT_ID`; never stored in client config.
- Residential construction project ID: `CONSTRUCTION_PROJECT_ID` on the backend and `EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID` in the app. This is the `projectId` used in Firestore paths.
- Functions region: `FUNCTIONS_REGION` on the backend and `EXPO_PUBLIC_FUNCTIONS_REGION` in the app. Both must match. Default is `us-central1`.
- Unit configuration is a `projects/{projectId}/units/{unitId}` document. It is not configuration for the Firebase project.

## Firestore schema

All writes to these paths are privileged Admin SDK writes from Cloud Functions. Client rules deny writes.

| Path | Purpose | Stable ID / key fields |
|---|---|---|
| `users/{uid}` | Public user record | `uid`, `displayName`, `phone`, `createdAt`, `updatedAt` |
| `projects/{projectId}` | Construction project | `id`, `name`, `createdByUid`, `createdAt` |
| `projects/{projectId}/members/{uid}` | Role and membership | Doc ID is Auth UID; `role: builder|buyer`, `towerId?`, `unitId?` |
| `projects/{projectId}/towers/{towerId}` | Tower reference | `id`, `name` |
| `projects/{projectId}/units/{unitId}` | Unit reference | `id`, `towerId`, `label` |
| `invites/{codeHash}` | Single-use invite | Doc ID is SHA-256 of normalized code; `codeHash`, `projectId`, `towerId`, `unitId`, `expiresAt`, `usedAt`, `usedByUid` |
| `projects/{projectId}/notices/{noticeId}` | Canonical notice and counters | `audienceType`, `audienceTowerIds`, `audienceUnitIds`, `pinned`, `audienceCount`, `readCount`, `fanoutStatus`, `pinStatus`, `fanoutFailedCount`, `pinFailedCount` |
| `users/{uid}/feed/{noticeId}` | Recipient-specific denormalized notice | Doc ID is canonical notice ID; required fields listed below |
| `projects/{projectId}/fanoutFailures/{kind_noticeId_uid}` | Recoverable propagation failure | Stable ID includes operation kind; `kind`, `resolved`, `retryable`, `attempts`, `lastAttemptAt`, `reason`, `updatedAt` |
| `_system/fanoutRetryLock` | Scheduled retry lease | `owner`, `expiresAtMs`, `updatedAtMs` |

Timestamps are Firestore `Timestamp` values except the retry lease, which uses epoch milliseconds. Buyer feed documents are the authoritative read-state records for that buyer and notice.

### Feed document schema

Every feed creation path writes exactly these fields:

```text
uid: string
noticeId: string
projectId: string
title: string
body: string
pinned: boolean
deliveredAt: Timestamp
updatedAt: Timestamp
readAt: Timestamp | null
```

`readAt` is written as `null` on creation and only changed by `markNoticeRead`. Pin propagation updates only `pinned` and `updatedAt`. Fan-out updates `title`, `body`, `pinned`, and `updatedAt` when canonical mutable fields change. Pin queries use both `noticeId` and `projectId`; the recipient UID is derived from the `users/{uid}/feed/{noticeId}` path, not the stored `uid` field, so malformed or stale feed fields cannot redirect propagation. `markNoticeRead` validates both fields against the caller's feed document.

## Callables

All callables are Firebase Functions v2 `onCall` handlers in the configured region with App Check enforcement enabled.

| Function | Responsibility |
|---|---|
| `redeemInvite` | Validate/normalize code, hash it, transactionally consume it and create buyer membership, then idempotently backfill eligible notices |
| `createNotice` | Authorize builder, validate audience, persist canonical notice, then idempotently fan out to eligible buyers |
| `setNoticePinned` | Authorize builder, update canonical notice pinned state, then idempotently propagate to feed entries |
| `markNoticeRead` | Authorize buyer, verify own feed entry, set first `readAt`, and increment canonical `readCount` once |

Internal fan-out and retry helpers are not callable endpoints.

## Invite redemption

1. Normalize code by trimming whitespace, removing spaces/hyphens, and uppercasing.
2. Reject strings that are not 12-64 alphanumeric characters.
3. Compute SHA-256 hex hash. The hash is the invite document ID and `codeHash` field; plaintext is never stored or logged.
4. In one transaction on `invites/{codeHash}`:
   - verify project, tower, and unit exist, and for unit references parse the referenced tower and verify it belongs to the same project;
   - verify expiry and unused state;
   - if the caller already has a membership, allow retry only when the invite was used by the same UID;
   - create `members/{uid}` with role `buyer`;
   - mark the invite used.
5. Backfill eligible existing notices through the same recipient-level fan-out helper used for new notices.

Invalid, expired, and already-used codes return the same safe `invalid-argument` message to prevent enumeration.

## Notice fan-out and retries

- Eligible buyers are buyer memberships in the project filtered by audience: all buyers, matching `towerId`, or matching `unitId`.
- Recipients are processed in chunks of 25 with concurrency 5.
- Each recipient is processed in a transaction keyed by `users/{uid}/feed/{noticeId}`:
  - if the feed document is absent, create it and increment canonical `audienceCount`;
  - if it exists, update only denormalized mutable fields and never increment `audienceCount`;
  - a failed recipient is recorded in a stable `fanoutFailures/{kind_noticeId_uid}` document.
- Failure kinds are `notice`, `backfill`, and `pin`. The kind is part of the failure ID, so delivery and pin failures for the same notice and recipient cannot overwrite each other.
- `fanoutStatus` and `pinStatus` are `complete` or `partial`; `pending` and `processing` are transitional values. Status refresh uses the transactionally maintained failure counters as the authoritative state, so stale unresolved-failure queries cannot return a notice to `partial` after resolution or miss a concurrently recorded failure.
- Failure counters are updated in the same transaction as failure creation/resolution. Repeated failures for the same unresolved ID do not increment counters twice, and resolving an already-resolved failure does not decrement twice.
- Transient Firestore errors are retried immediately up to three attempts per recipient and are also eligible for scheduled retries.
- Permanent validation/authorization/parse failures are preserved as unresolved but marked `retryable: false`.
- The system does not claim atomic fan-out across all recipients. Propagation is eventually consistent and recoverable.

## Scheduled retry execution

`retryFanoutFailures` is a Firebase Functions v2 `onSchedule` handler that runs every 5 minutes UTC.

- It acquires a Firestore lease at `_system/fanoutRetryLock` with a 4-minute expiry before doing work, reducing overlapping executions.
- It processes only unresolved failures with `retryable: true`.
- It retries at most 100 selected failure records per run and uses concurrency 5. The selected failure records are passed into notice-level retry processing; groups are never expanded by re-querying every failure for the notice. Failures outside the selected batch remain retryable in later runs.
- Each selected failure is claimed transactionally before processing; a failure already handled by another worker is skipped and is not counted as resolved.
- Each failure gets an `attempts` increment and `lastAttemptAt`; after 5 attempts without success it remains unresolved but becomes non-retryable.
- Successful retries resolve the failure and decrement the matching counter.
- Failed retries preserve the unresolved failure record and update `reason`.
- Final notice statuses are recomputed after every fan-out, pin propagation, and retry operation.
- Retry completion is derived from the final counters for the relevant fanout/pin operation, so terminal unresolved failures keep `complete: false`.
- Retry is idempotent because recipient feed documents and failure documents use deterministic IDs, and resolution is guarded by `resolved` state.

Operational trade-offs:

- Execution is at-least-once; idempotent document IDs make repeated processing safe.
- The lease is best-effort within one Firebase project, not a distributed consensus primitive.
- Permanent and max-attempt failures remain visible as unresolved records for operations review; there is no automatic deletion or reconciliation job.
- Firestore composite indexes are declared for unresolved/retryable collection-group queries and for pin propagation queries.
- The Pub/Sub emulator is not started by the current emulator scripts, so the scheduled trigger itself is not executed locally; tests invoke the retry helper directly.

## Pin propagation

Pin state is stored canonically on `projects/{projectId}/notices/{noticeId}`. Feed documents are updated idempotently through a collection-group query on `noticeId` and `projectId`. Each recipient transaction re-reads the canonical notice, so pin and unpin retries always use the latest canonical value. Missing feed documents are a no-op; if a notice is delivered later, fan-out writes the current canonical `pinned` value.

Failed propagation records use the same failure collection with `kind: pin`. Partial state is retryable when the underlying failure is transient. The canonical notice remains the source of truth.

## Read-count strategy

The single-document `readCount` counter on `projects/{projectId}/notices/{noticeId}` is retained. This is appropriate for the assignment's expected scale: reads are per buyer-notice pair, the feed document is the first-read gate, and no high-volume analytics are claimed.

`markNoticeRead` runs a transaction on the caller's `users/{uid}/feed/{noticeId}` document and increments `readCount` only when `readAt` transitions from `null` to a timestamp. Transaction retries use the returned transaction result rather than mutable transaction-local state, and concurrent calls for the same buyer are covered by emulator tests.

Limitation: all successful first reads for one notice serialize on the same canonical notice document. At much larger scale this becomes a Firestore write-contention hotspot; sharded counters or aggregation would be the next step. They are not introduced here.

## Security rules

Rules default-deny, require authentication, and derive authorization from membership documents in the path's project. Buyers can read only their own user/feed documents. Builders can read only their authorized project's supporting data. All notice, invite, membership, role, counter, failure, and client feed writes from clients are denied; top-level `invites/{codeHash}` is never readable or writable by clients. Admin SDK operations bypass rules and are authorized inside Functions.

## Emulator testing

Backend tests invoke the v2 callable `.run()` handlers against the Firestore emulator with mocked Auth contexts. Security-rule tests use `@firebase/rules-unit-testing` against the same emulator. Retry helpers and failure records are tested directly. Tests never use real credentials or a real Firebase project.

Run:

```bash
npm run build:functions
npm run test:backend
```

Exact individual scripts are defined in root `package.json`.

## Deferred work

- CSV import and invite generation callables.
- Builder unread-buyer query callables.
- Reconciliation jobs for terminal failures and counter drift.
- Pagination beyond simple collection reads for very large projects.
- Client feature screens and callable wrappers.
