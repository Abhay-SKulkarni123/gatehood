import { doc, getDoc } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { MembershipDoc, ProjectDoc } from '@/types/domain';
import { subscribeBuyerFeedListener } from './buyer-feed';
import type { BuyerFeedSnapshot } from './feed-state';
import { isProjectDoc } from './parse';

export type FeedListenerController = {
  start: (requestedLimit: number) => void;
  stop: () => void;
};

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
  return subscribeBuyerFeedListener(
    firestore,
    uid,
    projectId,
    requestedLimit,
    onResult,
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
