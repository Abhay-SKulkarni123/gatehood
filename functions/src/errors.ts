import { HttpsError } from 'firebase-functions/v2/https';
import { ZodError } from 'zod';

export function unauthenticated(): HttpsError {
  return new HttpsError('unauthenticated', 'Authentication required.');
}

export function permissionDenied(): HttpsError {
  return new HttpsError('permission-denied', 'You do not have access to this operation.');
}

export function invalidPayload(message?: string): HttpsError {
  return new HttpsError('invalid-argument', message ?? 'The request payload is invalid.');
}

export function invalidInvite(): HttpsError {
  return new HttpsError('invalid-argument', 'The invite code is invalid or expired.');
}

export function noticeNotFound(): HttpsError {
  return new HttpsError('not-found', 'The notice was not found.');
}

export function internal(): HttpsError {
  return new HttpsError('internal', 'The operation could not be completed.');
}

export function asHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) {
    return error;
  }
  return internal();
}

export function isTransientError(error: unknown): boolean {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  if (code && /ABORTED|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|ETIMEDOUT/i.test(code)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /ABORTED|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|ETIMEDOUT|ECONNRESET/i.test(
    error.message,
  );
}

export function isPermanentError(error: unknown): boolean {
  if (error instanceof ZodError) {
    return true;
  }
  if (error instanceof HttpsError) {
    return [
      'invalid-argument',
      'permission-denied',
      'not-found',
      'already-exists',
      'failed-precondition',
      'unauthenticated',
    ].includes(error.code);
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /Invalid Firestore document|Document does not exist|Invalid request payload/i.test(
    error.message,
  );
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
