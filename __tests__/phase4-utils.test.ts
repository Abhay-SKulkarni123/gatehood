import { describeCallableError } from '@/lib/functions/errors';
import { isFeedEntryDoc, isNoticeDoc, isUnitDoc } from '@/lib/data/parse';
import { parseIdList } from '@/utils/identifiers';

const timestamp = {
  seconds: 1,
  nanoseconds: 0,
  toDate: () => new Date(1000),
  toMillis: () => 1000,
};

describe('Phase 4 client helpers', () => {
  it('parses comma-separated ID lists into unique slugs', () => {
    expect(parseIdList('tower-1, tower-2; tower-1 INVALID_ID')).toEqual(['tower-1', 'tower-2']);
  });

  it('maps callable errors to safe messages', () => {
    expect(describeCallableError({ code: 'functions/permission-denied' })).toBe(
      'You do not have access to this operation.',
    );
    expect(describeCallableError({ code: 'functions/unauthenticated' })).toBe(
      'Sign in again to continue.',
    );
    expect(describeCallableError(new Error('CSV row is invalid'))).toBe('CSV row is invalid');
    expect(describeCallableError(null)).toBe(
      'The operation could not be completed. Check your connection and try again.',
    );
  });

  it('validates canonical documents before rendering them', () => {
    const notice = {
      id: 'notice-1',
      projectId: 'project-1',
      title: 'Title',
      body: 'Body',
      audienceType: 'project',
      audienceTowerIds: [],
      audienceUnitIds: [],
      pinned: false,
      createdByUid: 'builder-1',
      createdAt: timestamp,
      updatedAt: timestamp,
      audienceCount: 2,
      readCount: 1,
      fanoutStatus: 'complete',
      fanoutFailedCount: 0,
      pinStatus: 'complete',
      pinFailedCount: 0,
    };

    expect(isNoticeDoc(notice, 'notice-1')).toBe(true);
    expect(isNoticeDoc({ ...notice, readCount: -1 }, 'notice-1')).toBe(false);
    expect(
      isUnitDoc(
        {
          id: 'unit-1',
          projectId: 'project-1',
          towerId: 'tower-1',
          label: 'Unit 101',
          createdAt: timestamp,
        },
        'unit-1',
      ),
    ).toBe(true);
    expect(
      isFeedEntryDoc(
        {
          uid: 'buyer-1',
          noticeId: 'notice-1',
          projectId: 'project-1',
          title: 'Title',
          body: 'Body',
          pinned: false,
          deliveredAt: timestamp,
          updatedAt: timestamp,
          readAt: null,
        },
        'buyer-1',
        'notice-1',
      ),
    ).toBe(true);
  });
});
