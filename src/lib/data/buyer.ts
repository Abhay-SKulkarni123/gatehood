import { collection, getDocs } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc } from '@/types/domain';
import { isFeedEntryDoc } from './parse';

export async function loadBuyerFeed(
  firestore: Firestore,
  uid: string,
  projectId: string,
): Promise<FeedEntryDoc[]> {
  const snapshot = await getDocs(collection(firestore, 'users', uid, 'feed'));
  const entries = snapshot.docs.flatMap((document) => {
    const value = document.data();
    return isFeedEntryDoc(value, uid, document.id) && value.projectId === projectId ? [value] : [];
  });

  entries.sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    if ((first.readAt === null) !== (second.readAt === null)) {
      return first.readAt === null ? -1 : 1;
    }
    return second.deliveredAt.toMillis() - first.deliveredAt.toMillis();
  });

  return entries;
}
