import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getWebFirestore } from '@/lib/firebase/web-firestore';
import { boundedFeedLimit, toBuyerFeedSnapshot, type BuyerFeedListener } from './buyer-feed-shared';

export const subscribeBuyerFeedListener: BuyerFeedListener = (
  _firestore,
  uid,
  projectId,
  requestedLimit,
  onResult,
  onError,
) => {
  const boundedLimit = boundedFeedLimit(requestedLimit);
  const firestore = getWebFirestore();
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
    (snapshot) => onResult(toBuyerFeedSnapshot(snapshot, uid, projectId, boundedLimit)),
    onError,
  );
};
