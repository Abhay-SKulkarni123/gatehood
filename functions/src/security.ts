import { createHash } from 'crypto';

export function hashInviteCode(normalizedCode: string): string {
  return createHash('sha256').update(normalizedCode, 'utf8').digest('hex');
}

export function stableImportId(kind: 'tower' | 'unit' | 'contact', projectId: string, key: string): string {
  const digest = createHash('sha256')
    .update(projectId, 'utf8')
    .update('\u0000', 'utf8')
    .update(kind, 'utf8')
    .update('\u0000', 'utf8')
    .update(key, 'utf8')
    .digest('hex');
  return kind === 'contact' ? digest : `${kind}-${digest.slice(0, 32)}`;
}

export function safeFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 200);
  }
  return 'Unknown failure';
}
