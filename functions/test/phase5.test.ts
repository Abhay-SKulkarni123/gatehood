import * as callableFunctions from '../src/index';
import type { CreateNoticeResult, GenerateInviteResult } from '../src/domain/types';
import { db } from '../src/firestore';
import { paths } from '../src/paths';
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

const generateInviteCallable = callableFunctions.generateInvite.run;
const redeemInviteCallable = callableFunctions.redeemInvite.run;
const createNoticeCallable = callableFunctions.createNotice.run;
const updateUnitInfoCallable = callableFunctions.updateUnitInfo.run;

describe('Phase 5 trusted buyer workflows', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
  });

  it('rejects a cross-project invite and keeps same-user redemption idempotent', async () => {
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
    const code = generated.code as string;

    await expect(
      redeemInviteCallable(
        callableRequest(
          { code, expectedProjectId: 'other-project' },
          BUYER_ONE_UID,
        ),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).get()).exists).toBe(false);

    const first = await redeemInviteCallable(
      callableRequest({ code, expectedProjectId: PROJECT_ID }, BUYER_ONE_UID),
    );
    const second = await redeemInviteCallable(
      callableRequest({ code, expectedProjectId: PROJECT_ID }, BUYER_ONE_UID),
    );

    expect(first.alreadyMember).toBe(false);
    expect(second.alreadyMember).toBe(true);
    expect(second.unitId).toBe(UNIT_ONE_ID);
  });

  it('rejects malformed and already-used invite codes with the same safe error', async () => {
    await expect(
      redeemInviteCallable(callableRequest({ code: 'short' }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    const generated = (await generateInviteCallable(
      callableRequest(
        {
          projectId: PROJECT_ID,
          towerId: TOWER_ID,
          unitId: UNIT_TWO_ID,
          expiresInHours: 24,
          regenerate: false,
        },
        BUILDER_UID,
      ),
    )) as GenerateInviteResult;
    const code = generated.code as string;

    await redeemInviteCallable(callableRequest({ code }, BUYER_ONE_UID));
    await expect(
      redeemInviteCallable(callableRequest({ code }, BUYER_TWO_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('writes audience metadata into delivered feeds and never fans out to other units', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);

    const towerNotice = (await createNoticeCallable(
      callableRequest(
        {
          projectId: PROJECT_ID,
          title: 'Tower update',
          body: 'Lift maintenance.',
          audience: { type: 'tower', towerIds: [TOWER_ID] },
        },
        BUILDER_UID,
      ),
    )) as CreateNoticeResult;

    expect(towerNotice.fanoutFailedCount).toBe(0);
    const towerFeed = await db.doc(paths.feed(BUYER_ONE_UID, towerNotice.noticeId)).get();
    expect(towerFeed.data()).toMatchObject({
      uid: BUYER_ONE_UID,
      projectId: PROJECT_ID,
      audienceType: 'tower',
      audienceTowerIds: [TOWER_ID],
      audienceUnitIds: [],
    });

    const unitNotice = (await createNoticeCallable(
      callableRequest(
        {
          projectId: PROJECT_ID,
          title: 'Unit update',
          body: 'Interior work.',
          audience: { type: 'unit', unitIds: [UNIT_ONE_ID] },
        },
        BUILDER_UID,
      ),
    )) as CreateNoticeResult;

    const deliveredFeed = await db.doc(paths.feed(BUYER_ONE_UID, unitNotice.noticeId)).get();
    const undeliveredFeed = await db.doc(paths.feed(BUYER_TWO_UID, unitNotice.noticeId)).get();
    expect(deliveredFeed.data()).toMatchObject({
      audienceType: 'unit',
      audienceTowerIds: [],
      audienceUnitIds: [UNIT_ONE_ID],
    });
    expect(undeliveredFeed.exists).toBe(false);
  });

  it('lets builders update unit details and rejects buyers, unauthenticated callers, and invalid input', async () => {
    const data = {
      projectId: PROJECT_ID,
      unitId: UNIT_ONE_ID,
      configuration: '2 BHK',
      constructionProgress: 45,
      possessionDate: '2027-06-30',
    };

    const result = await updateUnitInfoCallable(callableRequest(data, BUILDER_UID));
    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      unitId: UNIT_ONE_ID,
      configuration: '2 BHK',
      constructionProgress: 45,
      possessionDate: '2027-06-30',
    });
    const unit = await db.doc(paths.unit(PROJECT_ID, UNIT_ONE_ID)).get();
    expect(unit.data()).toMatchObject({
      configuration: '2 BHK',
      constructionProgress: 45,
      updatedByUid: BUILDER_UID,
    });
    expect(unit.data()?.possessionDate.toMillis()).toBe(Date.UTC(2027, 5, 30));

    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await expect(
      updateUnitInfoCallable(callableRequest(data, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateUnitInfoCallable(callableRequest(data))).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    await expect(
      updateUnitInfoCallable(
        callableRequest({ ...data, constructionProgress: 101 }, BUILDER_UID),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      updateUnitInfoCallable(
        callableRequest({ ...data, possessionDate: '2027-02-30' }, BUILDER_UID),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
