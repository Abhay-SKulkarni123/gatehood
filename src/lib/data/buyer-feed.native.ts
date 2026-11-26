import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import { boundedFeedLimit, toBuyerFeedSnapshot, type BuyerFeedListener } from './buyer-feed-shared';

export const subscribeBuyerFeedListener: BuyerFeedListener = (
  firestore,
  uid,
  projectId,
  requestedLimit,
  onResult,
  onError,
) => {
  const boundedLimit = boundedFeedLimit(requestedLimit);
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
