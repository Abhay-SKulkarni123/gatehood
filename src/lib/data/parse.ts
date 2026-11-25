import type {
  BuyerContactDoc,
  FeedEntryDoc,
  FirestoreTimestamp,
  NoticeDoc,
  ProjectDoc,
  TowerDoc,
  UnitDoc,
} from '@/types/domain';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number' &&
    typeof value.toDate === 'function' &&
    typeof value.toMillis === 'function'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isProjectDoc(value: unknown, id: string): value is ProjectDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === id &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.createdByUid) &&
    isFirestoreTimestamp(value.createdAt)
  );
}

export function isTowerDoc(value: unknown, id: string): value is TowerDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === id &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.name) &&
    isFirestoreTimestamp(value.createdAt)
  );
}

export function isUnitDoc(value: unknown, id: string): value is UnitDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === id &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.towerId) &&
    isNonEmptyString(value.label) &&
    isFirestoreTimestamp(value.createdAt)
  );
}

export function isBuyerContactDoc(value: unknown, id: string): value is BuyerContactDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === id &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.towerId) &&
    isNonEmptyString(value.unitId) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.phone) &&
    isNonEmptyString(value.importedByUid) &&
    isFirestoreTimestamp(value.importedAt) &&
    isFirestoreTimestamp(value.updatedAt)
  );
}

export function isNoticeDoc(value: unknown, id: string): value is NoticeDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.id === id &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.body) &&
    ['project', 'tower', 'unit'].includes(String(value.audienceType)) &&
    isStringArray(value.audienceTowerIds) &&
    isStringArray(value.audienceUnitIds) &&
    typeof value.pinned === 'boolean' &&
    isNonEmptyString(value.createdByUid) &&
    isFirestoreTimestamp(value.createdAt) &&
    isFirestoreTimestamp(value.updatedAt) &&
    isNonNegativeNumber(value.audienceCount) &&
    isNonNegativeNumber(value.readCount) &&
    ['pending', 'processing', 'complete', 'partial', 'failed'].includes(String(value.fanoutStatus)) &&
    isNonNegativeNumber(value.fanoutFailedCount) &&
    ['complete', 'partial', 'failed'].includes(String(value.pinStatus)) &&
    isNonNegativeNumber(value.pinFailedCount)
  );
}

export function isFeedEntryDoc(value: unknown, uid: string, noticeId: string): value is FeedEntryDoc {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.uid === uid &&
    value.noticeId === noticeId &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.body) &&
    typeof value.pinned === 'boolean' &&
    isFirestoreTimestamp(value.deliveredAt) &&
    isFirestoreTimestamp(value.updatedAt) &&
    (value.readAt === null || isFirestoreTimestamp(value.readAt))
  );
}

export function isNullableString(value: unknown): value is string | null {
  return isNullableNonEmptyString(value);
}
