import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getWebFirestore } from '@/lib/firebase/web-firestore';
import { subscribeBuyerFeedListener } from '@/lib/data/buyer-feed.web';
import type { FeedEntryDoc, FirestoreTimestamp } from '@/types/domain';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((firestore, ...pathSegments) => ({
    kind: 'collection',
    firestore,
    pathSegments,
  })),
  where: jest.fn((field, operator, value) => ({ kind: 'where', field, operator, value })),
  orderBy: jest.fn((field, direction) => ({ kind: 'orderBy', field, direction })),
  limit: jest.fn((value) => ({ kind: 'limit', value })),
  query: jest.fn((...parts) => ({ kind: 'query', parts })),
  onSnapshot: jest.fn(),
}));

jest.mock('@/lib/firebase/web-firestore', () => ({
  getWebFirestore: jest.fn(() => ({ kind: 'full-web-firestore' })),
}));

const mockCollection = collection as jest.Mock;
const mockWhere = where as jest.Mock;
const mockOrderBy = orderBy as jest.Mock;
const mockLimit = limit as jest.Mock;
const mockQuery = query as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;
const mockGetWebFirestore = getWebFirestore as jest.Mock;

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

describe('web buyer feed listener', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetWebFirestore.mockReturnValue({ kind: 'full-web-firestore' });
    mockCollection.mockImplementation((firestore, ...pathSegments) => ({
      kind: 'collection',
      firestore,
      pathSegments,
    }));
    mockWhere.mockImplementation((field, operator, value) => ({
      kind: 'where',
      field,
      operator,
      value,
    }));
    mockOrderBy.mockImplementation((field, direction) => ({
      kind: 'orderBy',
      field,
      direction,
    }));
    mockLimit.mockImplementation((value) => ({ kind: 'limit', value }));
    mockQuery.mockImplementation((...parts) => ({ kind: 'query', parts }));
  });

  it('subscribes through the full Firestore SDK with the native query semantics', () => {
    const unsubscribe = jest.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const stop = subscribeBuyerFeedListener(
      {} as never,
      'buyer-1',
      'project-1',
      15,
      jest.fn(),
      jest.fn(),
    );

    expect(mockGetWebFirestore).toHaveBeenCalledTimes(1);
    expect(mockCollection).toHaveBeenCalledWith(
      { kind: 'full-web-firestore' },
      'users',
      'buyer-1',
      'feed',
    );
    expect(mockWhere).toHaveBeenCalledWith('projectId', '==', 'project-1');
    expect(mockOrderBy).toHaveBeenNthCalledWith(1, 'pinned', 'desc');
    expect(mockOrderBy).toHaveBeenNthCalledWith(2, 'deliveredAt', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(15);
    expect(mockQuery).toHaveBeenCalledWith(
      mockCollection.mock.results[0].value,
      mockWhere.mock.results[0].value,
      mockOrderBy.mock.results[0].value,
      mockOrderBy.mock.results[1].value,
      mockLimit.mock.results[0].value,
    );
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      mockQuery.mock.results[0].value,
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    );
    expect(stop).toBe(unsubscribe);
  });

  it('validates, deduplicates, sorts, and reports metadata from full SDK snapshots', () => {
    let onNext: ((snapshot: unknown) => void) | undefined;
    const onResult = jest.fn();
    mockOnSnapshot.mockImplementation((_reference, _options, next) => {
      onNext = next;
      return jest.fn();
    });

    subscribeBuyerFeedListener({} as never, 'buyer-1', 'project-1', 15, onResult, jest.fn());

    onNext?.({
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
    expect(onResult.mock.calls[0][0]).toMatchObject({ hasMore: false, fromCache: true });
    expect(
      (onResult.mock.calls[0][0].entries as FeedEntryDoc[]).map((entry) => entry.noticeId),
    ).toEqual(['pinned', 'newer', 'older']);
  });

  it('forwards listener errors and cleans up the subscription', () => {
    let onError: ((error: unknown) => void) | undefined;
    const unsubscribe = jest.fn();
    const errorCallback = jest.fn();
    mockOnSnapshot.mockImplementation((_reference, _options, _next, error) => {
      onError = error;
      return unsubscribe;
    });

    const stop = subscribeBuyerFeedListener(
      {} as never,
      'buyer-1',
      'project-1',
      15,
      jest.fn(),
      errorCallback,
    );
    const failure = new Error('listener failed');

    onError?.(failure);
    stop();

    expect(errorCallback).toHaveBeenCalledWith(failure);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
