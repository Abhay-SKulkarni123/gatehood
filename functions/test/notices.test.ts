import type { CreateNoticeResult, MarkNoticeReadResult, SetNoticePinnedResult } from '../src/domain/types';
import { fanOutToRecipients, getNotice } from '../src/fanout';
import * as callableFunctions from '../src/index';
import { db } from '../src/firestore';
import { paths } from '../src/paths';
import {
  BUILDER_UID,
  BUYER_ONE_UID,
  BUYER_TWO_UID,
  PROJECT_ID,
  callableRequest,
  clearDatabase,
  seedBuyer,
  seedProject,
} from './helpers';

const wrappedCreateNotice = callableFunctions.createNotice.run;
const wrappedSetNoticePinned = callableFunctions.setNoticePinned.run;
const wrappedMarkNoticeRead = callableFunctions.markNoticeRead.run;

async function createProjectNotice(): Promise<CreateNoticeResult> {
  return (await wrappedCreateNotice(
    callableRequest(
      {
        projectId: PROJECT_ID,
        title: 'Water supply scheduled',
        body: 'Water will be off between 10 AM and 2 PM.',
        audience: { type: 'project' },
      },
      BUILDER_UID,
    ),
  )) as CreateNoticeResult;
}

describe('notice callables', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
    await seedBuyer(BUYER_ONE_UID, 'unit-1');
    await seedBuyer(BUYER_TWO_UID, 'unit-2');
  });

  it('fans out a project notice to all buyer feeds exactly once', async () => {
    const result = await createProjectNotice();
    expect(result.fanout.attempted).toBe(2);
    expect(result.fanout.created).toBe(2);
    expect(result.fanout.failed).toBe(0);
    expect(result.audienceCount).toBe(2);

    const notice = await getNotice(PROJECT_ID, result.noticeId);
    expect(notice.fanoutStatus).toBe('complete');
    expect((await db.doc(paths.feed(BUYER_ONE_UID, result.noticeId)).get()).exists).toBe(true);
    expect((await db.doc(paths.feed(BUYER_TWO_UID, result.noticeId)).get()).exists).toBe(true);

    const retry = await fanOutToRecipients(notice, [BUYER_ONE_UID, BUYER_TWO_UID], 'notice');
    const afterRetry = await getNotice(PROJECT_ID, result.noticeId);
    expect(retry.created).toBe(0);
    expect(retry.failed).toBe(0);
    expect(afterRetry.audienceCount).toBe(2);
  });

  it('propagates pin state idempotently', async () => {
    const notice = await createProjectNotice();
    const first = (await wrappedSetNoticePinned(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: notice.noticeId, pinned: true },
        BUILDER_UID,
      ),
    )) as SetNoticePinnedResult;
    const second = (await wrappedSetNoticePinned(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: notice.noticeId, pinned: true },
        BUILDER_UID,
      ),
    )) as SetNoticePinnedResult;

    expect(first.pinStatus).toBe('complete');
    expect(second.pinStatus).toBe('complete');
    const feed = await db.doc(paths.feed(BUYER_ONE_UID, notice.noticeId)).get();
    expect(feed.data()?.pinned).toBe(true);
  });

  it('increments read count only on the first read', async () => {
    const notice = await createProjectNotice();
    const first = (await wrappedMarkNoticeRead(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: notice.noticeId },
        BUYER_ONE_UID,
      ),
    )) as MarkNoticeReadResult;
    const second = (await wrappedMarkNoticeRead(
      callableRequest(
        { projectId: PROJECT_ID, noticeId: notice.noticeId },
        BUYER_ONE_UID,
      ),
    )) as MarkNoticeReadResult;

    expect(first.read).toBe(true);
    expect(first.readCount).toBe(1);
    expect(second.read).toBe(false);
    expect(second.readCount).toBe(1);
    expect((await getNotice(PROJECT_ID, notice.noticeId)).readCount).toBe(1);
  });

  it('rejects non-builders creating notices', async () => {
    await expect(
      wrappedCreateNotice(
        callableRequest(
          {
            projectId: PROJECT_ID,
            title: 'Unauthorized',
            body: 'Buyer should not create notices.',
            audience: { type: 'project' },
          },
          BUYER_ONE_UID,
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
