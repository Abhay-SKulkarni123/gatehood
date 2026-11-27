import { HttpsError } from 'firebase-functions/v2/https';
import { requireProjectRole } from '../src/auth';
import { RETRY_BATCH_LIMIT } from '../src/config';
import * as callableFunctions from '../src/index';
import type {
  CreateNoticeResult,
  NoticeAudience,
  RedeemInviteResult,
} from '../src/domain/types';
import { getNotice, fanOutToRecipients, retryNoticeFanout, retryUnresolvedFailures } from '../src/fanout';
import * as failuresModule from '../src/failures';
import {
  failureId,
  listUnresolvedFailures,
  recordFailure,
  refreshNoticeStatus,
  resolveFailure,
} from '../src/failures';
import { db, timestampNow } from '../src/firestore';
import { paths } from '../src/paths';
import { hashInviteCode } from '../src/security';
import { normalizeInviteCode } from '../src/validation';
import {
  BUILDER_UID,
  BUYER_ONE_UID,
  BUYER_THREE_UID,
  BUYER_TWO_UID,
  INVITE_CODE,
  PROJECT_ID,
  TOWER_ID,
  TOWER_TWO_ID,
  UNIT_ONE_ID,
  UNIT_THREE_ID,
  UNIT_TWO_ID,
  callableRequest,
  clearDatabase,
  seedBuyer,
  seedInvite,
  seedProject,
} from './helpers';

const createNoticeCallable = callableFunctions.createNotice.run;
const markNoticeReadCallable = callableFunctions.markNoticeRead.run;
const redeemInviteCallable = callableFunctions.redeemInvite.run;
const setNoticePinnedCallable = callableFunctions.setNoticePinned.run;

async function createNotice(audience: NoticeAudience = { type: 'project' }): Promise<CreateNoticeResult> {
  return (await createNoticeCallable(
    callableRequest(
      {
        projectId: PROJECT_ID,
        title: 'Water supply scheduled',
        body: 'Water will be off between 10 AM and 2 PM.',
        audience,
      },
      BUILDER_UID,
    ),
  )) as CreateNoticeResult;
}

describe('Phase 2 review corrections', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
  });

  it('rejects memberships whose stored uid or project does not match the requested path', async () => {
    const createdAt = timestampNow();
    await db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).set({
      uid: BUYER_TWO_UID,
      projectId: PROJECT_ID,
      role: 'buyer',
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      createdByUid: BUILDER_UID,
      createdAt,
    });

    await expect(requireProjectRole(PROJECT_ID, BUYER_ONE_UID, 'buyer')).rejects.toMatchObject({
      code: 'permission-denied',
    });

    await db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).set({
      uid: BUYER_ONE_UID,
      projectId: 'other-project',
      role: 'buyer',
      towerId: TOWER_ID,
      unitId: UNIT_ONE_ID,
      createdByUid: BUILDER_UID,
      createdAt,
    });

    await expect(requireProjectRole(PROJECT_ID, BUYER_ONE_UID, 'buyer')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('lets only one of two UIDs redeem the same invite', async () => {
    await seedInvite();

    const results = await Promise.allSettled([
      redeemInviteCallable(callableRequest({ code: INVITE_CODE }, BUYER_ONE_UID)),
      redeemInviteCallable(callableRequest({ code: INVITE_CODE }, BUYER_TWO_UID)),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<RedeemInviteResult> => result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'invalid-argument' });

    const invite = await db.doc(paths.invite(hashInviteCode(normalizeInviteCode(INVITE_CODE)))).get();
    const usedByUid = invite.data()?.usedByUid;
    expect([BUYER_ONE_UID, BUYER_TWO_UID]).toContain(usedByUid);

    const memberships = await Promise.all([
      db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).get(),
      db.doc(paths.member(PROJECT_ID, BUYER_TWO_UID)).get(),
    ]);
    expect(memberships.filter((membership) => membership.exists)).toHaveLength(1);
  });

  it('targets tower audiences only to matching buyer memberships', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
    await seedBuyer(BUYER_THREE_UID, UNIT_THREE_ID, TOWER_TWO_ID);

    const result = await createNotice({ type: 'tower', towerIds: [TOWER_ID] });

    expect(result.audienceCount).toBe(2);
    expect(result.fanout.created).toBe(2);
    expect((await db.doc(paths.feed(BUYER_ONE_UID, result.noticeId)).get()).exists).toBe(true);
    expect((await db.doc(paths.feed(BUYER_TWO_UID, result.noticeId)).get()).exists).toBe(true);
    expect((await db.doc(paths.feed(BUYER_THREE_UID, result.noticeId)).get()).exists).toBe(false);
  });

  it('targets unit audiences only to matching buyer memberships', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
    await seedBuyer(BUYER_THREE_UID, UNIT_THREE_ID, TOWER_TWO_ID);

    const result = await createNotice({ type: 'unit', unitIds: [UNIT_TWO_ID] });

    expect(result.audienceCount).toBe(1);
    expect(result.fanout.created).toBe(1);
    expect((await db.doc(paths.feed(BUYER_ONE_UID, result.noticeId)).get()).exists).toBe(false);
    expect((await db.doc(paths.feed(BUYER_TWO_UID, result.noticeId)).get()).exists).toBe(true);
    expect((await db.doc(paths.feed(BUYER_THREE_UID, result.noticeId)).get()).exists).toBe(false);
  });

  it('rejects invalid tower and unit references', async () => {
    await expect(createNotice({ type: 'tower', towerIds: ['missing-tower'] })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(createNotice({ type: 'unit', unitIds: ['missing-unit'] })).rejects.toMatchObject({
      code: 'invalid-argument',
    });

    const notices = await db.collection(paths.notices(PROJECT_ID)).get();
    expect(notices.empty).toBe(true);
  });

  it('backfills existing eligible notices for a late buyer', async () => {
    const created = await createNotice();
    expect(created.audienceCount).toBe(0);

    await seedInvite();
    const redeem = (await redeemInviteCallable(
      callableRequest({ code: INVITE_CODE }, BUYER_ONE_UID),
    )) as RedeemInviteResult;

    expect(redeem.backfill.created).toBe(1);
    expect((await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get()).exists).toBe(true);
    expect((await getNotice(PROJECT_ID, created.noticeId)).audienceCount).toBe(1);
  });

  it('rejects unauthenticated callable requests', async () => {
    await expect(
      redeemInviteCallable(callableRequest({ code: INVITE_CODE })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      createNoticeCallable(
        callableRequest({
          projectId: PROJECT_ID,
          title: 'Unauthorized',
          body: 'No auth.',
          audience: { type: 'project' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      setNoticePinnedCallable(
        callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-1', pinned: true }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      markNoticeReadCallable(callableRequest({ projectId: PROJECT_ID, noticeId: 'notice-1' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('writes complete feed documents for display, read state, and queries', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const feed = await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get();

    expect(feed.data()).toMatchObject({
      uid: BUYER_ONE_UID,
      noticeId: created.noticeId,
      projectId: PROJECT_ID,
      title: 'Water supply scheduled',
      body: 'Water will be off between 10 AM and 2 PM.',
      pinned: false,
      readAt: null,
    });
    expect(feed.data()?.deliveredAt).toBeTruthy();
    expect(feed.data()?.updatedAt).toBeTruthy();
  });

  it('increments read count once under concurrent read requests', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();

    const results = await Promise.all([
      markNoticeReadCallable(callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID)),
      markNoticeReadCallable(callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID)),
      markNoticeReadCallable(callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID)),
      markNoticeReadCallable(callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID)),
    ]);

    expect(results.filter((result) => result.read === true)).toHaveLength(1);
    expect((await getNotice(PROJECT_ID, created.noticeId)).readCount).toBe(1);
  });

  it('keeps notice-delivery and pin failures independent for the same notice and recipient', async () => {
    const notice = await getNotice(PROJECT_ID, (await createNotice()).noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE delivery'));
    await recordFailure(notice, BUYER_ONE_UID, 'pin', new Error('UNAVAILABLE pin'));

    const failures = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    expect(failures.map((failure) => failure.id).sort()).toEqual(
      [
        failureId(notice.id, BUYER_ONE_UID, 'notice'),
        failureId(notice.id, BUYER_ONE_UID, 'pin'),
      ].sort(),
    );

    const withBoth = await getNotice(PROJECT_ID, notice.id);
    expect(withBoth.fanoutFailedCount).toBe(1);
    expect(withBoth.fanoutStatus).toBe('partial');
    expect(withBoth.pinFailedCount).toBe(1);
    expect(withBoth.pinStatus).toBe('partial');

    const deliveryFailure = failures.find((failure) => failure.kind === 'notice');
    expect(deliveryFailure).toBeDefined();
    await resolveFailure(deliveryFailure!);

    const remaining = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    expect(remaining.map((failure) => failure.kind)).toEqual(['pin']);
    const afterResolve = await getNotice(PROJECT_ID, notice.id);
    expect(afterResolve.fanoutFailedCount).toBe(0);
    expect(afterResolve.fanoutStatus).toBe('complete');
    expect(afterResolve.pinFailedCount).toBe(1);
    expect(afterResolve.pinStatus).toBe('partial');
  });

  it('does not double-count unresolved failures or decrement below zero', async () => {
    const notice = await getNotice(PROJECT_ID, (await createNotice()).noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE one'));
    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE two'));
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutFailedCount).toBe(1);

    const [failure] = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    await resolveFailure(failure);
    await resolveFailure(failure);
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutFailedCount).toBe(0);
  });

  it('excludes permanent validation and authorization failures from retry queries', async () => {
    const notice = await getNotice(PROJECT_ID, (await createNotice()).noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new HttpsError('permission-denied', 'denied'));

    const [failure] = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    expect(failure.retryable).toBe(false);
    expect(await listUnresolvedFailures({ retryableOnly: true })).toHaveLength(0);
  });

  it('keeps fan-out status partial while unresolved failures remain', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE before retry'));
    const stats = await fanOutToRecipients(notice, [BUYER_ONE_UID], 'notice');

    expect(stats.complete).toBe(false);
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutStatus).toBe('partial');
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutFailedCount).toBe(1);
  });

  it('resolves retryable failures and recomputes status on retry success', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE transient'));
    const stats = await retryNoticeFanout(PROJECT_ID, notice.id);

    expect(stats.failed).toBe(0);
    expect(await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id })).toHaveLength(0);
    const afterRetry = await getNotice(PROJECT_ID, notice.id);
    expect(afterRetry.fanoutFailedCount).toBe(0);
    expect(afterRetry.fanoutStatus).toBe('complete');
  });

  it('preserves unresolved records when retry fails', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);
    await db.doc(paths.feed(BUYER_ONE_UID, notice.id)).update({ pinned: 'invalid' });

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE transient'));
    const stats = await retryNoticeFanout(PROJECT_ID, notice.id);

    expect(stats.failed).toBe(1);
    const [failure] = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    expect(failure.resolved).toBe(false);
    expect(failure.attempts).toBe(1);
    expect(failure.retryable).toBe(false);
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutStatus).toBe('partial');
  });

  it('processes retryable failures through the scheduled retry helper', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE transient'));
    const run = await retryUnresolvedFailures();

    expect(run.failures).toBe(1);
    expect(run.resolved).toBe(1);
    expect(await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id })).toHaveLength(0);
  });

  it('propagates pin and unpin states idempotently', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
    const created = await createNotice();

    await setNoticePinnedCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId, pinned: true }, BUILDER_UID),
    );
    await setNoticePinnedCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId, pinned: true }, BUILDER_UID),
    );
    expect((await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get()).data()?.pinned).toBe(true);
    expect((await db.doc(paths.feed(BUYER_TWO_UID, created.noticeId)).get()).data()?.pinned).toBe(true);

    const unpinned = await setNoticePinnedCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId, pinned: false }, BUILDER_UID),
    );
    expect(unpinned.pinStatus).toBe('complete');
    expect((await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get()).data()?.pinned).toBe(false);
    expect((await db.doc(paths.feed(BUYER_TWO_UID, created.noticeId)).get()).data()?.pinned).toBe(false);
  });

  it('records partial pin propagation failures without losing successful updates', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
    const created = await createNotice();
    await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).update({ pinned: 'invalid' });

    const result = await setNoticePinnedCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId, pinned: true }, BUILDER_UID),
    );

    expect(result.propagation.failed).toBe(1);
    expect(result.pinFailedCount).toBe(1);
    expect(result.pinStatus).toBe('partial');
    expect((await db.doc(paths.feed(BUYER_TWO_UID, created.noticeId)).get()).data()?.pinned).toBe(true);
  });

  it('retries old pin failures against the latest canonical pinned state', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'pin', new Error('UNAVAILABLE stale pin'));
    await db.doc(paths.notice(PROJECT_ID, notice.id)).update({
      pinned: true,
      updatedAt: timestampNow(),
    });
    await db.doc(paths.feed(BUYER_ONE_UID, notice.id)).update({ pinned: true });
    await db.doc(paths.notice(PROJECT_ID, notice.id)).update({
      pinned: false,
      updatedAt: timestampNow(),
    });

    const stats = await retryNoticeFanout(PROJECT_ID, notice.id);

    expect(stats.failed).toBe(0);
    expect((await db.doc(paths.feed(BUYER_ONE_UID, notice.id)).get()).data()?.pinned).toBe(false);
    expect(await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id })).toHaveLength(0);
  });

  it('processes only the selected retry batch for a notice with many failures', async () => {
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);
    const totalFailures = RETRY_BATCH_LIMIT + 7;
    const now = timestampNow();
    const batch = db.batch();

    for (let index = 0; index < totalFailures; index += 1) {
      const id = failureId(notice.id, `batch-uid-${index}`, 'notice');
      batch.set(db.doc(paths.failure(PROJECT_ID, id)), {
        id,
        noticeId: notice.id,
        projectId: PROJECT_ID,
        uid: `batch-uid-${index}`,
        kind: 'notice',
        reason: 'UNAVAILABLE batched failure',
        resolved: false,
        retryable: true,
        attempts: 0,
        lastAttemptAt: null,
        updatedAt: now,
      });
      batch.set(db.doc(paths.feed(`batch-uid-${index}`, notice.id)), {
        uid: `batch-uid-${index}`,
        noticeId: notice.id,
        projectId: PROJECT_ID,
        title: 'Invalid feed',
        body: 'Invalid feed',
        pinned: 'invalid',
        deliveredAt: now,
        updatedAt: now,
        readAt: null,
      });
    }
    batch.update(db.doc(paths.notice(PROJECT_ID, notice.id)), {
      fanoutFailedCount: totalFailures,
      fanoutStatus: 'partial',
      updatedAt: now,
    });
    await batch.commit();

    const run = await retryUnresolvedFailures();

    expect(run.failures).toBe(RETRY_BATCH_LIMIT);
    expect(run.resolved).toBe(0);
    expect(run.failed).toBe(RETRY_BATCH_LIMIT);
    expect(
      await listUnresolvedFailures({
        projectId: PROJECT_ID,
        noticeId: notice.id,
        retryableOnly: true,
      }),
    ).toHaveLength(totalFailures - RETRY_BATCH_LIMIT);
    expect((await getNotice(PROJECT_ID, notice.id)).fanoutFailedCount).toBe(totalFailures);
  }, 120000);

  it('does not count skipped retry failures as resolved', async () => {
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);
    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE skip'));

    const beginSpy = jest.spyOn(failuresModule, 'beginRetryAttempt').mockResolvedValue(null);
    try {
      const run = await retryUnresolvedFailures();
      expect(run.failures).toBe(1);
      expect(run.resolved).toBe(0);
      expect(run.failed).toBe(0);
      expect(await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id })).toHaveLength(
        1,
      );
    } finally {
      beginSpy.mockRestore();
    }
  });

  it('reports incomplete retry when a terminal failure remains', async () => {
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new HttpsError('permission-denied', 'denied'));
    await recordFailure(notice, BUYER_TWO_UID, 'notice', new Error('UNAVAILABLE transient'));

    const stats = await retryNoticeFanout(PROJECT_ID, notice.id);

    expect(stats.failed).toBe(0);
    expect(stats.complete).toBe(false);
    const unresolved = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].retryable).toBe(false);
    const afterRetry = await getNotice(PROJECT_ID, notice.id);
    expect(afterRetry.fanoutFailedCount).toBe(1);
    expect(afterRetry.fanoutStatus).toBe('partial');
  });

  it('refreshes fanout and pin status from counters despite stale failure queries', async () => {
    const created = await createNotice();
    const notice = await getNotice(PROJECT_ID, created.noticeId);

    await recordFailure(notice, BUYER_ONE_UID, 'notice', new Error('UNAVAILABLE delivery'));
    await recordFailure(notice, BUYER_TWO_UID, 'pin', new Error('UNAVAILABLE pin'));
    const staleFailures = await listUnresolvedFailures({ projectId: PROJECT_ID, noticeId: notice.id });
    for (const failure of staleFailures) {
      await resolveFailure(failure);
    }

    const staleSpy = jest
      .spyOn(failuresModule, 'listUnresolvedFailures')
      .mockResolvedValue(staleFailures);
    try {
      await refreshNoticeStatus(PROJECT_ID, notice.id);
    } finally {
      staleSpy.mockRestore();
    }

    let current = await getNotice(PROJECT_ID, notice.id);
    expect(current.fanoutFailedCount).toBe(0);
    expect(current.fanoutStatus).toBe('complete');
    expect(current.pinFailedCount).toBe(0);
    expect(current.pinStatus).toBe('complete');

    const emptySpy = jest.spyOn(failuresModule, 'listUnresolvedFailures').mockResolvedValue([]);
    try {
      await recordFailure(
        current,
        BUYER_THREE_UID,
        'notice',
        new Error('UNAVAILABLE concurrent delivery'),
      );
      await recordFailure(current, BUYER_ONE_UID, 'pin', new Error('UNAVAILABLE concurrent pin'));
      await refreshNoticeStatus(PROJECT_ID, notice.id);
    } finally {
      emptySpy.mockRestore();
    }

    current = await getNotice(PROJECT_ID, notice.id);
    expect(current.fanoutFailedCount).toBe(1);
    expect(current.fanoutStatus).toBe('partial');
    expect(current.pinFailedCount).toBe(1);
    expect(current.pinStatus).toBe('partial');
  });

  it('rejects a unit whose tower belongs to another project', async () => {
    const now = timestampNow();
    await db.doc(paths.tower(PROJECT_ID, 'tower-foreign')).set({
      id: 'tower-foreign',
      projectId: 'other-project',
      name: 'Foreign tower',
      createdAt: now,
    });
    await db.doc(paths.unit(PROJECT_ID, 'unit-foreign')).set({
      id: 'unit-foreign',
      projectId: PROJECT_ID,
      towerId: 'tower-foreign',
      label: 'Foreign unit',
      createdAt: now,
    });

    await expect(createNotice({ type: 'unit', unitIds: ['unit-foreign'] })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect((await db.collection(paths.notices(PROJECT_ID)).get()).empty).toBe(true);
  });

  it('derives pin recipients from feed document paths instead of stored uid fields', async () => {
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    const created = await createNotice();
    await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).update({ uid: 'stored-wrong-uid' });

    const result = await setNoticePinnedCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId, pinned: true }, BUILDER_UID),
    );

    expect(result.propagation.failed).toBe(0);
    expect((await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get()).data()?.pinned).toBe(true);
    expect((await db.doc(paths.feed('stored-wrong-uid', created.noticeId)).get()).exists).toBe(false);
  });
});
