import { collection, doc, getDoc, getDocs, onSnapshot } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc, MembershipDoc, ProjectDoc } from '@/types/domain';
import { isFeedEntryDoc, isProjectDoc } from './parse';
import { sortBuyerFeed } from './sort';

type FeedSnapshot = { docs: { id: string; data: () => unknown }[] };

function feedEntriesFromSnapshot(
  snapshot: FeedSnapshot,
  uid: string,
  projectId: string,
): FeedEntryDoc[] {
  return snapshot.docs.flatMap((document) => {
    const value = document.data();
    return isFeedEntryDoc(value, uid, document.id) && value.projectId === projectId ? [value] : [];
  });
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

export async function loadBuyerFeed(
  firestore: Firestore,
  uid: string,
  projectId: string,
): Promise<FeedEntryDoc[]> {
  const snapshot = await getDocs(collection(firestore, 'users', uid, 'feed'));
  return sortBuyerFeed(feedEntriesFromSnapshot(snapshot, uid, projectId));
}

export function subscribeBuyerFeed(
  firestore: Firestore,
  uid: string,
  projectId: string,
  onEntries: (entries: FeedEntryDoc[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(firestore, 'users', uid, 'feed'),
    (snapshot) => {
      onEntries(sortBuyerFeed(feedEntriesFromSnapshot(snapshot, uid, projectId)));
    },
    (error) => {
      onError(error);
    },
  );
}
