import { collection, getDocs } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc } from '@/types/domain';
import { isFeedEntryDoc } from './parse';
import { sortBuyerFeed } from './sort';

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

  return sortBuyerFeed(entries);
}
