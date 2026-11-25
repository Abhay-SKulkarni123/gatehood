import {
  collection,
  doc,
  getDoc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc, MembershipDoc, ProjectDoc } from '@/types/domain';
import type { BuyerFeedSnapshot } from './feed-state';
import { FEED_PAGE_SIZE } from './feed-state';
import { isFeedEntryDoc, isProjectDoc } from './parse';
import { sortBuyerFeed } from './sort';

type FeedSnapshot = {
  docs: { id: string; data: () => unknown }[];
  metadata: { fromCache: boolean };
};

export type FeedListenerController = {
  start: (requestedLimit: number) => void;
  stop: () => void;
};

function feedEntriesFromSnapshot(
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

export async function loadBuyerProject(
  firestore: Firestore,
  membership: MembershipDoc,
): Promise<ProjectDoc | null> {
  const snapshot = await getDoc(doc(firestore, 'projects', membership.projectId));
  if (!snapshot.exists) {
    return null;
  }

  const value = { ...snapshot.data(), id: snapshot.id };
  return isProjectDoc(value, membership.projectId) ? value : null;
}

export function subscribeBuyerFeed(
  firestore: Firestore,
  uid: string,
  projectId: string,
  requestedLimit: number,
  onResult: (snapshot: BuyerFeedSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  const boundedLimit = Math.max(FEED_PAGE_SIZE, Math.floor(requestedLimit));
  const feedQuery = query(
    collection(firestore, 'users', uid, 'feed'),
    where('projectId', '==', projectId),
    orderBy('pinned', 'desc'),
    orderBy('deliveredAt', 'desc'),
    firestoreLimit(boundedLimit),
  );

  return onSnapshot(
    feedQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      onResult({
        entries: feedEntriesFromSnapshot(snapshot, uid, projectId),
        hasMore: snapshot.docs.length >= boundedLimit,
        fromCache: snapshot.metadata.fromCache,
      });
    },
    onError,
  );
}

export function createFeedListenerController(
  firestore: Firestore,
  uid: string,
  projectId: string,
  onResult: (snapshot: BuyerFeedSnapshot) => void,
  onError: (error: unknown) => void,
): FeedListenerController {
  let unsubscribe: (() => void) | null = null;

  return {
    start(requestedLimit) {
      if (unsubscribe) {
        unsubscribe();
      }
      unsubscribe = subscribeBuyerFeed(
        firestore,
        uid,
        projectId,
        requestedLimit,
        onResult,
        onError,
      );
    },
    stop() {
      if (unsubscribe) {
        unsubscribe();
      }
      unsubscribe = null;
    },
  };
}
