import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { DEMO_PROJECT_ID } from '../src/config';
import { db, timestampNow } from '../src/firestore';
import { paths } from '../src/paths';
import { hashInviteCode } from '../src/security';
import { normalizeInviteCode } from '../src/validation';

export const PROJECT_ID = DEMO_PROJECT_ID;
export const BUILDER_UID = 'builder-uid';
export const BUYER_ONE_UID = 'buyer-one-uid';
export const BUYER_TWO_UID = 'buyer-two-uid';
export const BUYER_THREE_UID = 'buyer-three-uid';
export const TOWER_ID = 'tower-1';
export const TOWER_TWO_ID = 'tower-2';
export const UNIT_ONE_ID = 'unit-1';
export const UNIT_TWO_ID = 'unit-2';
export const UNIT_THREE_ID = 'unit-3';
export const INVITE_CODE = 'gatehood-code-1234';

export function callableRequest<T>(data: T, uid?: string): CallableRequest<T> {
  const auth = uid
    ? ({ uid, token: {}, rawToken: '' } as CallableRequest<T>['auth'])
    : undefined;
  return {
    data,
    auth,
    rawRequest: {} as CallableRequest<T>['rawRequest'],
    acceptsStreaming: false,
  };
}

async function deleteCollection(collectionRef: CollectionReference): Promise<void> {
  const snapshot = await collectionRef.get();
  await Promise.all(snapshot.docs.map((document) => deleteDocument(document.ref)));
}

async function deleteDocument(documentRef: DocumentReference): Promise<void> {
  const collections = await documentRef.listCollections();
  await Promise.all(collections.map(deleteCollection));
  await documentRef.delete();
}

export async function clearDatabase(): Promise<void> {
  await deleteCollection(db.collection('projects'));
  await deleteCollection(db.collection('users'));
  await deleteCollection(db.collection('invites'));
  await db.doc(paths.retryLock()).delete();
}

export async function seedProject(): Promise<void> {
  const now = timestampNow();
  await db.doc(paths.project(PROJECT_ID)).set({
    id: PROJECT_ID,
    name: 'Test Project',
    createdByUid: BUILDER_UID,
    createdAt: now,
  });
  await db.doc(paths.member(PROJECT_ID, BUILDER_UID)).set({
    uid: BUILDER_UID,
    projectId: PROJECT_ID,
    role: 'builder',
    towerId: null,
    unitId: null,
    createdByUid: BUILDER_UID,
    createdAt: now,
  });
  await db.doc(paths.tower(PROJECT_ID, TOWER_ID)).set({
    id: TOWER_ID,
    projectId: PROJECT_ID,
    name: 'Tower 1',
    createdAt: now,
  });
  await db.doc(paths.unit(PROJECT_ID, UNIT_ONE_ID)).set({
    id: UNIT_ONE_ID,
    projectId: PROJECT_ID,
    towerId: TOWER_ID,
    label: 'Unit 101',
    createdAt: now,
  });
  await db.doc(paths.unit(PROJECT_ID, UNIT_TWO_ID)).set({
    id: UNIT_TWO_ID,
    projectId: PROJECT_ID,
    towerId: TOWER_ID,
    label: 'Unit 102',
    createdAt: now,
  });
  await db.doc(paths.tower(PROJECT_ID, TOWER_TWO_ID)).set({
    id: TOWER_TWO_ID,
    projectId: PROJECT_ID,
    name: 'Tower 2',
    createdAt: now,
  });
  await db.doc(paths.unit(PROJECT_ID, UNIT_THREE_ID)).set({
    id: UNIT_THREE_ID,
    projectId: PROJECT_ID,
    towerId: TOWER_TWO_ID,
    label: 'Unit 201',
    createdAt: now,
  });
}

export async function seedBuyer(
  uid: string,
  unitId: string,
  towerId: string = TOWER_ID,
): Promise<void> {
  const now = timestampNow();
  await db.doc(paths.member(PROJECT_ID, uid)).set({
    uid,
    projectId: PROJECT_ID,
    role: 'buyer',
    towerId,
    unitId,
    createdByUid: BUILDER_UID,
    createdAt: now,
  });
  await db.doc(paths.user(uid)).set({
    uid,
    displayName: null,
    phone: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function seedInvite(options: {
  code?: string;
  usedByUid?: string | null;
  expiresAt?: Timestamp;
  unitId?: string;
} = {}): Promise<string> {
  const code = options.code ?? INVITE_CODE;
  const normalized = normalizeInviteCode(code);
  const codeHash = hashInviteCode(normalized);
  const now = timestampNow();
  const expiresAt = options.expiresAt ?? Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

  await db.doc(paths.invite(codeHash)).set({
    id: codeHash,
    projectId: PROJECT_ID,
    towerId: TOWER_ID,
    unitId: options.unitId ?? UNIT_ONE_ID,
    codeHash,
    createdByUid: BUILDER_UID,
    createdAt: now,
    expiresAt,
    usedByUid: options.usedByUid ?? null,
    usedAt: options.usedByUid ? now : null,
    revokedAt: null,
  });

  return codeHash;
}
