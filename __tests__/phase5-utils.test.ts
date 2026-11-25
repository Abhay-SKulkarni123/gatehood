jest.mock('@react-native-firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

import type { FeedEntryDoc, FirestoreTimestamp } from '@/types/domain';
import { filterBuyerFeed } from '@/lib/data/sort';
import {
  describeConstructionProgress,
  describePossessionDate,
  getDaysUntilPossession,
  isValidPossessionDateInput,
  possessionDateToIsoDate,
} from '@/lib/data/units';
import {
  createRedemptionGate,
  describeInviteCodeInput,
  normalizeInviteCodeInput,
} from '@/lib/invite/redemption';

function timestampAt(millis: number): FirestoreTimestamp {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

function feedEntry(
  noticeId: string,
  audience: Pick<FeedEntryDoc, 'audienceType' | 'audienceTowerIds' | 'audienceUnitIds'>,
): FeedEntryDoc {
  const timestamp = timestampAt(1000);
  return {
    uid: 'buyer-1',
    noticeId,
    projectId: 'project-1',
    title: noticeId,
    body: 'Body',
    pinned: false,
    deliveredAt: timestamp,
    updatedAt: timestamp,
    readAt: null,
    ...audience,
  };
}

describe('Phase 5 buyer helpers', () => {
  it('normalizes invite codes and rejects empty or malformed input', () => {
    expect(normalizeInviteCodeInput(' gate-hood 1234 ')).toBe('GATEHOOD1234');
    expect(describeInviteCodeInput('')).toContain('Enter the invite code');
    expect(describeInviteCodeInput('short')).toContain('12 to 64');
    expect(describeInviteCodeInput('GATE-HOOD 1234')).toBeNull();
  });

  it('blocks duplicate invite submissions until the first call finishes', () => {
    const gate = createRedemptionGate();
    const first = gate.begin('gate-hood-1234');
    expect(first).toEqual({ code: 'GATEHOOD1234' });
    expect(gate.begin('gate-hood-1234')).toBeNull();
    expect(gate.isBusy()).toBe(true);

    gate.finish();
    expect(gate.isBusy()).toBe(false);
    expect(gate.begin('gate-hood-1234')).toEqual({ code: 'GATEHOOD1234' });
  });

  it('derives unit possession dates with calendar-day semantics', () => {
    const now = new Date(Date.UTC(2026, 0, 10, 23, 45));
    const target = timestampAt(Date.UTC(2026, 0, 13, 0, 0));

    expect(isValidPossessionDateInput('2026-01-13')).toBe(true);
    expect(isValidPossessionDateInput('2026-02-30')).toBe(false);
    expect(possessionDateToIsoDate(target)).toBe('2026-01-13');
    expect(getDaysUntilPossession(target, now)).toBe(3);
    expect(getDaysUntilPossession(timestampAt(Date.UTC(2026, 0, 10)), now)).toBe(0);
    expect(getDaysUntilPossession(timestampAt(Date.UTC(2026, 0, 8)), now)).toBe(-2);
    expect(getDaysUntilPossession(null, now)).toBeNull();
  });

  it('describes unavailable unit details explicitly', () => {
    const now = new Date(Date.UTC(2026, 0, 10));
    expect(describeConstructionProgress(null)).toBe('Construction progress not available');
    expect(describeConstructionProgress(45)).toBe('45% complete');
    expect(describePossessionDate(null, now)).toBe('Possession date not available');
    expect(
      describePossessionDate(timestampAt(Date.UTC(2026, 0, 10)), now),
    ).toBe('Possession date: 2026-01-10 (today)');
    expect(describePossessionDate(timestampAt(Date.UTC(2026, 0, 12)), now)).toContain('in 2 days');
  });

  it('filters notices by target without exposing other audiences', () => {
    const recipient = { towerId: 'tower-1', unitId: 'unit-1' };
    const entries = [
      feedEntry('project', { audienceType: 'project', audienceTowerIds: [], audienceUnitIds: [] }),
      feedEntry('tower', {
        audienceType: 'tower',
        audienceTowerIds: ['tower-1'],
        audienceUnitIds: [],
      }),
      feedEntry('other-tower', {
        audienceType: 'tower',
        audienceTowerIds: ['tower-2'],
        audienceUnitIds: [],
      }),
      feedEntry('unit', { audienceType: 'unit', audienceTowerIds: [], audienceUnitIds: ['unit-1'] }),
      feedEntry('other-unit', {
        audienceType: 'unit',
        audienceTowerIds: [],
        audienceUnitIds: ['unit-2'],
      }),
      feedEntry('legacy', { audienceType: undefined, audienceTowerIds: undefined, audienceUnitIds: undefined }),
    ];

    expect(filterBuyerFeed(entries, recipient, 'all').map((entry) => entry.noticeId)).toEqual([
      'project',
      'tower',
      'other-tower',
      'unit',
      'other-unit',
      'legacy',
    ]);
    expect(filterBuyerFeed(entries, recipient, 'tower').map((entry) => entry.noticeId)).toEqual([
      'tower',
      'unit',
    ]);
    expect(filterBuyerFeed(entries, recipient, 'unit').map((entry) => entry.noticeId)).toEqual([
      'unit',
    ]);
    expect(filterBuyerFeed(entries, null, 'tower')).toEqual([]);
  });
});
