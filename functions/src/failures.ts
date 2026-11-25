import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';
import { MAX_RETRY_ATTEMPTS, RETRY_BATCH_LIMIT } from './config';
import type { FanoutFailureDoc, FailureKind, NoticeDoc } from './domain/types';
import { isPermanentError, noticeNotFound } from './errors';
import { db, timestampNow } from './firestore';
import { paths } from './paths';
import { safeFailureReason } from './security';
import { parseFailure, parseNotice, toRecord } from './validation';

interface ListFailuresOptions {
  noticeId?: string;
  projectId?: string;
  retryableOnly?: boolean;
  limit?: number;
}

function parseFailureSnapshot(snapshot: DocumentSnapshot): FanoutFailureDoc {
  return parseFailure(toRecord(snapshot.data()));
}

function parseNoticeSnapshot(snapshot: DocumentSnapshot, noticeId: string): NoticeDoc {
  if (!snapshot.exists) {
    throw noticeNotFound();
  }
  return parseNotice({ ...toRecord(snapshot.data()), id: noticeId });
}

export function failureId(noticeId: string, uid: string, kind: FailureKind): string {
  return `${kind}_${noticeId}_${uid}`;
}

function countField(kind: FailureKind): 'fanoutFailedCount' | 'pinFailedCount' {
  return kind === 'pin' ? 'pinFailedCount' : 'fanoutFailedCount';
}

function statusField(kind: FailureKind): 'fanoutStatus' | 'pinStatus' {
  return kind === 'pin' ? 'pinStatus' : 'fanoutStatus';
}

function statusForCount(count: number): 'complete' | 'partial' {
  return count === 0 ? 'complete' : 'partial';
}

export function isRetryableFailure(error: unknown): boolean {
  return !isPermanentError(error);
}

export async function recordFailure(
  notice: NoticeDoc,
  uid: string,
  kind: FailureKind,
  error: unknown,
): Promise<void> {
  const id = failureId(notice.id, uid, kind);
  const failureRef = db.doc(paths.failure(notice.projectId, id));
  const noticeRef = db.doc(paths.notice(notice.projectId, notice.id));
  const now = timestampNow();
  const reason = safeFailureReason(error);
  const errorRetryable = isRetryableFailure(error);

  await db.runTransaction(async (transaction) => {
    const failureSnapshot = await transaction.get(failureRef);
    const noticeSnapshot = await transaction.get(noticeRef);
    const currentNotice = parseNoticeSnapshot(noticeSnapshot, notice.id);
    const existing = failureSnapshot.exists ? parseFailureSnapshot(failureSnapshot) : null;
    const unresolved = existing !== null && !existing.resolved;
    const shouldIncrement = existing === null || existing.resolved;
    const field = countField(kind);
    const nextCount = shouldIncrement ? currentNotice[field] + 1 : currentNotice[field];

    transaction.set(failureRef, {
      id,
      noticeId: notice.id,
      projectId: notice.projectId,
      uid,
      kind,
      reason,
      resolved: false,
      retryable: unresolved ? existing.retryable && errorRetryable : errorRetryable,
      attempts: unresolved ? existing.attempts : 0,
      lastAttemptAt: unresolved ? existing.lastAttemptAt : null,
      updatedAt: now,
    });

    transaction.update(noticeRef, {
      [field]: nextCount,
      [statusField(kind)]: statusForCount(nextCount),
      updatedAt: now,
    });
  });
}

export async function resolveFailure(failure: FanoutFailureDoc): Promise<void> {
  const failureRef = db.doc(paths.failure(failure.projectId, failure.id));
  const noticeRef = db.doc(paths.notice(failure.projectId, failure.noticeId));
  const now = timestampNow();

  await db.runTransaction(async (transaction) => {
    const failureSnapshot = await transaction.get(failureRef);
    if (!failureSnapshot.exists) {
      return;
    }

    const currentFailure = parseFailureSnapshot(failureSnapshot);
    if (currentFailure.resolved) {
      return;
    }

    const noticeSnapshot = await transaction.get(noticeRef);
    if (!noticeSnapshot.exists) {
      return;
    }

    const currentNotice = parseNoticeSnapshot(noticeSnapshot, currentFailure.noticeId);
    const field = countField(currentFailure.kind);
    const nextCount = Math.max(0, currentNotice[field] - 1);

    transaction.update(failureRef, { resolved: true, updatedAt: now });
    transaction.update(noticeRef, {
      [field]: nextCount,
      [statusField(currentFailure.kind)]: statusForCount(nextCount),
      updatedAt: now,
    });
  });
}

export async function beginRetryAttempt(failure: FanoutFailureDoc): Promise<FanoutFailureDoc | null> {
  const failureRef = db.doc(paths.failure(failure.projectId, failure.id));
  const now = timestampNow();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(failureRef);
    if (!snapshot.exists) {
      return null;
    }

    const current = parseFailureSnapshot(snapshot);
    if (current.resolved || !current.retryable) {
      return null;
    }

    const attempts = current.attempts + 1;
    const updated: FanoutFailureDoc = {
      ...current,
      attempts,
      retryable: attempts < MAX_RETRY_ATTEMPTS,
      lastAttemptAt: now,
      updatedAt: now,
    };

    transaction.update(failureRef, {
      attempts,
      retryable: updated.retryable,
      lastAttemptAt: now,
      updatedAt: now,
    });
    return updated;
  });
}

export async function markRetryFailure(failure: FanoutFailureDoc, error: unknown): Promise<void> {
  const failureRef = db.doc(paths.failure(failure.projectId, failure.id));
  const now = timestampNow();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(failureRef);
    if (!snapshot.exists) {
      return;
    }

    const current = parseFailureSnapshot(snapshot);
    if (current.resolved) {
      return;
    }

    transaction.update(failureRef, {
      retryable: current.retryable && !isPermanentError(error) && current.attempts < MAX_RETRY_ATTEMPTS,
      reason: safeFailureReason(error),
      updatedAt: now,
    });
  });
}

export async function listUnresolvedFailures(
  options: ListFailuresOptions = {},
): Promise<FanoutFailureDoc[]> {
  let query: Query = db.collectionGroup('fanoutFailures');
  query = query.where('resolved', '==', false);

  if (options.retryableOnly) {
    query = query.where('retryable', '==', true);
  }
  if (options.noticeId) {
    query = query.where('noticeId', '==', options.noticeId);
  }
  if (options.projectId) {
    query = query.where('projectId', '==', options.projectId);
  }
  if (options.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(parseFailureSnapshot);
}

export async function refreshNoticeStatus(projectId: string, noticeId: string): Promise<void> {
  const noticeRef = db.doc(paths.notice(projectId, noticeId));
  const now = timestampNow();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(noticeRef);
    if (!snapshot.exists) {
      return;
    }

    const current = parseNoticeSnapshot(snapshot, noticeId);
    const fanoutStatus = statusForCount(current.fanoutFailedCount);
    const pinStatus = statusForCount(current.pinFailedCount);

    if (current.fanoutStatus === fanoutStatus && current.pinStatus === pinStatus) {
      return;
    }

    transaction.update(noticeRef, {
      fanoutStatus,
      pinStatus,
      updatedAt: now,
    });
  });
}

export function retryFailureLimit(): number {
  return RETRY_BATCH_LIMIT;
}
