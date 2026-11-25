import { Timestamp } from 'firebase-admin/firestore';
import * as callableFunctions from '../src/index';
import { db, timestampNow } from '../src/firestore';
import { paths } from '../src/paths';
import { hashInviteCode } from '../src/security';
import { normalizeInviteCode } from '../src/validation';
import {
  BUYER_ONE_UID,
  BUYER_TWO_UID,
  INVITE_CODE,
  PROJECT_ID,
  callableRequest,
  clearDatabase,
  seedInvite,
  seedProject,
} from './helpers';

const wrappedRedeemInvite = callableFunctions.redeemInvite.run;

describe('redeemInvite', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedProject();
  });

  it('normalizes the code, consumes the invite, and creates buyer membership', async () => {
    const codeHash = await seedInvite();
    const result = await wrappedRedeemInvite(
      callableRequest({ code: `  ${INVITE_CODE.toLowerCase()}  ` }, BUYER_ONE_UID),
    );

    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.alreadyMember).toBe(false);
    expect(result.backfill.complete).toBe(true);

    const membership = await db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).get();
    expect(membership.exists).toBe(true);
    expect(membership.data()?.role).toBe('buyer');

    const invite = await db.doc(paths.invite(codeHash)).get();
    expect(invite.data()?.usedByUid).toBe(BUYER_ONE_UID);
    expect(invite.data()?.usedAt).toBeTruthy();
    expect(invite.data()?.codeHash).toBe(hashInviteCode(normalizeInviteCode(INVITE_CODE)));
  });

  it('is idempotent for the same uid and code', async () => {
    await seedInvite();
    const first = await wrappedRedeemInvite(
      callableRequest({ code: INVITE_CODE }, BUYER_ONE_UID),
    );
    const second = await wrappedRedeemInvite(
      callableRequest({ code: INVITE_CODE }, BUYER_ONE_UID),
    );

    expect(first.alreadyMember).toBe(false);
    expect(second.alreadyMember).toBe(true);
  });

  it('rejects invalid, expired, and other-user codes with the same safe error', async () => {
    const expiredHash = hashInviteCode(normalizeInviteCode('expired-code-1234'));
    await seedInvite({
      code: 'expired-code-1234',
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    const usedHash = await seedInvite({
      code: 'used-code-12345',
      usedByUid: BUYER_TWO_UID,
    });

    await expect(
      wrappedRedeemInvite(callableRequest({ code: 'BAD' }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      wrappedRedeemInvite(callableRequest({ code: 'expired-code-1234' }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      wrappedRedeemInvite(callableRequest({ code: 'used-code-12345' }, BUYER_ONE_UID)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect((await db.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).get()).exists).toBe(false);
    expect((await db.doc(paths.invite(expiredHash)).get()).data()?.usedByUid).toBeNull();
    expect((await db.doc(paths.invite(usedHash)).get()).data()?.usedByUid).toBe(BUYER_TWO_UID);
    expect((await db.doc(paths.user(BUYER_ONE_UID)).get()).exists).toBe(false);
  });

  it('rejects unauthenticated callers', async () => {
    await seedInvite();
    await expect(
      wrappedRedeemInvite(callableRequest({ code: INVITE_CODE })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('does not depend on the invite creation timestamp for expiry', async () => {
    await seedInvite();
    const invite = await db.doc(paths.invite(hashInviteCode(normalizeInviteCode(INVITE_CODE)))).get();
    expect(timestampNow().toMillis()).toBeGreaterThan(invite.data()?.createdAt.toMillis());
  });
});
