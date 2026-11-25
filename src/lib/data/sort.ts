import type { FeedEntryDoc, MembershipDoc } from '@/types/domain';

export type BuyerFeedFilter = 'all' | 'tower' | 'unit';

type FeedRecipient = Pick<MembershipDoc, 'towerId' | 'unitId'>;

export function sortBuyerFeed(entries: readonly FeedEntryDoc[]): FeedEntryDoc[] {
  return [...entries].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1;
    }
    return second.deliveredAt.toMillis() - first.deliveredAt.toMillis();
  });
}

export function filterBuyerFeed(
  entries: readonly FeedEntryDoc[],
  recipient: FeedRecipient | null,
  filter: BuyerFeedFilter,
): FeedEntryDoc[] {
  if (filter === 'all') {
    return [...entries];
  }
  if (!recipient) {
    return [];
  }

  return entries.filter((entry) => {
    if (filter === 'unit') {
      return (
        entry.audienceType === 'unit' &&
        recipient.unitId !== null &&
        (entry.audienceUnitIds ?? []).includes(recipient.unitId)
      );
    }

    if (entry.audienceType === 'tower') {
      return (
        recipient.towerId !== null &&
        (entry.audienceTowerIds ?? []).includes(recipient.towerId)
      );
    }
    if (entry.audienceType === 'unit') {
      return (
        recipient.unitId !== null &&
        (entry.audienceUnitIds ?? []).includes(recipient.unitId)
      );
    }
    return false;
  });
}
