import { doc, getDoc } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import { isMembershipDoc, loadMembership } from '@/lib/membership/repository';

jest.mock('@react-native-firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

const mockDoc = doc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const firestore = {} as Firestore;
const projectId = 'project-1';
const uid = 'buyer-1';

function timestamp() {
  return {
    seconds: 1,
    nanoseconds: 0,
    toDate: jest.fn(),
    toMillis: jest.fn(),
  };
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    uid,
    projectId,
    role: 'buyer',
    towerId: null,
    unitId: null,
    createdByUid: 'builder-1',
    createdAt: timestamp(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc.mockReturnValue('member-ref');
});

test('membership type guard validates identity, role, nullable fields, and timestamp', () => {
  expect(isMembershipDoc(membership(), uid, projectId)).toBe(true);
  expect(isMembershipDoc(membership({ uid: 'someone-else' }), uid, projectId)).toBe(false);
  expect(isMembershipDoc(membership({ projectId: 'other' }), uid, projectId)).toBe(false);
  expect(isMembershipDoc(membership({ role: 'admin' }), uid, projectId)).toBe(false);
  expect(isMembershipDoc(membership({ towerId: 7 }), uid, projectId)).toBe(false);
  expect(isMembershipDoc(membership({ createdAt: { seconds: 1 } }), uid, projectId)).toBe(false);
});

test('missing membership document is reported as missing', async () => {
  mockGetDoc.mockResolvedValue({ exists: () => false });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({ status: 'missing' });
  expect(mockDoc).toHaveBeenCalledWith(firestore, 'projects', projectId, 'members', uid);
});

test('valid membership document is returned unchanged', async () => {
  const value = membership({ role: 'builder', towerId: 'tower-1' });
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => value });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({
    status: 'ready',
    membership: value,
  });
});

test('malformed membership document is reported as invalid', async () => {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    data: () => membership({ role: 'unknown' }),
  });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({ status: 'invalid' });
});

test('permission denied on own membership is treated as missing, not a network failure', async () => {
  mockGetDoc.mockRejectedValue({ code: 'permission-denied' });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({ status: 'missing' });
});

test('namespaced firestore permission denied is treated as missing', async () => {
  mockGetDoc.mockRejectedValue({ code: 'firestore/permission-denied' });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({ status: 'missing' });
});

test('App Check token failures are retryable infrastructure errors', async () => {
  mockGetDoc.mockRejectedValue({ code: 'appCheck/fetch-status-error' });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({
    status: 'error',
    message: 'We could not verify this app. Check your connection and try again.',
    retryable: true,
  });
});

test('unavailable membership lookup is a retryable error and never proves missing', async () => {
  mockGetDoc.mockRejectedValue({ code: 'unavailable' });

  await expect(loadMembership(firestore, projectId, uid)).resolves.toEqual({
    status: 'error',
    message: 'We could not check your project membership. Check your connection and try again.',
    retryable: true,
  });
});
