import * as callableFunctions from '../src/index';
import type { CreateNoticeResult } from '../src/domain/types';
import { getNotice } from '../src/fanout';
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

const createNoticeCallable = callableFunctions.createNotice.run;
const markNoticeReadCallable = callableFunctions.markNoticeRead.run;

async function createNotice(): Promise<CreateNoticeResult> {
  return (await createNoticeCallable(
    callableRequest(
      {
        projectId: PROJECT_ID,
        title: 'Offline read replay notice',
        body: 'Read actions must remain idempotent after reconnect.',
        audience: { type: 'project' },
      },
      BUILDER_UID,
    ),
  )) as CreateNoticeResult;
}

describe('Phase 6 offline read integration', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
    await seedBuyer(BUYER_ONE_UID, UNIT_ONE_ID, TOWER_ID);
    await seedBuyer(BUYER_TWO_UID, UNIT_TWO_ID, TOWER_ID);
  });

  it('confirms replayed reads once and treats later replay attempts as already read', async () => {
    const created = await createNotice();
    const first = await markNoticeReadCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID),
    );
    const replayed = await markNoticeReadCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID),
    );

    expect(first.read).toBe(true);
    expect(replayed.read).toBe(false);
    expect((await getNotice(PROJECT_ID, created.noticeId)).readCount).toBe(1);

    const feed = await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get();
    expect(feed.data()?.readAt).toBeTruthy();
  });

  it('never marks another buyer feed or another project as read through replay data', async () => {
    const created = await createNotice();

    await expect(
      markNoticeReadCallable(
        callableRequest({ projectId: 'other-project', noticeId: created.noticeId }, BUYER_ONE_UID),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });

    await markNoticeReadCallable(
      callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }, BUYER_ONE_UID),
    );

    const buyerOneFeed = await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get();
    const buyerTwoFeed = await db.doc(paths.feed(BUYER_TWO_UID, created.noticeId)).get();
    expect(buyerOneFeed.data()?.readAt).toBeTruthy();
    expect(buyerTwoFeed.data()?.readAt).toBeNull();
    expect((await getNotice(PROJECT_ID, created.noticeId)).readCount).toBe(1);
  });

  it('keeps feed read state unchanged when the callable fails authorization', async () => {
    const created = await createNotice();

    await expect(
      markNoticeReadCallable(
        callableRequest({ projectId: PROJECT_ID, noticeId: created.noticeId }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    const feed = await db.doc(paths.feed(BUYER_ONE_UID, created.noticeId)).get();
    expect(feed.data()?.readAt).toBeNull();
    expect((await getNotice(PROJECT_ID, created.noticeId)).readCount).toBe(0);
  });
});
