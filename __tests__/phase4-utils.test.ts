import {
  canCommitBuyerImport,
  createBuyerCsvState,
  validateBuyerCsv,
  type BuyerImportPreview,
} from '@/lib/csv/buyer-import';
import { isBuyerContactDoc, isFeedEntryDoc, isNoticeDoc, isUnitDoc } from '@/lib/data/parse';
import { sortBuyerFeed } from '@/lib/data/sort';
import { describeCallableError } from '@/lib/functions/errors';
import { parseIdList } from '@/utils/identifiers';
import type { BuyerImportResult } from '@/types/domain';

const buyerCsv = 'Tower,Unit,Name,Phone\nTower 1,Unit 101,Asha,+15550104\n';

const eightBuyerCsv = [
  '\uFEFFTower,Unit,Name,Phone',
  'Tower 1,Unit 101,Aarav Sharma,+15550100001',
  'Tower 1,Unit 102,Ananya Rao,+15550100002',
  'Tower 1,Unit 103,Diya Iyer,+15550100003',
  'Tower 1,Unit 104,Ishaan Verma,+15550100004',
  'Tower 2,Unit 201,Kavya Nair,+15550100005',
  'Tower 2,Unit 202,Meera Patel,+15550100006',
  'Tower 2,Unit 203,Rehan Khan,+15550100007',
  'Tower 2,Unit 204,Sanya Gupta,+15550100008',
].join('\r\n');

function successfulPreview(overrides: Partial<BuyerImportResult> = {}): BuyerImportResult {
  return {
    dryRun: true,
    rows: [{ row: 2, tower: 'Tower 1', unit: 'Unit 101', name: 'Asha', phone: '+15550104', status: 'create', message: null }],
    created: 1,
    unchanged: 0,
    failed: 0,
    complete: true,
    ...overrides,
  };
}

function previewFor(
  csv: string,
  overrides: Partial<BuyerImportResult> = {},
): BuyerImportPreview {
  return { csv, result: successfulPreview(overrides) };
}

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
      'Request was rejected by Firebase. Check your session and App Check configuration, then try again.',
    );
    expect(describeCallableError({ code: 'appcheck/fetch-status-error' })).toBe(
      'App Check could not verify this request. Check your configuration and try again.',
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

  it('normalizes the exact eight-buyer CSV into mapped preview rows', () => {
    const validation = validateBuyerCsv(eightBuyerCsv);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.rows).toHaveLength(8);
    expect(validation.rows.map((row) => [row.tower, row.unit, row.name, row.phone])).toEqual([
      ['Tower 1', 'Unit 101', 'Aarav Sharma', '+15550100001'],
      ['Tower 1', 'Unit 102', 'Ananya Rao', '+15550100002'],
      ['Tower 1', 'Unit 103', 'Diya Iyer', '+15550100003'],
      ['Tower 1', 'Unit 104', 'Ishaan Verma', '+15550100004'],
      ['Tower 2', 'Unit 201', 'Kavya Nair', '+15550100005'],
      ['Tower 2', 'Unit 202', 'Meera Patel', '+15550100006'],
      ['Tower 2', 'Unit 203', 'Rehan Khan', '+15550100007'],
      ['Tower 2', 'Unit 204', 'Sanya Gupta', '+15550100008'],
    ]);
    expect(validation.rows.every((row) => row.status === 'create')).toBe(true);

    const invalidRow = validateBuyerCsv(
      eightBuyerCsv.replace('+15550100003', 'not-a-phone'),
    );
    expect(invalidRow.valid).toBe(false);
    expect(invalidRow.rows).toHaveLength(8);
    expect(invalidRow.rows.filter((row) => row.status === 'error')).toHaveLength(1);
    expect(invalidRow.rows[2]).toMatchObject({ row: 4, status: 'error' });
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

  it('keeps import disabled until a successful server preview exists', () => {
    const state = createBuyerCsvState(buyerCsv);
    expect(
      canCommitBuyerImport({
        ...state,
        importPreview: null,
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);

    expect(
      canCommitBuyerImport({
        ...state,
        importPreview: previewFor(buyerCsv),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(true);
  });

  it('keeps import disabled for unsuccessful previews and client errors', () => {
    const state = createBuyerCsvState(buyerCsv);
    expect(
      canCommitBuyerImport({
        ...state,
        importPreview: previewFor(buyerCsv, { complete: false, failed: 1 }),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);
    expect(
      canCommitBuyerImport({
        ...state,
        importPreview: previewFor(buyerCsv, { dryRun: false }),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);

    const invalidCsv = 'Tower,Unit,Name,Phone\nTower 1,Unit 101,Asha,123\n';
    const invalidState = createBuyerCsvState(invalidCsv);
    expect(invalidState.clientCsvErrors.length).toBeGreaterThan(0);
    expect(
      canCommitBuyerImport({
        ...invalidState,
        importPreview: previewFor(invalidCsv),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);
  });

  it('invalidates the preview when CSV content changes', () => {
    const previewedState = createBuyerCsvState(buyerCsv);
    expect(
      canCommitBuyerImport({
        ...previewedState,
        importPreview: previewFor(buyerCsv),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(true);

    const editedCsv = 'Tower,Unit,Name,Phone\nTower 1,Unit 102,Meera,+15550105\n';
    const editedState = createBuyerCsvState(editedCsv);
    expect(editedState.importPreview).toBeNull();
    expect(
      canCommitBuyerImport({
        ...editedState,
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);
    expect(
      canCommitBuyerImport({
        ...editedState,
        importPreview: previewFor(buyerCsv),
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);
  });

  it('keeps import disabled while preview or import requests are running', () => {
    const state = createBuyerCsvState(buyerCsv);
    const importPreview = previewFor(buyerCsv);

    expect(
      canCommitBuyerImport({
        ...state,
        importPreview,
        previewPending: true,
        importPending: false,
      }),
    ).toBe(false);
    expect(
      canCommitBuyerImport({
        ...state,
        importPreview,
        previewPending: false,
        importPending: true,
      }),
    ).toBe(false);
  });

  it('rejects a late successful response for CSV A after editing to CSV B', () => {
    const csvA = buyerCsv;
    const pendingStateA = createBuyerCsvState(csvA);
    expect(
      canCommitBuyerImport({
        ...pendingStateA,
        previewPending: true,
        importPending: false,
      }),
    ).toBe(false);

    const csvB = 'Tower,Unit,Name,Phone\nTower 1,Unit 102,Meera,+15550105\n';
    const editedStateB = createBuyerCsvState(csvB);
    const lateResponseForA = previewFor(csvA);

    expect(
      canCommitBuyerImport({
        ...editedStateB,
        importPreview: lateResponseForA,
        previewPending: false,
        importPending: false,
      }),
    ).toBe(false);
  });
});
