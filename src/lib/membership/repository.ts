import { doc, getDoc } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FirestoreTimestamp, MembershipDoc } from '@/types/domain';
import type { MembershipState } from './state';

function isTimestamp(value: unknown): value is FirestoreTimestamp {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<FirestoreTimestamp>;
  return (
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number' &&
    typeof candidate.toDate === 'function' &&
    typeof candidate.toMillis === 'function'
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

export function isMembershipDoc(
  value: unknown,
  expectedUid: string,
  expectedProjectId: string,
): value is MembershipDoc {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MembershipDoc>;
  return (
    candidate.uid === expectedUid &&
    candidate.projectId === expectedProjectId &&
    (candidate.role === 'builder' || candidate.role === 'buyer') &&
    isNullableString(candidate.towerId) &&
    isNullableString(candidate.unitId) &&
    typeof candidate.createdByUid === 'string' &&
    candidate.createdByUid.length > 0 &&
    isTimestamp(candidate.createdAt)
  );
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

function membershipErrorState(error: unknown): MembershipState {
  const code = errorCode(error);
  if (code === 'permission-denied') {
    return { status: 'missing' };
  }
  if (
    ['unavailable', 'deadline-exceeded', 'network-request-failed', 'internal'].includes(code) ||
    code === ''
  ) {
    return {
      status: 'error',
      message: 'We could not check your project membership. Check your connection and try again.',
      retryable: true,
    };
  }
  return {
    status: 'error',
    message: 'We could not check your project membership.',
    retryable: true,
  };
}

export async function loadMembership(
  firestore: Firestore,
  projectId: string,
  uid: string,
): Promise<MembershipState> {
  try {
    const snapshot = await getDoc(doc(firestore, 'projects', projectId, 'members', uid));
    if (!snapshot.exists()) {
      return { status: 'missing' };
    }

    const value = snapshot.data();
    if (!isMembershipDoc(value, uid, projectId)) {
      return { status: 'invalid' };
    }
    return { status: 'ready', membership: value };
  } catch (error) {
    return membershipErrorState(error);
  }
}
