import type { AudienceType } from '@/types/domain';
import { describeNoticeAudienceSummary, type NoticeAudienceSummary } from '@/lib/ui/notices';
import { parseConstructionProgressInput } from '@/lib/ui/unit-info';

describe('Phase 7 UI logic', () => {
  test('construction progress accepts only whole percentages from 0 to 100', () => {
    expect(parseConstructionProgressInput('0')).toBe(0);
    expect(parseConstructionProgressInput(' 42 ')).toBe(42);
    expect(parseConstructionProgressInput('100')).toBe(100);

    expect(parseConstructionProgressInput('')).toBeNull();
    expect(parseConstructionProgressInput('   ')).toBeNull();
    expect(parseConstructionProgressInput('12.5')).toBeNull();
    expect(parseConstructionProgressInput('-1')).toBeNull();
    expect(parseConstructionProgressInput('101')).toBeNull();
    expect(parseConstructionProgressInput('abc')).toBeNull();
  });

  test('notice audience summaries use human-friendly labels without raw ids', () => {
    expect(describeNoticeAudienceSummary({ audienceType: 'project' })).toBe('All buyers');

    const towerAudience = {
      audienceType: 'tower',
      audienceTowerIds: ['tower-1', 'tower-2'],
    } as unknown as NoticeAudienceSummary;
    expect(describeNoticeAudienceSummary(towerAudience)).toBe('Your tower');

    const unitAudience = {
      audienceType: 'unit',
      audienceUnitIds: ['unit-1', 'unit-2'],
    } as unknown as NoticeAudienceSummary;
    expect(describeNoticeAudienceSummary(unitAudience)).toBe('Your unit');
  });

  test('notice audience summaries handle empty or malformed metadata', () => {
    expect(describeNoticeAudienceSummary({})).toBe('All buyers');
    expect(describeNoticeAudienceSummary(null)).toBe('All buyers');
    expect(describeNoticeAudienceSummary(undefined)).toBe('All buyers');
    expect(
      describeNoticeAudienceSummary({ audienceType: 'unexpected' as AudienceType }),
    ).toBe('All buyers');
    expect(
      describeNoticeAudienceSummary({ audienceType: 42 as unknown as AudienceType }),
    ).toBe('All buyers');
  });
});
