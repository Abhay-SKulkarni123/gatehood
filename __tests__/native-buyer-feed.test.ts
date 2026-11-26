import { collection, limit, onSnapshot, orderBy, query, where } from '@react-native-firebase/firestore';
import { subscribeBuyerFeedListener } from '@/lib/data/buyer-feed.native';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(() => 'native-feed-collection'),
  where: jest.fn((field, operator, value) => ({ field, operator, value })),
  orderBy: jest.fn((field, direction) => ({ orderByField: field, direction })),
  limit: jest.fn((value) => ({ limit: value })),
  query: jest.fn((...parts) => parts),
  onSnapshot: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  query: jest.fn(),
  onSnapshot: jest.fn(),
}));

const nativeFirestore = jest.requireMock('@react-native-firebase/firestore');
const webFirestore = jest.requireMock('firebase/firestore');

describe('native buyer feed listener', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    nativeFirestore.collection.mockReturnValue('native-feed-collection');
    nativeFirestore.where.mockImplementation(
      (field: string, operator: string, value: string) => ({ field, operator, value }),
    );
    nativeFirestore.orderBy.mockImplementation((field: string, direction: string) => ({
      orderByField: field,
      direction,
    }));
    nativeFirestore.limit.mockImplementation((value: number) => ({ limit: value }));
    nativeFirestore.query.mockImplementation((...parts: unknown[]) => parts);
  });

  it('keeps the React Native Firebase listener and query semantics', () => {
    const unsubscribe = jest.fn();
    nativeFirestore.onSnapshot.mockReturnValue(unsubscribe);

    const stop = subscribeBuyerFeedListener(
      {} as never,
      'buyer-1',
      'project-1',
      30,
      jest.fn(),
      jest.fn(),
    );

    expect(collection).toHaveBeenCalledWith({}, 'users', 'buyer-1', 'feed');
    expect(where).toHaveBeenCalledWith('projectId', '==', 'project-1');
    expect(orderBy).toHaveBeenNthCalledWith(1, 'pinned', 'desc');
    expect(orderBy).toHaveBeenNthCalledWith(2, 'deliveredAt', 'desc');
    expect(limit).toHaveBeenCalledWith(30);
    expect(query).toHaveBeenCalledWith(
      'native-feed-collection',
      { field: 'projectId', operator: '==', value: 'project-1' },
      { orderByField: 'pinned', direction: 'desc' },
      { orderByField: 'deliveredAt', direction: 'desc' },
      { limit: 30 },
    );
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      { includeMetadataChanges: true },
      expect.any(Function),
      expect.any(Function),
    );
    expect(webFirestore.collection).not.toHaveBeenCalled();
    expect(webFirestore.onSnapshot).not.toHaveBeenCalled();
    expect(stop).toBe(unsubscribe);
  });
});
