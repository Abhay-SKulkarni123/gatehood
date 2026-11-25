import * as callableFunctions from '../src/index';
import type {
  GenerateInviteResult,
  NoticeReadStatusResult,
  UnitImportResult,
} from '../src/domain/types';
import { db } from '../src/firestore';
import { paths } from '../src/paths';
import { hashInviteCode } from '../src/security';
import { normalizeInviteCode } from '../src/validation';
import {
  BUILDER_UID,
  BUYER_ONE_UID,
  BUYER_TWO_UID,
  PROJECT_ID,
  TOWER_ID,
  UNIT_ONE_ID,
  UNIT_TWO_ID,
  callableRequest,
  clearDatabase,
  seedBuyer,
  seedProject,
} from './helpers';

const importUnitsCallable = callableFunctions.importUnits.run;
const generateInviteCallable = callableFunctions.generateInvite.run;
const getNoticeReadStatusCallable = callableFunctions.getNoticeReadStatus.run;
const createNoticeCallable = callableFunctions.createNotice.run;
const markNoticeReadCallable = callableFunctions.markNoticeRead.run;
const redeemInviteCallable = callableFunctions.redeemInvite.run;

describe('Phase 4 trusted operations', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
  });

  it('previews CSV rows without writing and commits them for a builder', async () => {
    const csv = 'towerId,unitId,label\ntower-1,unit-4,Unit 104\n';

    const preview = (await importUnitsCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: true }, BUILDER_UID),
    )) as UnitImportResult;

    expect(preview.dryRun).toBe(true);
    expect(preview.created).toBe(1);
    expect(preview.rows).toMatchObject([
      { row: 2, towerId: TOWER_ID, unitId: 'unit-4', label: 'Unit 104', status: 'create' },
    ]);
    expect((await db.doc(paths.unit(PROJECT_ID, 'unit-4')).get()).exists).toBe(false);

    const committed = (await importUnitsCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: false }, BUILDER_UID),
    )) as UnitImportResult;

    expect(committed.complete).toBe(true);
    expect(committed.created).toBe(1);
    const unit = await db.doc(paths.unit(PROJECT_ID, 'unit-4')).get();
    expect(unit.data()).toMatchObject({
      id: 'unit-4',
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      label: 'Unit 104',
    });
  });

  it('reports invalid CSV rows and refuses to commit them', async () => {
    const csv = 'towerId,unitId,label\nmissing-tower,unit-4,Bad unit\n';

    const preview = (await importUnitsCallable(
      callableRequest({ projectId: PROJECT_ID, csv, dryRun: true }, BUILDER_UID),
    )) as UnitImportResult;

    expect(preview.failed).toBe(1);
    expect(preview.complete).toBe(false);
    expect(preview.rows[0].status).toBe('error');
    expect(preview.rows[0].message).toContain('Tower');

    await expect(
      importUnitsCallable(callableRequest({ projectId: PROJECT_ID, csv }, BUILDER_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.doc(paths.unit(PROJECT_ID, 'unit-4')).get()).exists).toBe(false);
  });

  it('generates a single-use invite whose plaintext code is returned once and stored as a hash', async () => {
    const generated = (await generateInviteCallable(
      callableRequest(
        { projectId: PROJECT_ID, towerId: TOWER_ID, unitId: UNIT_ONE_ID, expiresInHours: 24 },
        BUILDER_UID,
      ),
    )) as GenerateInviteResult;

    expect(generated.code).toMatch(/^[A-F0-9]{24}$/);
    const codeHash = hashInviteCode(normalizeInviteCode(generated.code));
    const invite = await db.doc(paths.invite(codeHash)).get();
    expect(invite.data()).toMatchObject({
      projectId: PROJECT_ID,
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      codeHash,
      createdByUid: BUILDER_UID,
      usedByUid: null,
      usedAt: null,
    });

    const redeemed = await redeemInviteCallable(
      callableRequest({ code: generated.code }, BUYER_ONE_UID),
    );
    expect(redeemed.projectId).toBe(PROJECT_ID);
    expect((await db.doc(paths.invite(codeHash)).get()).data()?.usedByUid).toBe(BUYER_ONE_UID);
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

    expect(before.recipientCount).toBe(2);
    expect(before.deliveredCount).toBe(2);
    expect(before.unreadCount).toBe(2);
    expect(before.readCount).toBe(0);

    await markNoticeReadCallable(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: created.noticeId },
        BUYER_ONE_UID,
      ),
    );

    const after = (await getNoticeReadStatusCallable(request)) as NoticeReadStatusResult;
    expect(after.readCount).toBe(1);
    expect(after.unreadCount).toBe(1);
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

  it('rejects unauthenticated and non-builder callers', async () => {
    const csv = 'towerId,unitId,label\ntower-1,unit-4,Unit 104\n';
    const inviteData = { projectId: PROJECT_ID, towerId: TOWER_ID, unitId: UNIT_ONE_ID };

    await expect(importUnitsCallable(callableRequest({ projectId: PROJECT_ID, csv }))).rejects.toMatchObject({
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
      importUnitsCallable(callableRequest({ projectId: PROJECT_ID, csv }, BUYER_ONE_UID)),
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
