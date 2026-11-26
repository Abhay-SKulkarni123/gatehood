import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc } from '@/types/domain';
import type { BuyerFeedSnapshot } from './feed-state';
import { FEED_PAGE_SIZE } from './feed-state';
import { isFeedEntryDoc } from './parse';
import { sortBuyerFeed } from './sort';

export type FeedSnapshot = {
  docs: { id: string; data: () => unknown }[];
  metadata: { fromCache: boolean };
};

export type BuyerFeedListener = (
  firestore: Firestore,
  uid: string,
  projectId: string,
  requestedLimit: number,
  onResult: (snapshot: BuyerFeedSnapshot) => void,
  onError: (error: unknown) => void,
) => () => void;

export function boundedFeedLimit(requestedLimit: number): number {
  return Math.max(FEED_PAGE_SIZE, Math.floor(requestedLimit));
}

export function feedEntriesFromSnapshot(
  snapshot: FeedSnapshot,
  uid: string,
  projectId: string,
): FeedEntryDoc[] {
  const entries = new Map<string, FeedEntryDoc>();
  snapshot.docs.forEach((document) => {
    const value = document.data();
    if (isFeedEntryDoc(value, uid, document.id) && value.projectId === projectId) {
      entries.set(document.id, value);
    }
  });
  return sortBuyerFeed([...entries.values()]);
}

export function toBuyerFeedSnapshot(
  snapshot: FeedSnapshot,
  uid: string,
  projectId: string,
  boundedLimit: number,
): BuyerFeedSnapshot {
  return {
    entries: feedEntriesFromSnapshot(snapshot, uid, projectId),
    hasMore: snapshot.docs.length >= boundedLimit,
    fromCache: snapshot.metadata.fromCache,
  };
}
