import { createHash } from 'crypto';

export function hashInviteCode(normalizedCode: string): string {
  return createHash('sha256').update(normalizedCode, 'utf8').digest('hex');
}

export function safeFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 200);
  }
  return 'Unknown failure';
}
