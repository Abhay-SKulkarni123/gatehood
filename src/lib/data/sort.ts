import type { FeedEntryDoc } from '@/types/domain';

export function sortBuyerFeed(entries: readonly FeedEntryDoc[]): FeedEntryDoc[] {
  return [...entries].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    return second.deliveredAt.toMillis() - first.deliveredAt.toMillis();
  });
}
