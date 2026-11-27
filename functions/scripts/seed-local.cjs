const { initializeApp, getApp, getApps } = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const CONSTRUCTION_PROJECT_ID = 'demo-project';
const BUILDER_UID = 'local-builder-uid';
const BUYER_UID = 'local-buyer-uid';
const BUILDER_EMAIL = 'builder@gatehood.test';
const BUYER_EMAIL = 'buyer@gatehood.test';
const TEST_PASSWORD = 'Gatehood123!';
const TOWER_ID = 'tower-1';
const UNIT_ID = 'unit-1';

function requireLocalEmulator(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to a local emulator host.`);
  }
  const host = value.split(':')[0].replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`${name} must point to a local emulator.`);
  }
  return value;
}

function resolveEmulatorProjectId() {
  let projectId = process.env.GCLOUD_PROJECT;
  if (!projectId && process.env.FIREBASE_CONFIG) {
    try {
      projectId = JSON.parse(process.env.FIREBASE_CONFIG).projectId;
    } catch {
      projectId = undefined;
    }
  }
  if (!projectId) {
    throw new Error('Set GCLOUD_PROJECT to the emulator project ID before seeding.');
  }
  return projectId;
}

async function ensureUser(auth, uid, email, displayName) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, {
      email,
      displayName,
      password: TEST_PASSWORD,
      emailVerified: false,
    });
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      await auth.createUser({
        uid,
        email,
        displayName,
        password: TEST_PASSWORD,
        emailVerified: false,
      });
      return;
    }
    throw error;
  }
}

async function main() {
  requireLocalEmulator('FIRESTORE_EMULATOR_HOST');
  requireLocalEmulator('FIREBASE_AUTH_EMULATOR_HOST');
  const projectId = resolveEmulatorProjectId();

  const app = getApps().length === 0 ? initializeApp({ projectId }) : getApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  await Promise.all([
    ensureUser(auth, BUILDER_UID, BUILDER_EMAIL, 'Local Builder'),
    ensureUser(auth, BUYER_UID, BUYER_EMAIL, 'Local Buyer'),
  ]);

  const batch = firestore.batch();

  batch.set(
    firestore.collection('projects').doc(CONSTRUCTION_PROJECT_ID),
    {
      id: CONSTRUCTION_PROJECT_ID,
      name: 'Local Demo Project',
      createdByUid: BUILDER_UID,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    firestore.collection('projects').doc(CONSTRUCTION_PROJECT_ID).collection('members').doc(BUILDER_UID),
    {
      uid: BUILDER_UID,
      projectId: CONSTRUCTION_PROJECT_ID,
      role: 'builder',
      towerId: null,
      unitId: null,
      createdByUid: BUILDER_UID,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    firestore.collection('projects').doc(CONSTRUCTION_PROJECT_ID).collection('members').doc(BUYER_UID),
    {
      uid: BUYER_UID,
      projectId: CONSTRUCTION_PROJECT_ID,
      role: 'buyer',
      towerId: TOWER_ID,
      unitId: UNIT_ID,
      createdByUid: BUILDER_UID,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    firestore.collection('projects').doc(CONSTRUCTION_PROJECT_ID).collection('towers').doc(TOWER_ID),
    {
      id: TOWER_ID,
      projectId: CONSTRUCTION_PROJECT_ID,
      name: 'Tower 1',
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    firestore.collection('projects').doc(CONSTRUCTION_PROJECT_ID).collection('units').doc(UNIT_ID),
    {
      id: UNIT_ID,
      projectId: CONSTRUCTION_PROJECT_ID,
      towerId: TOWER_ID,
      label: 'Unit 101',
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  for (const [uid, displayName] of [
    [BUILDER_UID, 'Local Builder'],
    [BUYER_UID, 'Local Buyer'],
  ]) {
    batch.set(
      firestore.collection('users').doc(uid),
      {
        uid,
        displayName,
        phone: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();

  console.log(`Seeded local emulator project ${CONSTRUCTION_PROJECT_ID}.`);
  console.log(`Builder sign-in: ${BUILDER_EMAIL}`);
  console.log(`Buyer sign-in: ${BUYER_EMAIL}`);
  console.log(`Password for both local users: ${TEST_PASSWORD}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Unable to seed local emulator.');
  process.exitCode = 1;
});
