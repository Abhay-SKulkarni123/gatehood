import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc, FirestoreTimestamp } from '@/types/domain';
import {
  createFeedListenerController,
  subscribeBuyerFeed,
} from '@/lib/data/buyer';
import {
  FEED_PAGE_SIZE,
  createFeedState,
  feedReducer,
  feedScopeKey,
  nextFeedLimit,
} from '@/lib/data/feed-state';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(() => 'feed-collection'),
  doc: jest.fn(),
  getDoc: jest.fn(),
  limit: jest.fn((value) => ({ limit: value })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn((field, direction) => ({ orderByField: field, direction })),
  query: jest.fn((...parts) => parts),
  where: jest.fn((field, operator, value) => ({ field, operator, value })),
}));

const mockCollection = collection as jest.Mock;
const mockLimit = firestoreLimit as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;
const mockOrderBy = orderBy as jest.Mock;
const mockWhere = where as jest.Mock;

const firestore = {} as Firestore;

function timestampAt(millis: number): FirestoreTimestamp {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

function feedDoc(noticeId: string, overrides: Record<string, unknown> = {}) {
  const value = {
    uid: 'buyer-1',
    noticeId,
    projectId: 'project-1',
    title: noticeId,
    body: 'Body',
    pinned: false,
    deliveredAt: timestampAt(1000),
    updatedAt: timestampAt(1000),
    readAt: null,
    audienceType: 'project',
    audienceTowerIds: [],
    audienceUnitIds: [],
    ...overrides,
  };
  return { id: noticeId, data: () => value };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockCollection.mockReturnValue('feed-collection');
  mockWhere.mockImplementation((field, operator, value) => ({ field, operator, value }));
  mockOrderBy.mockImplementation((field, direction) => ({ orderByField: field, direction }));
  mockLimit.mockImplementation((value) => ({ limit: value }));
  (query as jest.Mock).mockImplementation((...parts) => parts);
});

test('feed state starts bounded, grows by one page, and resets on scope change', () => {
  expect(feedScopeKey('buyer-1', 'project-1')).not.toBe(
    feedScopeKey('buyer-2', 'project-1'),
  );
  expect(feedScopeKey('buyer-1', 'project-1')).not.toBe(
    feedScopeKey('buyer-1', 'project-2'),
  );
  expect(nextFeedLimit(FEED_PAGE_SIZE)).toBe(30);

  const initial = createFeedState('scope-1');
  expect(initial.limit).toBe(15);
  expect(initial.loading).toBe(true);
  expect(initial.hasMore).toBe(true);

  const growing = feedReducer(initial, { type: 'loadMore' });
  expect(growing.limit).toBe(30);
  expect(growing.loadingMore).toBe(true);

  const firstEntry = feedDoc('notice-1', { deliveredAt: timestampAt(2000) }).data() as FeedEntryDoc;
  const snapshot = {
    entries: [firstEntry],
    hasMore: false,
    fromCache: true,
  };
  const loaded = feedReducer(growing, {
    type: 'snapshot',
    scopeKey: 'scope-1',
    snapshot,
  });
  expect(loaded).toMatchObject({
    limit: 30,
    loading: false,
    loadingMore: false,
    hasMore: false,
    fromCache: true,
  });
  expect(loaded.entries).toEqual([firstEntry]);

  expect(feedReducer(loaded, { type: 'loadMore' })).toBe(loaded);
  const stale = feedReducer(loaded, {
    type: 'error',
    scopeKey: 'scope-2',
    message: 'stale',
  });
  expect(stale).toBe(loaded);

  const errored = feedReducer(loaded, {
    type: 'error',
    scopeKey: 'scope-1',
    message: 'offline',
  });
  expect(errored.error).toBe('offline');
  expect(errored.entries).toEqual([firstEntry]);

  const retried = feedReducer(errored, { type: 'retry' });
  expect(retried.retryKey).toBe(1);
  expect(retried.loading).toBe(true);
  expect(retried.error).toBeNull();
  expect(retried.entries).toEqual([firstEntry]);

  const reset = feedReducer(retried, { type: 'scopeChanged', scopeKey: 'scope-2' });
  expect(reset).toMatchObject({
    scopeKey: 'scope-2',
    limit: 15,
    retryKey: 0,
    entries: [],
    loading: true,
    loadingMore: false,
    error: null,
  });
});

test('feed subscription uses bounded indexed query, rejects foreign docs, and reports cache state', () => {
  const listeners: {
    onNext?: (snapshot: {
      docs: ReturnType<typeof feedDoc>[];
      metadata: { fromCache: boolean };
    }) => void;
    onError?: (error: unknown) => void;
  } = {};
  const unsubscribe = jest.fn();
  mockOnSnapshot.mockImplementation((_reference, _options, onNext, onError) => {
    listeners.onNext = onNext;
    listeners.onError = onError;
    return unsubscribe;
  });

  const onResult = jest.fn();
  const onError = jest.fn();
  const stop = subscribeBuyerFeed(
    firestore,
    'buyer-1',
    'project-1',
    15,
    onResult,
    onError,
  );

  expect(mockCollection).toHaveBeenCalledWith(firestore, 'users', 'buyer-1', 'feed');
  expect(mockWhere).toHaveBeenCalledWith('projectId', '==', 'project-1');
  expect(mockOrderBy).toHaveBeenNthCalledWith(1, 'pinned', 'desc');
  expect(mockOrderBy).toHaveBeenNthCalledWith(2, 'deliveredAt', 'desc');
  expect(mockLimit).toHaveBeenCalledWith(15);
  expect(mockOnSnapshot).toHaveBeenCalledWith(
    expect.anything(),
    { includeMetadataChanges: true },
    expect.any(Function),
    expect.any(Function),
  );
  expect(stop).toBe(unsubscribe);

  listeners.onNext?.({
    docs: [
      feedDoc('older', { deliveredAt: timestampAt(1000) }),
      feedDoc('pinned', { pinned: true, deliveredAt: timestampAt(500) }),
      feedDoc('newer', { deliveredAt: timestampAt(2000) }),
      feedDoc('newer', { deliveredAt: timestampAt(2000) }),
      feedDoc('other-project', { projectId: 'project-2' }),
      feedDoc('wrong-uid', { uid: 'buyer-2' }),
    ],
    metadata: { fromCache: true },
  });

  expect(onResult).toHaveBeenCalledTimes(1);
  expect(onResult.mock.calls[0][0]).toMatchObject({
    hasMore: false,
    fromCache: true,
  });
  expect(
    (onResult.mock.calls[0][0].entries as FeedEntryDoc[]).map((entry) => entry.noticeId),
  ).toEqual(['pinned', 'newer', 'older']);

  listeners.onNext?.({
    docs: Array.from({ length: 15 }, (_, index) => feedDoc(`notice-${index}`)),
    metadata: { fromCache: false },
  });
  expect(onResult.mock.calls[1][0]).toMatchObject({
    hasMore: true,
    fromCache: false,
  });

  const failure = new Error('listener failed');
  listeners.onError?.(failure);
  expect(onError).toHaveBeenCalledWith(failure);
});

test('feed listener controller replaces old listener on limit change and stops on unmount', () => {
  const firstUnsubscribe = jest.fn();
  const secondUnsubscribe = jest.fn();
  mockOnSnapshot
    .mockReturnValueOnce(firstUnsubscribe)
    .mockReturnValueOnce(secondUnsubscribe);

  const controller = createFeedListenerController(
    firestore,
    'buyer-1',
    'project-1',
    jest.fn(),
    jest.fn(),
  );
  controller.start(15);
  controller.start(30);
  controller.stop();
  controller.stop();

  expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
  expect(mockLimit).toHaveBeenNthCalledWith(1, 15);
  expect(mockLimit).toHaveBeenNthCalledWith(2, 30);
  expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
  expect(secondUnsubscribe).toHaveBeenCalledTimes(1);
});
