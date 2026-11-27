const TRANSIENT_CALLABLE_CODES = new Set([
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'network',
  'unavailable',
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  /network/,
  /offline/,
  /timeout/,
  /timed out/,
  /unavailable/,
  /failed to fetch/,
  /interrupted connection/,
  /unreachable host/,
];

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') {
    return '';
  }
  return code.replace(/^functions\//, '').toLowerCase();
}

export function isTransientCallableError(error: unknown): boolean {
  const code = errorCode(error);
  if (code) {
    return TRANSIENT_CALLABLE_CODES.has(code);
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function describeCallableError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = errorCode(error);

  if (code === 'permission-denied') {
    return 'You do not have access to this operation.';
  }
  if (code.startsWith('appcheck/')) {
    return 'App Check could not verify this request. Check your configuration and try again.';
  }
  if (code === 'unauthenticated') {
    return 'Request was rejected by Firebase. Check your session and App Check configuration, then try again.';
  }
  if (message) {
    return message;
  }
  return 'The operation could not be completed. Check your connection and try again.';
}
