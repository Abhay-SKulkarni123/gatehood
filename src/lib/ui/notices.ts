import type { AudienceType } from '@/types/domain';

type AudienceSummary = {
  audienceTowerIds?: readonly string[] | null;
  audienceType?: AudienceType | null;
  audienceUnitIds?: readonly string[] | null;
};

export function describeNoticeAudienceSummary(audience: AudienceSummary): string {
  const towerIds = audience.audienceTowerIds ?? [];
  const unitIds = audience.audienceUnitIds ?? [];

  if (audience.audienceType === 'tower') {
    if (towerIds.length === 0) {
      return 'Selected towers';
    }
    return towerIds.length === 1
      ? `Tower ${towerIds[0]}`
      : `Towers ${towerIds.join(', ')}`;
  }

  if (audience.audienceType === 'unit') {
    if (unitIds.length === 0) {
      return 'Selected units';
    }
    return unitIds.length === 1 ? `Unit ${unitIds[0]}` : `Units ${unitIds.join(', ')}`;
  }

  return 'All buyers';
}
