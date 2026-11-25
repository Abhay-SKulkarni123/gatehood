import type { DocumentSnapshot } from 'firebase-admin/firestore';
import {
  FANOUT_CHUNK_SIZE,
  FANOUT_CONCURRENCY,
  RETRY_BATCH_LIMIT,
  RETRY_CONCURRENCY,
  TRANSIENT_ATTEMPTS,
} from './config';
import { mapWithConcurrency } from './concurrency';
import type {
  FanoutFailureDoc,
  FanoutStats,
  FailureKind,
  MembershipDoc,
  NoticeDoc,
  RetryRunResult,
} from './domain/types';
import { delay, isTransientError, noticeNotFound } from './errors';
import {
  beginRetryAttempt,
  listUnresolvedFailures,
  markRetryFailure,
  recordFailure,
  refreshNoticeStatus,
  resolveFailure,
} from './failures';
import { db, incrementBy, timestampNow } from './firestore';
import { paths } from './paths';
import { parseFeedEntry, parseMembership, parseNotice, toRecord } from './validation';

interface RecipientResult {
  created: number;
  updated: number;
}

function parseDocument<T>(
  snapshot: DocumentSnapshot,
  parser: (value: unknown) => T,
  id?: string,
): T {
  if (!snapshot.exists) {
    throw new Error('Document does not exist');
  }
  const data = toRecord(snapshot.data());
  return parser(id ? { ...data, id } : data);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function isRecipientEligible(membership: MembershipDoc, notice: NoticeDoc): boolean {
  if (membership.role !== 'buyer' || membership.projectId !== notice.projectId) {
    return false;
  }

  if (notice.audienceType === 'project') {
    return true;
  }

  if (notice.audienceType === 'tower') {
    return membership.towerId !== null && notice.audienceTowerIds.includes(membership.towerId);
  }

  return membership.unitId !== null && notice.audienceUnitIds.includes(membership.unitId);
}

export async function getNotice(projectId: string, noticeId: string): Promise<NoticeDoc> {
  const snapshot = await db.doc(paths.notice(projectId, noticeId)).get();
  if (!snapshot.exists) {
    throw noticeNotFound();
  }
  return parseDocument(snapshot, parseNotice, noticeId);
}

async function processRecipient(notice: NoticeDoc, uid: string): Promise<RecipientResult> {
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await db.runTransaction(async (transaction) => {
        const feedRef = db.doc(paths.feed(uid, notice.id));
        const noticeRef = db.doc(paths.notice(notice.projectId, notice.id));
        const feedSnapshot = await transaction.get(feedRef);
        const noticeSnapshot = await transaction.get(noticeRef);
        const currentNotice = parseDocument(noticeSnapshot, parseNotice, notice.id);
        const now = timestampNow();

        if (feedSnapshot.exists) {
          const feed = parseDocument(feedSnapshot, parseFeedEntry);
          if (
            feed.title === currentNotice.title &&
            feed.body === currentNotice.body &&
            feed.pinned === currentNotice.pinned
          ) {
            return { created: 0, updated: 0 };
          }

          transaction.update(feedRef, {
            title: currentNotice.title,
            body: currentNotice.body,
            pinned: currentNotice.pinned,
            updatedAt: now,
          });
          return { created: 0, updated: 1 };
        }

        transaction.set(feedRef, {
          uid,
          noticeId: notice.id,
          projectId: notice.projectId,
          title: currentNotice.title,
          body: currentNotice.body,
          pinned: currentNotice.pinned,
          deliveredAt: now,
          updatedAt: now,
          readAt: null,
        });
        transaction.update(noticeRef, {
          audienceCount: incrementBy(1),
          updatedAt: now,
        });
        return { created: 1, updated: 0 };
      });
    } catch (error) {
      if (attempt === TRANSIENT_ATTEMPTS || !isTransientError(error)) {
        throw error;
      }
      await delay(attempt * 50);
    }
  }

  throw new Error('Fan-out retry exhausted');
}

async function processPinRecipient(uid: string, notice: NoticeDoc): Promise<number> {
  return db.runTransaction(async (transaction) => {
    const feedRef = db.doc(paths.feed(uid, notice.id));
    const noticeRef = db.doc(paths.notice(notice.projectId, notice.id));
    const feedSnapshot = await transaction.get(feedRef);
    const noticeSnapshot = await transaction.get(noticeRef);
    if (!feedSnapshot.exists) {
      return 0;
    }

    const currentNotice = parseDocument(noticeSnapshot, parseNotice, notice.id);
    const feed = parseDocument(feedSnapshot, parseFeedEntry);
    if (feed.pinned === currentNotice.pinned) {
      return 0;
    }

    transaction.update(feedRef, { pinned: currentNotice.pinned, updatedAt: timestampNow() });
    return 1;
  });
}

function emptyStats(attempted: number): FanoutStats {
  return {
    attempted,
    created: 0,
    updated: 0,
    failed: 0,
    complete: attempted === 0,
  };
}

function addResult(stats: FanoutStats, result: RecipientResult): void {
  stats.created += result.created;
  stats.updated += result.updated;
}

export async function fanOutToRecipients(
  notice: NoticeDoc,
  recipientUids: readonly string[],
  kind: Exclude<FailureKind, 'pin'>,
): Promise<FanoutStats> {
  const uids = Array.from(new Set(recipientUids));
  const stats = emptyStats(uids.length);
  await db.doc(paths.notice(notice.projectId, notice.id)).update({
    fanoutStatus: 'processing',
    updatedAt: timestampNow(),
  });

  for (const chunk of chunks(uids, FANOUT_CHUNK_SIZE)) {
    await mapWithConcurrency(chunk, FANOUT_CONCURRENCY, async (uid) => {
      try {
        addResult(stats, await processRecipient(notice, uid));
      } catch (error) {
        stats.failed += 1;
        await recordFailure(notice, uid, kind, error);
      }
    });
  }

  const outstanding = await listUnresolvedFailures({
    projectId: notice.projectId,
    noticeId: notice.id,
  });
  stats.complete = stats.failed === 0 && !outstanding.some((failure) => failure.kind !== 'pin');
  await refreshNoticeStatus(notice.projectId, notice.id);
  return stats;
}

export async function propagatePinToRecipients(
  notice: NoticeDoc,
  recipientUids: readonly string[],
): Promise<FanoutStats> {
  const uids = Array.from(new Set(recipientUids));
  const stats = emptyStats(uids.length);

  for (const chunk of chunks(uids, FANOUT_CHUNK_SIZE)) {
    await mapWithConcurrency(chunk, FANOUT_CONCURRENCY, async (uid) => {
      try {
        stats.updated += await processPinRecipient(uid, notice);
      } catch (error) {
        stats.failed += 1;
        await recordFailure(notice, uid, 'pin', error);
      }
    });
  }

  const outstanding = await listUnresolvedFailures({
    projectId: notice.projectId,
    noticeId: notice.id,
  });
  stats.complete = stats.failed === 0 && !outstanding.some((failure) => failure.kind === 'pin');
  await refreshNoticeStatus(notice.projectId, notice.id);
  return stats;
}

export async function eligibleBuyerUids(notice: NoticeDoc): Promise<string[]> {
  const snapshot = await db
    .collection(paths.members(notice.projectId))
    .where('role', '==', 'buyer')
    .get();

  return snapshot.docs
    .map((memberSnapshot) => parseMembership(toRecord(memberSnapshot.data())))
    .filter((membership) => isRecipientEligible(membership, notice))
    .map((membership) => membership.uid);
}

export async function eligibleNoticesForMembership(membership: MembershipDoc): Promise<NoticeDoc[]> {
  const snapshot = await db.collection(paths.notices(membership.projectId)).get();
  return snapshot.docs
    .map((noticeSnapshot) => parseDocument(noticeSnapshot, parseNotice, noticeSnapshot.id))
    .filter((notice) => isRecipientEligible(membership, notice));
}

export async function backfillBuyer(membership: MembershipDoc): Promise<FanoutStats> {
  const notices = await eligibleNoticesForMembership(membership);
  const stats = emptyStats(notices.length);

  for (const chunk of chunks(notices, FANOUT_CHUNK_SIZE)) {
    await mapWithConcurrency(chunk, FANOUT_CONCURRENCY, async (notice) => {
      const result = await fanOutToRecipients(notice, [membership.uid], 'backfill');
      stats.created += result.created;
      stats.updated += result.updated;
      stats.failed += result.failed;
    });
  }

  stats.complete = stats.failed === 0;
  return stats;
}

type RetryOutcome = 'skipped' | 'resolved' | 'failed';

interface RetryProcessingStats extends FanoutStats {
  resolved: number;
  skipped: number;
}

function emptyRetryStats(): RetryProcessingStats {
  return {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    complete: true,
    resolved: 0,
    skipped: 0,
  };
}

function uniqueFailures(failures: readonly FanoutFailureDoc[]): FanoutFailureDoc[] {
  return Array.from(new Map(failures.map((failure) => [failure.id, failure])).values());
}

function operationsForFailures(failures: readonly FanoutFailureDoc[]): {
  fanout: boolean;
  pin: boolean;
} {
  if (failures.length === 0) {
    return { fanout: true, pin: true };
  }

  let fanout = false;
  let pin = false;
  for (const failure of failures) {
    if (failure.kind === 'pin') {
      pin = true;
    } else {
      fanout = true;
    }
  }
  return { fanout, pin };
}

async function retryFailure(failure: FanoutFailureDoc, notice: NoticeDoc): Promise<RetryOutcome> {
  const attempt = await beginRetryAttempt(failure);
  if (!attempt) {
    return 'skipped';
  }

  try {
    if (attempt.kind === 'pin') {
      await processPinRecipient(attempt.uid, notice);
    } else {
      await processRecipient(notice, attempt.uid);
    }
    await resolveFailure(attempt);
    return 'resolved';
  } catch (error) {
    await markRetryFailure(attempt, error);
    return 'failed';
  }
}

async function retrySelectedFailures(
  projectId: string,
  noticeId: string,
  failures: readonly FanoutFailureDoc[],
): Promise<RetryProcessingStats> {
  const notice = await getNotice(projectId, noticeId);
  const selected = uniqueFailures(failures);
  const stats = emptyRetryStats();
  const operations = operationsForFailures(selected);

  await mapWithConcurrency(selected, RETRY_CONCURRENCY, async (failure) => {
    const outcome = await retryFailure(failure, notice);
    if (outcome === 'skipped') {
      stats.skipped += 1;
      return;
    }

    stats.attempted += 1;
    if (outcome === 'resolved') {
      stats.resolved += 1;
    } else {
      stats.failed += 1;
    }
  });

  await refreshNoticeStatus(projectId, noticeId);
  const final = await getNotice(projectId, noticeId);
  stats.complete =
    (!operations.fanout || final.fanoutFailedCount === 0) &&
    (!operations.pin || final.pinFailedCount === 0);
  return stats;
}

function toFanoutStats(stats: RetryProcessingStats): FanoutStats {
  return {
    attempted: stats.attempted,
    created: stats.created,
    updated: stats.updated,
    failed: stats.failed,
    complete: stats.complete,
  };
}

export async function retryNoticeFanout(
  projectId: string,
  noticeId: string,
  failures?: readonly FanoutFailureDoc[],
): Promise<FanoutStats> {
  const selected =
    failures ??
    (await listUnresolvedFailures({
      projectId,
      noticeId,
      retryableOnly: true,
    }));
  return toFanoutStats(await retrySelectedFailures(projectId, noticeId, selected));
}

export async function retryUnresolvedFailures(): Promise<RetryRunResult> {
  const failures = await listUnresolvedFailures({
    retryableOnly: true,
    limit: RETRY_BATCH_LIMIT,
  });
  const grouped = new Map<string, FanoutFailureDoc[]>();

  for (const failure of failures) {
    const key = `${failure.projectId}\u0000${failure.noticeId}`;
    const group = grouped.get(key);
    if (group) {
      group.push(failure);
    } else {
      grouped.set(key, [failure]);
    }
  }

  let resolved = 0;
  let failed = 0;
  for (const group of grouped.values()) {
    const first = group[0];
    const stats = await retrySelectedFailures(first.projectId, first.noticeId, group);
    resolved += stats.resolved;
    failed += stats.failed;
  }

  const outstanding = await listUnresolvedFailures({ limit: RETRY_BATCH_LIMIT });
  return {
    notices: grouped.size,
    failures: failures.length,
    resolved,
    failed,
    terminal: outstanding.filter((failure) => !failure.retryable).length,
  };
}
