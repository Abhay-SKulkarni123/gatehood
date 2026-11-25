import { HttpsError } from 'firebase-functions/v2/https';
import type { MembershipDoc, Role } from './domain/types';
import { permissionDenied, unauthenticated } from './errors';
import { db } from './firestore';
import { paths } from './paths';
import { parseMembership } from './validation';

interface AuthRequest {
  auth?: { uid: string } | undefined;
}

export function requireUid(request: AuthRequest): string {
  if (!request.auth?.uid) {
    throw unauthenticated();
  }
  return request.auth.uid;
}

export async function requireProjectRole(
  projectId: string,
  uid: string,
  role: Role,
): Promise<MembershipDoc> {
  const snapshot = await db.doc(paths.member(projectId, uid)).get();
  if (!snapshot.exists) {
    throw permissionDenied();
  }

  try {
    const membership = parseMembership(snapshot.data());
    if (membership.role !== role) {
      throw permissionDenied();
    }
    return membership;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw permissionDenied();
  }
}

export function requireBuilder(projectId: string, uid: string): Promise<MembershipDoc> {
  return requireProjectRole(projectId, uid, 'builder');
}

export function requireBuyer(projectId: string, uid: string): Promise<MembershipDoc> {
  return requireProjectRole(projectId, uid, 'buyer');
}
