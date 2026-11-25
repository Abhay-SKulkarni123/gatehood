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
| `projects/{projectId}/towers/{towerId}` | Tower reference | `id`, `name`; imported IDs are deterministic from normalized name |
| `projects/{projectId}/units/{unitId}` | Unit reference | `id`, `towerId`, `label`; imported IDs are deterministic from tower and normalized label. Builder-maintained optional fields: `configuration`, `constructionProgress`, `possessionDate`, `updatedAt`, `updatedByUid` |
| `projects/{projectId}/buyerContacts/{contactId}` | Builder-only imported contact detail | Doc ID is deterministic from normalized phone; `towerId`, `unitId`, `name`, `phone`, `importedByUid`, `importedAt`, `updatedAt` |
| `projects/{projectId}/inviteSlots/{unitId}` | Per-unit invite idempotency slot | Doc ID is unit ID; stores current `codeHash`, `expiresAt`, `usedAt`, `revokedAt`; never readable or writable by clients |
| `invites/{codeHash}` | Single-use invite | Doc ID is SHA-256 of normalized code; `codeHash`, `projectId`, `towerId`, `unitId`, `expiresAt`, `usedAt`, `usedByUid`, `revokedAt` |
| `projects/{projectId}/notices/{noticeId}` | Canonical notice and counters | `audienceType`, `audienceTowerIds`, `audienceUnitIds`, `pinned`, `audienceCount`, `readCount`, `fanoutStatus`, `pinStatus`, `fanoutFailedCount`, `pinFailedCount` |
| `users/{uid}/feed/{noticeId}` | Recipient-specific denormalized notice | Doc ID is canonical notice ID; required fields listed below |
| `projects/{projectId}/fanoutFailures/{kind_noticeId_uid}` | Recoverable propagation failure | Stable ID includes operation kind; `kind`, `resolved`, `retryable`, `attempts`, `lastAttemptAt`, `reason`, `updatedAt` |
| `_system/fanoutRetryLock` | Scheduled retry lease | `owner`, `expiresAtMs`, `updatedAtMs` |

Timestamps are Firestore `Timestamp` values except the retry lease, which uses epoch milliseconds. Buyer feed documents are the authoritative read-state records for that buyer and notice.

### Feed document schema

Every feed creation path writes these fields:

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
audienceType: 'project' | 'tower' | 'unit'
audienceTowerIds: string[]
audienceUnitIds: string[]
```

Feed entries created before Phase 5 may omit the three audience fields. Parsers accept those legacy entries so existing deliveries remain readable; targeted buyer filters hide entries with unknown audience metadata instead of guessing. New fan-out and updates write audience fields from the canonical notice.

`readAt` is written as `null` on creation and only changed by `markNoticeRead`. Pin propagation updates only `pinned` and `updatedAt`. Fan-out updates `title`, `body`, `pinned`, and `updatedAt` when canonical mutable fields change. Pin queries use both `noticeId` and `projectId`; the recipient UID is derived from the `users/{uid}/feed/{noticeId}` path, not the stored `uid` field, so malformed or stale feed fields cannot redirect propagation. `markNoticeRead` validates both fields against the caller's feed document.

## Callables

All callables are Firebase Functions v2 `onCall` handlers in the configured region with App Check enforcement enabled.

| Function | Responsibility |
|---|---|
| `redeemInvite` | Validate/normalize code, hash it, transactionally consume it and create buyer membership, then idempotently backfill eligible notices |
| `importBuyers` | Authorize builder, validate `Tower,Unit,Name,Phone` CSV, and preview/commit bounded all-or-nothing tower, unit, and contact writes |
| `generateInvite` | Authorize builder, reuse an active invite per unit, or explicitly regenerate and revoke the previous code |
| `createNotice` | Authorize builder, validate audience, persist canonical notice, then idempotently fan out to eligible buyers |
| `setNoticePinned` | Authorize builder, update canonical notice pinned state, then idempotently propagate to feed entries |
| `markNoticeRead` | Authorize buyer, verify own feed entry, set first `readAt`, and increment canonical `readCount` once |
| `getNoticeReadStatus` | Authorize builder and return canonical totals plus paginated, audience-filtered recipient samples |
| `updateUnitInfo` | Authorize builder, validate `configuration`, progress `0–100`, and a `YYYY-MM-DD` possession date, then update that project's unit |

Internal fan-out and retry helpers are not callable endpoints.

## Invite redemption

1. Normalize code by trimming whitespace, removing spaces/hyphens, and uppercasing.
2. Reject strings that are not 12-64 alphanumeric characters.
3. Compute SHA-256 hex hash. The hash is the invite document ID and `codeHash` field; plaintext is never stored or logged.
4. In one transaction on `invites/{codeHash}`:
   - when the caller supplies `expectedProjectId`, reject an invite from a different project before creating membership;
   - verify project, tower, and unit exist, and parse the referenced tower and unit to verify they belong to the same project;
   - verify expiry and unused state;
   - if the caller already has a membership, allow retry only when the invite was used by the same UID;
   - create `members/{uid}` with role `buyer`;
   - mark the invite used.
5. Backfill eligible existing notices through the same recipient-level fan-out helper used for new notices.

Invalid, expired, revoked, and already-used codes return the same safe `invalid-argument` message to prevent enumeration.

## Buyer CSV import

`importBuyers` accepts `Tower,Unit,Name,Phone` CSV with common header aliases. The client validates headers, row shape, phone syntax, duplicate tower/unit pairs, and duplicate phones before callable preview/commit. The backend repeats validation, caps rows/writes at the Firestore batch limit, reuses tower/unit documents by normalized name/label, and rejects conflicting existing names. Contact documents use deterministic IDs derived from normalized phone, so an identical re-import reports `unchanged` without rewriting data. Preview never writes; commit is all-or-nothing. Only builders can read `buyerContacts`, and no contact detail is copied into buyer feed documents.

## Invite generation

`generateInvite` uses a transactional slot per unit. Without `regenerate`, repeated calls return the existing active invite with `code: null` and `codeAvailable: false`; plaintext is deliberately not recoverable because only a hash is stored. With `regenerate: true`, the previous active invite is marked `revokedAt` in the same transaction that creates the new invite and slot, so the old code fails redemption immediately. Random-code collisions are retried with a fixed attempt bound.

## Buyer experience completion

Invite redemption reuses the authenticated `redeemInvite` callable. The client blocks duplicate submissions while a redeem call is in flight, validates empty/malformed codes locally, distinguishes safe invalid/expired/used errors from retryable network errors, and calls `retry()` on `MembershipProvider` after a successful redemption. Same-user redemption remains idempotent; a cross-project code is rejected when the client-supplied expected project does not match the invite.

Unit details are optional fields on `projects/{projectId}/units/{unitId}` so imported units remain valid. Only builders can update them through the App Check-enforced `updateUnitInfo` callable, which authorizes the caller's project, verifies the unit/tower, validates progress and date input, and writes a server timestamp. Buyers read only their assigned unit document; unavailable fields render as explicit unavailable states. Possession-day counts use calendar-day arithmetic, not a continuously changing countdown.

Buyer notices use a realtime subscription to the caller's own `users/{uid}/feed` collection. The query restricts `projectId` to the configured construction project, orders by `pinned` descending then `deliveredAt` descending, and uses a growing 15-document limit; Load more raises that limit by 15 and replaces the single active listener. A composite `COLLECTION` index on `feed` covers `projectId ASC`, `pinned DESC`, `deliveredAt DESC`. Snapshot documents are validated against the caller UID and project ID, deduplicated by notice ID, and sorted client-side. All, My Tower, and My Unit filters run in memory on those delivered entries. Targeted filters require canonical audience metadata copied during fan-out; legacy entries without metadata are excluded from targeted filters. Feed documents predating the required `pinned`/`deliveredAt` fields are not returned by the ordered query; no inference or synthetic ordering is attempted. No client query can read another buyer's feed or a canonical notice directly.

Firestore native persistence is explicitly initialized with `persistence: true`. The feed listener requests metadata changes and labels cached snapshots from `metadata.fromCache`; there is no second AsyncStorage feed cache. Listener errors preserve already-loaded entries and expose retry. Auth or project changes reset the limit and feed state; ordinary realtime updates do not.

Offline read actions are stored in AsyncStorage under a per-UID key, with each queued item carrying its project ID and notice ID. Queues are deduplicated, scoped to the active UID/project during replay, and replayed in bounded batches through the App Check-enforced `markNoticeRead` callable on connectivity restoration, app foreground, and authenticated session initialization. A module-level per-UID lock prevents concurrent replay. Successful or already-read callable responses remove the item; failed calls leave it pending. The UI distinguishes unread, Pending sync, and server-confirmed Read states, and does not treat locally queued reads as confirmed. Sign-out does not delete another user's queue.

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

`markNoticeRead` runs a transaction on the caller's `users/{uid}/feed/{noticeId}` document and increments `readCount` only when `readAt` transitions from `null` to a timestamp. Transaction retries use the returned transaction result rather than mutable transaction-local state, and concurrent calls for the same buyer are covered by emulator tests. Offline replays call the same trusted callable, so an already-read response is equivalent to success without another counter increment; a temporary callable failure leaves the queue item pending and the feed read state unchanged.

Limitation: all successful first reads for one notice serialize on the same canonical notice document. At much larger scale this becomes a Firestore write-contention hotspot; sharded counters or aggregation would be the next step. They are not introduced here.

## Builder read status

`getNoticeReadStatus` returns `audienceCount` and `readCount` from the canonical notice as the authoritative totals. Recipient detail is a sample: membership documents are read by document ID in pages of 200, filtered by notice audience before feed documents are fetched, and capped at 200 recipients with a 10-page maximum. When the sample is incomplete, `truncated: true` and sample counters are explicitly separate from canonical totals. This prevents a targeted audience beyond the first membership page from being misreported as unread or empty.

## Security rules

Rules default-deny, require authentication, and derive authorization from membership documents in the path's project. Buyers can read only their own user/feed documents and their assigned unit document. Builders can read all supporting data in their authorized project, including `buyerContacts`; buyers cannot read those contact documents. `projects/{projectId}/inviteSlots/{unitId}` and top-level `invites/{codeHash}` are never readable or writable by clients. All notice, invite, membership, role, counter, failure, contact, and client feed writes from clients are denied. Admin SDK operations bypass rules and are authorized inside Functions.

## Emulator testing

Backend tests invoke the v2 callable `.run()` handlers against the Firestore emulator with mocked Auth contexts. Security-rule tests use `@firebase/rules-unit-testing` against the same emulator. Retry helpers and failure records are tested directly. Tests never use real credentials or a real Firebase project.

Run:

```bash
npm run build:functions
npm run test:backend
```

Exact individual scripts are defined in root `package.json`.

## Deferred work

The following were deferred by Phase 2. Buyer CSV import, invite generation, builder read-status retrieval, and client feature screens/callable wrappers were later added in Phase 4.

- Reconciliation jobs for terminal failures and counter drift.
- Fully paginated UI for very large recipient lists; the current builder read-status endpoint returns a bounded sample.
- Manual native-device verification of offline cache and connectivity replay; Phase 6 coverage is via Jest mocks and emulator tests.
