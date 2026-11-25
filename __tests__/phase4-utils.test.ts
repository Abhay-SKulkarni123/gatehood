import { validateBuyerCsv } from '@/lib/csv/buyer-import';
import { isBuyerContactDoc, isFeedEntryDoc, isNoticeDoc, isUnitDoc } from '@/lib/data/parse';
import { sortBuyerFeed } from '@/lib/data/sort';
import { describeCallableError } from '@/lib/functions/errors';
import { parseIdList } from '@/utils/identifiers';

function timestampAt(millis: number) {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

const timestamp = timestampAt(1000);

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
    expect(
      isBuyerContactDoc(
        {
          id: 'contact-1',
          projectId: 'project-1',
          towerId: 'tower-1',
          unitId: 'unit-1',
          name: 'Asha',
          phone: '+15550104',
          importedByUid: 'builder-1',
          importedAt: timestamp,
          updatedAt: timestamp,
        },
        'contact-1',
      ),
    ).toBe(true);
  });

  it('validates buyer CSV headers, phones, and duplicate contacts', () => {
    const valid = validateBuyerCsv(
      'Tower,Unit,Name,Phone\nTower 1,Unit 101,Asha,(555) 010-1234\n',
    );
    expect(valid.valid).toBe(true);
    expect(valid.errors).toEqual([]);
    expect(valid.rows[0]).toMatchObject({
      row: 2,
      tower: 'Tower 1',
      unit: 'Unit 101',
      name: 'Asha',
      phone: '5550101234',
      status: 'create',
    });

    const invalidHeader = validateBuyerCsv('towerId,unitId,label\ntower-1,unit-1,Unit 101\n');
    expect(invalidHeader.valid).toBe(false);
    expect(invalidHeader.errors[0]).toContain('Tower, Unit, Name, and Phone');

    const duplicate = validateBuyerCsv(
      'Tower,Unit,Name,Phone\nTower 1,Unit 101,Asha,+15550104\nTower 1,Unit 102,Meera,+1 555 0104\n',
    );
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.some((error) => error.includes('Phone number is duplicated'))).toBe(
      true,
    );
  });

  it('orders the buyer feed by pin state then delivery time, not unread state', () => {
    const baseEntry = {
      uid: 'buyer-1',
      projectId: 'project-1',
      title: 'Title',
      body: 'Body',
    };
    const entries = [
      { ...baseEntry, noticeId: 'old-unread', pinned: false, deliveredAt: timestamp, updatedAt: timestamp, readAt: null },
      {
        ...baseEntry,
        noticeId: 'newer-read',
        pinned: false,
        deliveredAt: timestampAt(2000),
        updatedAt: timestampAt(2000),
        readAt: timestampAt(2000),
      },
      { ...baseEntry, noticeId: 'old-pinned', pinned: true, deliveredAt: timestamp, updatedAt: timestamp, readAt: timestamp },
    ];

    expect(sortBuyerFeed(entries).map((entry) => entry.noticeId)).toEqual([
      'old-pinned',
      'newer-read',
      'old-unread',
    ]);
  });
});
