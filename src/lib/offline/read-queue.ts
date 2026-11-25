import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarkNoticeReadData, MarkNoticeReadResult } from '@/types/domain';

export type QueuedRead = {
  projectId: string;
  noticeId: string;
};

export type ReadReplayResult = {
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
  skipped: boolean;
};

export type ReadReplayCaller = (data: MarkNoticeReadData) => Promise<MarkNoticeReadResult>;

const STORAGE_PREFIX = 'gatehood:offline-reads:v1:';
const DEFAULT_REPLAY_BATCH_SIZE = 5;
const replaying = new Set<string>();

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

function isQueuedRead(value: unknown): value is QueuedRead {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<QueuedRead>;
  return (
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    typeof candidate.noticeId === 'string' &&
    candidate.noticeId.length > 0
  );
}

function itemKey(item: QueuedRead): string {
  return `${item.projectId}\u0000${item.noticeId}`;
}

export function parseReadQueue(value: unknown): QueuedRead[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const queue: QueuedRead[] = [];
  value.forEach((candidate) => {
    if (!isQueuedRead(candidate)) {
      return;
    }
    const key = itemKey(candidate);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    queue.push({ projectId: candidate.projectId, noticeId: candidate.noticeId });
  });
  return queue;
}

export async function loadReadQueue(uid: string, projectId?: string): Promise<QueuedRead[]> {
  const stored = await AsyncStorage.getItem(storageKey(uid));
  let queue: QueuedRead[];
  try {
    queue = parseReadQueue(stored ? JSON.parse(stored) : []);
  } catch {
    queue = [];
  }
  return projectId ? queue.filter((item) => item.projectId === projectId) : queue;
}

export async function enqueueRead(uid: string, projectId: string, noticeId: string): Promise<void> {
  const queue = await loadReadQueue(uid);
  const item: QueuedRead = { projectId, noticeId };
  if (queue.some((queued) => itemKey(queued) === itemKey(item))) {
    return;
  }
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify([...queue, item]));
}

export async function removeQueuedRead(
  uid: string,
  projectId: string,
  noticeId: string,
): Promise<void> {
  const queue = await loadReadQueue(uid);
  const remaining = queue.filter(
    (item) => item.projectId !== projectId || item.noticeId !== noticeId,
  );
  if (remaining.length === queue.length) {
    return;
  }
  if (remaining.length === 0) {
    await AsyncStorage.removeItem(storageKey(uid));
    return;
  }
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(remaining));
}

export async function replayReadQueue(
  uid: string,
  projectId: string,
  call: ReadReplayCaller,
  batchSize = DEFAULT_REPLAY_BATCH_SIZE,
): Promise<ReadReplayResult> {
  if (replaying.has(uid)) {
    const pending = (await loadReadQueue(uid, projectId)).length;
    return { processed: 0, succeeded: 0, failed: 0, pending, skipped: true };
  }

  replaying.add(uid);
  try {
    const batch = (await loadReadQueue(uid, projectId)).slice(0, Math.max(1, batchSize));
    let succeeded = 0;
    let failed = 0;

    for (const item of batch) {
      try {
        await call({ projectId: item.projectId, noticeId: item.noticeId });
        await removeQueuedRead(uid, item.projectId, item.noticeId);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }

    const pending = (await loadReadQueue(uid, projectId)).length;
    return { processed: batch.length, succeeded, failed, pending, skipped: false };
  } finally {
    replaying.delete(uid);
  }
}
