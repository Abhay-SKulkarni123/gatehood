import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarkNoticeReadResult } from '@/types/domain';
import {
  enqueueRead,
  loadReadQueue,
  parseReadQueue,
  removeQueuedRead,
  replayReadQueue,
} from '@/lib/offline/read-queue';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

function result(noticeId: string): MarkNoticeReadResult {
  return { noticeId, read: true, readAt: '2026-01-01T00:00:00.000Z', readCount: 1 };
}

let store: Map<string, string>;

beforeEach(() => {
  store = new Map<string, string>();
  mockGetItem.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockSetItem.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  mockRemoveItem.mockImplementation(async (key: string) => {
    store.delete(key);
  });
});

test('read queue parser removes malformed entries and duplicates', () => {
  expect(
    parseReadQueue([
      { projectId: 'project-1', noticeId: 'notice-1' },
      { projectId: 'project-1', noticeId: 'notice-1' },
      { projectId: 'project-2', noticeId: 'notice-1' },
      { projectId: '', noticeId: 'notice-2' },
      { projectId: 'project-1' },
      null,
      'notice-3',
    ]),
  ).toEqual([
    { projectId: 'project-1', noticeId: 'notice-1' },
    { projectId: 'project-2', noticeId: 'notice-1' },
  ]);
  expect(parseReadQueue({ projectId: 'project-1', noticeId: 'notice-1' })).toEqual([]);
});

test('read queue is scoped by uid and project and deduplicates pending reads', async () => {
  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  await enqueueRead('buyer-2', 'project-1', 'notice-1');
  await enqueueRead('buyer-1', 'project-2', 'notice-1');

  expect(store.has('gatehood:offline-reads:v1:buyer-1')).toBe(true);
  expect(store.has('gatehood:offline-reads:v1:buyer-2')).toBe(true);
  expect(await loadReadQueue('buyer-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-1' },
    { projectId: 'project-2', noticeId: 'notice-1' },
  ]);
  expect(await loadReadQueue('buyer-1', 'project-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-1' },
  ]);
  expect(await loadReadQueue('buyer-1', 'project-3')).toEqual([]);
});

test('removing a queued read only affects the matching uid, project, and notice', async () => {
  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  await enqueueRead('buyer-1', 'project-1', 'notice-2');
  await enqueueRead('buyer-1', 'project-2', 'notice-1');
  await enqueueRead('buyer-2', 'project-1', 'notice-1');

  await removeQueuedRead('buyer-1', 'project-1', 'notice-1');

  expect(await loadReadQueue('buyer-1', 'project-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-2' },
  ]);
  expect(await loadReadQueue('buyer-1', 'project-2')).toEqual([
    { projectId: 'project-2', noticeId: 'notice-1' },
  ]);
  expect(await loadReadQueue('buyer-2', 'project-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-1' },
  ]);

  await removeQueuedRead('buyer-1', 'project-1', 'notice-2');
  expect(await loadReadQueue('buyer-1', 'project-1')).toEqual([]);
  expect(store.has('gatehood:offline-reads:v1:buyer-1')).toBe(true);
});

test('replay processes a bounded batch, removes confirmed reads, and retains failures', async () => {
  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  await enqueueRead('buyer-1', 'project-1', 'notice-2');
  await enqueueRead('buyer-1', 'project-1', 'notice-3');
  await enqueueRead('buyer-1', 'project-2', 'notice-4');

  const call = jest.fn(async (data: { projectId: string; noticeId: string }) => {
    if (data.noticeId === 'notice-2') {
      throw new Error('UNAVAILABLE');
    }
    return result(data.noticeId);
  });

  const summary = await replayReadQueue('buyer-1', 'project-1', call, 2);

  expect(summary).toEqual({
    processed: 2,
    succeeded: 1,
    failed: 1,
    pending: 2,
    skipped: false,
  });
  expect(call).toHaveBeenCalledTimes(2);
  expect(call).toHaveBeenCalledWith({ projectId: 'project-1', noticeId: 'notice-1' });
  expect(call).toHaveBeenCalledWith({ projectId: 'project-1', noticeId: 'notice-2' });
  expect(call).not.toHaveBeenCalledWith({ projectId: 'project-2', noticeId: 'notice-4' });
  expect(await loadReadQueue('buyer-1', 'project-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-2' },
    { projectId: 'project-1', noticeId: 'notice-3' },
  ]);
});

test('replay treats already-read callable responses as success and skips concurrent replays', async () => {
  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const call = jest.fn(async (data: { noticeId: string }) => {
    await gate;
    return { ...result(data.noticeId), read: false };
  });

  const first = replayReadQueue('buyer-1', 'project-1', call);
  const skipped = await replayReadQueue('buyer-1', 'project-1', call);
  release();
  const completed = await first;

  expect(skipped).toMatchObject({ processed: 0, skipped: true });
  expect(completed).toMatchObject({ succeeded: 1, failed: 0, pending: 0 });
  expect(await loadReadQueue('buyer-1', 'project-1')).toEqual([]);
});

test('storage read failures propagate so the provider can report pending sync', async () => {
  mockGetItem.mockRejectedValueOnce(new Error('UNAVAILABLE'));

  await expect(loadReadQueue('buyer-1')).rejects.toThrow('UNAVAILABLE');
});

test('malformed persisted queue data is safe to load and is replaced on next enqueue', async () => {
  store.set('gatehood:offline-reads:v1:buyer-1', '{not-json');

  await expect(loadReadQueue('buyer-1')).resolves.toEqual([]);

  await enqueueRead('buyer-1', 'project-1', 'notice-1');
  expect(await loadReadQueue('buyer-1')).toEqual([
    { projectId: 'project-1', noticeId: 'notice-1' },
  ]);
});
