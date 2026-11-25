import { parseConstructionProgressInput } from '@/lib/ui/unit-info';
import { describeNoticeAudienceSummary } from '@/lib/ui/notices';

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

  test('notice audience summaries are readable and handle single or multiple targets', () => {
    expect(describeNoticeAudienceSummary({ audienceType: 'project' })).toBe('All buyers');
    expect(
      describeNoticeAudienceSummary({ audienceType: 'tower', audienceTowerIds: ['tower-1'] }),
    ).toBe('Tower tower-1');
    expect(
      describeNoticeAudienceSummary({
        audienceType: 'tower',
        audienceTowerIds: ['tower-1', 'tower-2'],
      }),
    ).toBe('Towers tower-1, tower-2');
    expect(
      describeNoticeAudienceSummary({ audienceType: 'unit', audienceUnitIds: ['unit-1'] }),
    ).toBe('Unit unit-1');
    expect(
      describeNoticeAudienceSummary({
        audienceType: 'unit',
        audienceUnitIds: ['unit-1', 'unit-2'],
      }),
    ).toBe('Units unit-1, unit-2');
    expect(describeNoticeAudienceSummary({ audienceType: 'tower' })).toBe('Selected towers');
    expect(describeNoticeAudienceSummary({ audienceType: 'unit' })).toBe('Selected units');
    expect(describeNoticeAudienceSummary({})).toBe('All buyers');
  });
});
