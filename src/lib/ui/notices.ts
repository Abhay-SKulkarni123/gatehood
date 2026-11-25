import type { AudienceType } from '@/types/domain';

export type NoticeAudienceSummary = {
  audienceType?: AudienceType | null;
};

export function describeNoticeAudienceSummary(
  audience: NoticeAudienceSummary | null | undefined,
): string {
  if (audience?.audienceType === 'tower') {
    return 'Your tower';
  }

  if (audience?.audienceType === 'unit') {
    return 'Your unit';
  }

  return 'All buyers';
}
