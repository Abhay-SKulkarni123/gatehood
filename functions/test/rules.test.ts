import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { db, timestampNow } from '../src/firestore';
import { paths } from '../src/paths';
import {
  BUILDER_UID,
  BUYER_ONE_UID,
  BUYER_TWO_UID,
  PROJECT_ID,
  seedBuyer,
  seedProject,
} from './helpers';

let testEnv: RulesTestEnvironment;

async function seedFeed(uid: string): Promise<void> {
  const now = timestampNow();
  await db.doc(paths.feed(uid, 'notice-1')).set({
    uid,
    noticeId: 'notice-1',
    projectId: PROJECT_ID,
    title: 'Notice',
    body: 'Body',
    pinned: false,
    deliveredAt: now,
    updatedAt: now,
    readAt: null,
  });
}

describe('Firestore security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedProject();
    await seedBuyer(BUYER_ONE_UID, 'unit-1');
    await seedBuyer(BUYER_TWO_UID, 'unit-2');
    await seedFeed(BUYER_ONE_UID);
    await db.doc(paths.buyerContact(PROJECT_ID, 'contact-1')).set({
      id: 'contact-1',
      projectId: PROJECT_ID,
      towerId: 'tower-1',
      unitId: 'unit-1',
      name: 'Asha',
      phone: '+15550104',
      importedByUid: BUILDER_UID,
      importedAt: timestampNow(),
      updatedAt: timestampNow(),
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('allows a buyer to read only their own feed', async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    await assertSucceeds(buyerDb.doc(paths.feed(BUYER_ONE_UID, 'notice-1')).get());
    await assertFails(buyerDb.doc(paths.feed(BUYER_TWO_UID, 'notice-1')).get());
  });

  it('denies buyers writing to feed documents', async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    await assertFails(
      buyerDb.doc(paths.feed(BUYER_ONE_UID, 'notice-1')).update({
        readAt: null,
        pinned: true,
      }),
    );
  });

  it('allows builders but not buyers to read canonical notices and fan-out failures', async () => {
    const now = timestampNow();
    await db.doc(paths.notice(PROJECT_ID, 'notice-1')).set({
      id: 'notice-1',
      projectId: PROJECT_ID,
      title: 'Title',
      body: 'Body',
      pinned: false,
      audience: { type: 'project' },
      audienceCount: 1,
      readCount: 0,
      fanoutStatus: 'complete',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(paths.failure(PROJECT_ID, 'failure-1')).set({
      id: 'failure-1',
      noticeId: 'notice-1',
      projectId: PROJECT_ID,
      uid: BUYER_ONE_UID,
      reason: 'test',
      createdAt: now,
      updatedAt: now,
    });
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();

    await assertSucceeds(builderDb.doc(paths.notice(PROJECT_ID, 'notice-1')).get());
    await assertFails(buyerDb.doc(paths.notice(PROJECT_ID, 'notice-1')).get());
    await assertSucceeds(builderDb.doc(paths.failure(PROJECT_ID, 'failure-1')).get());
    await assertFails(buyerDb.doc(paths.failure(PROJECT_ID, 'failure-1')).get());
  });

  it('denies client writes to canonical notices', async () => {
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    await assertFails(
      builderDb.doc(paths.notice(PROJECT_ID, 'notice-2')).set({
        title: 'Client write',
        body: 'Should fail',
      }),
    );
  });

  it('allows builders to read memberships but not other buyers', async () => {
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    await assertSucceeds(builderDb.doc(paths.member(PROJECT_ID, BUYER_ONE_UID)).get());
    await assertFails(buyerDb.doc(paths.member(PROJECT_ID, BUYER_TWO_UID)).get());
  });

  it('denies an unprovisioned user reading their own membership', async () => {
    const unprovisionedDb = testEnv.authenticatedContext('unprovisioned-uid').firestore();
    await assertFails(unprovisionedDb.doc(paths.member(PROJECT_ID, 'unprovisioned-uid')).get());
  });

  it('denies unauthenticated reads', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(anonymousDb.doc(paths.project(PROJECT_ID)).get());
  });

  it('allows builders but not buyers to read imported buyer contacts', async () => {
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    await assertSucceeds(builderDb.doc(paths.buyerContact(PROJECT_ID, 'contact-1')).get());
    await assertFails(buyerDb.doc(paths.buyerContact(PROJECT_ID, 'contact-1')).get());
    await assertFails(
      builderDb.doc(paths.buyerContact(PROJECT_ID, 'contact-1')).update({ name: 'Changed' }),
    );
  });

  it('allows buyers to read their assigned unit but not other units', async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    await assertSucceeds(buyerDb.doc(paths.unit(PROJECT_ID, 'unit-1')).get());
    await assertFails(buyerDb.doc(paths.unit(PROJECT_ID, 'unit-2')).get());
    await assertSucceeds(builderDb.doc(paths.unit(PROJECT_ID, 'unit-2')).get());
  });

  it('denies client writes to unit details', async () => {
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    await assertFails(
      buyerDb.doc(paths.unit(PROJECT_ID, 'unit-1')).update({ configuration: 'Client write' }),
    );
    await assertFails(
      builderDb.doc(paths.unit(PROJECT_ID, 'unit-1')).update({ constructionProgress: 100 }),
    );
  });

  it('denies all client access to invite documents and invite slots', async () => {
    const builderDb = testEnv.authenticatedContext(BUILDER_UID).firestore();
    const buyerDb = testEnv.authenticatedContext(BUYER_ONE_UID).firestore();
    await assertFails(builderDb.doc(paths.invite('a'.repeat(64))).get());
    await assertFails(
      builderDb.doc(paths.invite('b'.repeat(64))).set({
        codeHash: 'b'.repeat(64),
      }),
    );
    await assertFails(buyerDb.doc(paths.inviteSlot(PROJECT_ID, 'unit-1')).get());
    await assertFails(
      builderDb.doc(paths.inviteSlot(PROJECT_ID, 'unit-1')).set({
        codeHash: 'c'.repeat(64),
      }),
    );
  });
});
