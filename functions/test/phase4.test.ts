import * as callableFunctions from '../src/index';
import type {
  BuyerImportResult,
  GenerateInviteResult,
  NoticeAudience,
  NoticeReadStatusResult,
} from '../src/domain/types';
import { READ_STATUS_PAGE_SIZE } from '../src/config';
import { db, timestampNow } from '../src/firestore';
import { paths } from '../src/paths';
import { hashInviteCode, stableImportId } from '../src/security';
import { normalizeInviteCode } from '../src/validation';
import {
  BUILDER_UID,
  BUYER_ONE_UID,
  BUYER_TWO_UID,
  PROJECT_ID,
  TOWER_ID,
  TOWER_TWO_ID,
  UNIT_ONE_ID,
  UNIT_TWO_ID,
  UNIT_THREE_ID,
  callableRequest,
  clearDatabase,
  seedBuyer,
  seedProject,
} from './helpers';

const importBuyersCallable = callableFunctions.importBuyers.run;
const generateInviteCallable = callableFunctions.generateInvite.run;
const getNoticeReadStatusCallable = callableFunctions.getNoticeReadStatus.run;
const createNoticeCallable = callableFunctions.createNotice.run;
const markNoticeReadCallable = callableFunctions.markNoticeRead.run;
const redeemInviteCallable = callableFunctions.redeemInvite.run;

const eightBuyerCsv = [
  'Tower,Unit,Name,Phone',
  'Tower 1,Unit 101,Aarav Sharma,+15550100001',
  'Tower 1,Unit 102,Ananya Rao,+15550100002',
  'Tower 1,Unit 103,Diya Iyer,+15550100003',
  'Tower 1,Unit 104,Ishaan Verma,+15550100004',
  'Tower 2,Unit 201,Kavya Nair,+15550100005',
  'Tower 2,Unit 202,Meera Patel,+15550100006',
  'Tower 2,Unit 203,Rehan Khan,+15550100007',
  'Tower 2,Unit 204,Sanya Gupta,+15550100008',
].join('\n');

const eightBuyers = [
  { tower: 'Tower 1', unit: 'Unit 101', name: 'Aarav Sharma', phone: '+15550100001', towerId: TOWER_ID },
  { tower: 'Tower 1', unit: 'Unit 102', name: 'Ananya Rao', phone: '+15550100002', towerId: TOWER_ID },
  { tower: 'Tower 1', unit: 'Unit 103', name: 'Diya Iyer', phone: '+15550100003', towerId: TOWER_ID },
  { tower: 'Tower 1', unit: 'Unit 104', name: 'Ishaan Verma', phone: '+15550100004', towerId: TOWER_ID },
  { tower: 'Tower 2', unit: 'Unit 201', name: 'Kavya Nair', phone: '+15550100005', towerId: TOWER_TWO_ID },
  { tower: 'Tower 2', unit: 'Unit 202', name: 'Meera Patel', phone: '+15550100006', towerId: TOWER_TWO_ID },
  { tower: 'Tower 2', unit: 'Unit 203', name: 'Rehan Khan', phone: '+15550100007', towerId: TOWER_TWO_ID },
  { tower: 'Tower 2', unit: 'Unit 204', name: 'Sanya Gupta', phone: '+15550100008', towerId: TOWER_TWO_ID },
];

async function unitIdFor(towerId: string, label: string): Promise<string> {
  const snapshot = await db
    .collection(paths.units(PROJECT_ID))
    .where('towerId', '==', towerId)
    .where('label', '==', label)
    .get();
  expect(snapshot.size).toBe(1);
  return snapshot.docs[0].id;
}

function padded(index: number): string {
  return String(index).padStart(3, '0');
}

async function seedMembers(
  uids: readonly string[],
  towerId: string,
  unitId: string,
): Promise<void> {
  for (let offset = 0; offset < uids.length; offset += 200) {
    const batch = db.batch();
    for (const uid of uids.slice(offset, offset + 200)) {
      batch.set(db.doc(paths.member(PROJECT_ID, uid)), {
        uid,
        projectId: PROJECT_ID,
        role: 'buyer',
        towerId,
        unitId,
        createdByUid: BUILDER_UID,
        createdAt: timestampNow(),
      });
    }
    await batch.commit();
  }
}

async function seedNotice(
  noticeId: string,
  audience: NoticeAudience,
  audienceCount: number,
  readCount = 0,
): Promise<void> {
  const now = timestampNow();
  const audienceFields =
    audience.type === 'project'
      ? { audienceType: 'project', audienceTowerIds: [], audienceUnitIds: [] }
      : audience.type === 'tower'
        ? { audienceType: 'tower', audienceTowerIds: audience.towerIds, audienceUnitIds: [] }
        : { audienceType: 'unit', audienceTowerIds: [], audienceUnitIds: audience.unitIds };

  await db.doc(paths.notice(PROJECT_ID, noticeId)).set({
    id: noticeId,
    projectId: PROJECT_ID,
    title: 'Targeted update',
    body: 'Targeted delivery details.',
    ...audienceFields,
    pinned: false,
    createdByUid: BUILDER_UID,
    createdAt: now,
    updatedAt: now,
    audienceCount,
    readCount,
    fanoutStatus: 'complete',
    fanoutFailedCount: 0,
    pinStatus: 'complete',
    pinFailedCount: 0,
  });
}

async function seedFeeds(
  noticeId: string,
  uids: readonly string[],
  readUids: readonly string[] = [],
): Promise<void> {
  const now = timestampNow();
  for (let offset = 0; offset < uids.length; offset += 200) {
    const batch = db.batch();
    for (const uid of uids.slice(offset, offset + 200)) {
      batch.set(db.doc(paths.feed(uid, noticeId)), {
        uid,
        noticeId,
        projectId: PROJECT_ID,
        title: 'Targeted update',
        body: 'Targeted delivery details.',
        pinned: false,
        deliveredAt: now,
        updatedAt: now,
        readAt: readUids.includes(uid) ? now : null,
      });
    }
    await batch.commit();
  }
}

describe('Phase 4 trusted operations', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
  });

  it('previews CSV without writing and commits buyer contacts deterministically', async () => {
    const csv = 'Tower,Unit,Name,Phone\nTower 1,Unit 104,Asha,+1 555 0104\n';
    const phone = '+15550104';
    const contactId = stableImportId('contact', PROJECT_ID, phone);

    const preview = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: true }, BUILDER_UID),
    )) as BuyerImportResult;

    expect(preview.dryRun).toBe(true);
    expect(preview.created).toBe(1);
    expect(preview.rows).toMatchObject([
      {
        row: 2,
        tower: 'Tower 1',
        unit: 'Unit 104',
        name: 'Asha',
        phone,
        status: 'create',
      },
    ]);
    expect((await db.doc(paths.buyerContact(PROJECT_ID, contactId)).get()).exists).toBe(false);

    const committed = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: false }, BUILDER_UID),
    )) as BuyerImportResult;

    expect(committed.complete).toBe(true);
    expect(committed.created).toBe(1);
    const contact = await db.doc(paths.buyerContact(PROJECT_ID, contactId)).get();
    expect(contact.data()).toMatchObject({
      id: contactId,
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      name: 'Asha',
      phone,
      importedByUid: BUILDER_UID,
    });
    const units = await db
      .collection(paths.units(PROJECT_ID))
      .where('towerId', '==', TOWER_ID)
      .where('label', '==', 'Unit 104')
      .get();
    expect(units.size).toBe(1);
  });

  it('reports invalid CSV rows and refuses any partial commit', async () => {
    const csv =
      'Tower,Unit,Name,Phone\nTower 1,Unit 105,Meera,+15550105\nTower 1,Unit 106,Bad Phone,123\n';

    const preview = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: true }, BUILDER_UID),
    )) as BuyerImportResult;

    expect(preview.failed).toBe(1);
    expect(preview.complete).toBe(false);
    expect(preview.rows[1]).toMatchObject({ row: 3, status: 'error' });
    expect(preview.rows[1].message).toContain('Phone');

    await expect(
      importBuyersCallable(callableRequest({ projectId: PROJECT_ID, csv }, BUILDER_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.collection(paths.buyerContacts(PROJECT_ID)).get()).empty).toBe(true);
    const units = await db
      .collection(paths.units(PROJECT_ID))
      .where('label', '==', 'Unit 105')
      .get();
    expect(units.empty).toBe(true);
  });

  it('treats an identical import as unchanged', async () => {
    const csv = 'Tower,Unit,Name,Phone\nTower 1,Unit 107,Arjun,+15550107\n';
    const request = callableRequest({ projectId: PROJECT_ID, csv }, BUILDER_UID);

    const first = (await importBuyersCallable(request)) as BuyerImportResult;
    const second = (await importBuyersCallable(request)) as BuyerImportResult;

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(second.complete).toBe(true);
  });

  it('persists all eight CSV buyers with mapped tower, unit, name and phone without duplicates', async () => {
    const preview = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv: eightBuyerCsv, dryRun: true }, BUILDER_UID),
    )) as BuyerImportResult;
    expect(preview.complete).toBe(true);
    expect(preview.created).toBe(8);
    expect(preview.failed).toBe(0);
    expect((await db.collection(paths.buyerContacts(PROJECT_ID)).get()).empty).toBe(true);

    const committed = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv: eightBuyerCsv, dryRun: false }, BUILDER_UID),
    )) as BuyerImportResult;
    expect(committed.complete).toBe(true);
    expect(committed.created).toBe(8);

    for (const buyer of eightBuyers) {
      const unitId = await unitIdFor(buyer.towerId, buyer.unit);
      const contactId = stableImportId('contact', PROJECT_ID, buyer.phone);
      const contact = await db.doc(paths.buyerContact(PROJECT_ID, contactId)).get();
      expect(contact.exists).toBe(true);
      expect(contact.data()).toMatchObject({
        id: contactId,
        projectId: PROJECT_ID,
        towerId: buyer.towerId,
        unitId,
        name: buyer.name,
        phone: buyer.phone,
        importedByUid: BUILDER_UID,
      });
    }

    const contactSnapshot = await db.collection(paths.buyerContacts(PROJECT_ID)).get();
    expect(contactSnapshot.size).toBe(8);
    const unitSnapshot = await db.collection(paths.units(PROJECT_ID)).get();
    expect(unitSnapshot.size).toBe(8);
    expect((await db.collection(paths.members(PROJECT_ID)).get()).size).toBe(1);
    expect((await db.collection('users').get()).empty).toBe(true);

    const repeat = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv: eightBuyerCsv, dryRun: false }, BUILDER_UID),
    )) as BuyerImportResult;
    expect(repeat.created).toBe(0);
    expect(repeat.unchanged).toBe(8);
    expect((await db.collection(paths.buyerContacts(PROJECT_ID)).get()).size).toBe(8);
  });

  it('does not count an invalid row as a successful eight-buyer import', async () => {
    const csv = eightBuyerCsv.replace('+15550100003', '123');
    const preview = (await importBuyersCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: true }, BUILDER_UID),
    )) as BuyerImportResult;

    expect(preview.created).toBe(7);
    expect(preview.failed).toBe(1);
    expect(preview.complete).toBe(false);
    expect(preview.rows[2]).toMatchObject({ row: 4, status: 'error' });

    await expect(
      importBuyersCallable(
        callableRequest({ projectId: PROJECT_ID, csv, dryRun: false }, BUILDER_UID),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.collection(paths.buyerContacts(PROJECT_ID)).get()).empty).toBe(true);
    expect((await db.collection(paths.units(PROJECT_ID)).get()).size).toBe(3);
  });

  it('generates a single-use invite whose plaintext code is returned once and stored as a hash', async () => {
    const generated = (await generateInviteCallable(
      callableRequest(
        {
          projectId: PROJECT_ID,
          towerId: TOWER_ID,
          unitId: UNIT_ONE_ID,
          expiresInHours: 24,
          regenerate: false,
        },
        BUILDER_UID,
      ),
    )) as GenerateInviteResult;

    expect(generated.code).toMatch(/^[A-F0-9]{24}$/);
    expect(generated.codeAvailable).toBe(true);
    expect(generated.reused).toBe(false);
    const codeHash = hashInviteCode(normalizeInviteCode(generated.code as string));
    const invite = await db.doc(paths.invite(codeHash)).get();
    expect(invite.data()).toMatchObject({
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      codeHash,
      createdByUid: BUILDER_UID,
      usedByUid: null,
      usedAt: null,
      revokedAt: null,
    });

    const redeemed = await redeemInviteCallable(
      callableRequest({ code: generated.code }, BUYER_ONE_UID),
    );
    expect(redeemed.projectId).toBe(PROJECT_ID);
    expect((await db.doc(paths.invite(codeHash)).get()).data()?.usedByUid).toBe(BUYER_ONE_UID);
  });

  it('reuses active invites and revokes the previous code on explicit regeneration', async () => {
    const requestData = {
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      expiresInHours: 24,
    };
    const first = (await generateInviteCallable(
      callableRequest({ ...requestData, regenerate: false }, BUILDER_UID),
    )) as GenerateInviteResult;
    const reused = (await generateInviteCallable(
      callableRequest({ ...requestData, regenerate: false }, BUILDER_UID),
    )) as GenerateInviteResult;

    expect(first.codeAvailable).toBe(true);
    expect(reused).toMatchObject({ code: null, codeAvailable: false, reused: true });
    const firstHash = hashInviteCode(normalizeInviteCode(first.code as string));
    const slot = await db.doc(paths.inviteSlot(PROJECT_ID, UNIT_ONE_ID)).get();
    expect(slot.data()).toMatchObject({ codeHash: firstHash, unitId: UNIT_ONE_ID });

    const replacement = (await generateInviteCallable(
      callableRequest({ ...requestData, regenerate: true }, BUILDER_UID),
    )) as GenerateInviteResult;
    expect(replacement.codeAvailable).toBe(true);
    expect(replacement.code).not.toBe(first.code);
    expect((await db.doc(paths.invite(firstHash)).get()).data()?.revokedAt).not.toBeNull();

    await expect(
      redeemInviteCallable(callableRequest({ code: first.code }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const redeemed = await redeemInviteCallable(
      callableRequest({ code: replacement.code }, BUYER_ONE_UID),
    );
    expect(redeemed.unitId).toBe(UNIT_ONE_ID);
  });

  it('creates only one invite for concurrent identical requests', async () => {
    const data = {
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      expiresInHours: 24,
      regenerate: false,
    };

    const results = (await Promise.all([
      generateInviteCallable(callableRequest(data, BUILDER_UID)),
      generateInviteCallable(callableRequest(data, BUILDER_UID)),
    ])) as GenerateInviteResult[];

    expect(results.filter((result) => result.codeAvailable)).toHaveLength(1);
    expect(results.filter((result) => result.reused)).toHaveLength(1);
    const invites = await db
      .collection('invites')
      .where('projectId', '==', PROJECT_ID)
      .where('unitId', '==', UNIT_ONE_ID)
      .get();
    expect(invites.size).toBe(1);
  });

  it('reports notice delivery and first-read status to builders only', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
    const created = await createNoticeCallable(
      callableRequest(
        {
          projectId: PROJECT_ID,
          title: 'Water supply scheduled',
          body: 'Water will be off this afternoon.',
          audience: { type: 'project' },
        },
        BUILDER_UID,
      ),
    );

    const request = callableRequest(
      { projectId: PROJECT_ID, noticeId: created.noticeId },
      BUILDER_UID,
    );
    const before = (await getNoticeReadStatusCallable(request)) as NoticeReadStatusResult;

    expect(before.sampleRecipientCount).toBe(2);
    expect(before.sampleDeliveredUnreadCount).toBe(2);
    expect(before.sampleReadCount).toBe(0);
    expect(before.readCount).toBe(0);
    expect(before.truncated).toBe(false);

    await markNoticeReadCallable(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: created.noticeId },
        BUYER_ONE_UID,
      ),
    );

    const after = (await getNoticeReadStatusCallable(request)) as NoticeReadStatusResult;
    expect(after.readCount).toBe(1);
    expect(after.sampleReadCount).toBe(1);
    expect(after.sampleDeliveredUnreadCount).toBe(1);
    expect(after.recipients.find((recipient) => recipient.uid === BUYER_ONE_UID)).toMatchObject({
      delivered: true,
      read: true,
    });
    expect(after.recipients.find((recipient) => recipient.uid === BUYER_TWO_UID)).toMatchObject({
      delivered: true,
      read: false,
      readAt: null,
    });
  });

  it('finds targeted recipients beyond the first membership page', async () => {
    const ineligibleUids = Array.from({ length: READ_STATUS_PAGE_SIZE }, (_, index) =>
      `buyer-${padded(index)}`,
    );
    const eligibleUids = Array.from({ length: 50 }, (_, index) =>
      `buyer-${padded(READ_STATUS_PAGE_SIZE + index)}`,
    );
    await seedMembers(ineligibleUids, TOWER_TWO_ID, UNIT_THREE_ID);
    await seedMembers(eligibleUids, TOWER_ID, UNIT_ONE_ID);
    await seedNotice('notice-target', { type: 'tower', towerIds: [TOWER_ID] }, 50);
    await seedFeeds('notice-target', eligibleUids);

    const status = (await getNoticeReadStatusCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-target' }, BUILDER_UID),
    )) as NoticeReadStatusResult;

    expect(status.audienceCount).toBe(50);
    expect(status.sampleRecipientCount).toBe(50);
    expect(status.sampleDeliveredUnreadCount).toBe(50);
    expect(status.truncated).toBe(false);
    expect(status.recipients.every((recipient) => recipient.towerId === TOWER_ID)).toBe(true);
  });

  it('keeps canonical totals separate from truncated read-status samples', async () => {
    const uids = Array.from({ length: READ_STATUS_PAGE_SIZE + 50 }, (_, index) =>
      `buyer-${padded(index)}`,
    );
    await seedMembers(uids, TOWER_ID, UNIT_ONE_ID);
    await seedNotice('notice-large', { type: 'project' }, uids.length, 1);
    await seedFeeds('notice-large', [uids[uids.length - 1]], [uids[uids.length - 1]]);

    const status = (await getNoticeReadStatusCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-large' }, BUILDER_UID),
    )) as NoticeReadStatusResult;

    expect(status.audienceCount).toBe(READ_STATUS_PAGE_SIZE + 50);
    expect(status.readCount).toBe(1);
    expect(status.sampleRecipientCount).toBe(READ_STATUS_PAGE_SIZE);
    expect(status.sampleReadCount).toBe(0);
    expect(status.sampleNotDeliveredCount).toBe(READ_STATUS_PAGE_SIZE);
    expect(status.truncated).toBe(true);
  });

  it('rejects unauthenticated and non-builder callers', async () => {
    const csv = 'Tower,Unit,Name,Phone\nTower 1,Unit 108,Neha,+15550108\n';
    const inviteData = {
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
    };

    await expect(importBuyersCallable(callableRequest({ projectId: PROJECT_ID, csv }))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(generateInviteCallable(callableRequest(inviteData))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      getNoticeReadStatusCallable(callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-1' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);

    await expect(
      importBuyersCallable(callableRequest({ projectId: PROJECT_ID, csv }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      generateInviteCallable(callableRequest(inviteData, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      getNoticeReadStatusCallable(
        callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-1' }, BUYER_ONE_UID),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
