export class AuthActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthActionError';
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegistrationInput = {
  email: string;
  password: string;
  confirmPassword: string;
};

function hasLetterAndNumber(value: string): boolean {
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

export function validateCredentials(email: string, password: string): string | null {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return 'Enter a valid email address.';
  }
  if (!password) {
    return 'Enter your password.';
  }
  return null;
}

export function validateRegistration({
  email,
  password,
  confirmPassword,
}: RegistrationInput): string | null {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
    return 'Enter a valid email address.';
  }
  if (password.length < 8 || !hasLetterAndNumber(password)) {
    return 'Use at least 8 characters with a letter and a number.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

export function describeAuthError(error: unknown): string {
  if (error instanceof AuthActionError) {
    return error.message;
  }

  const code = errorCode(error);
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) {
    return 'The email or password is incorrect.';
  }
  if (code === 'auth/invalid-email') {
    return 'Enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Use at least 8 characters with a letter and a number.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists for that email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (['auth/network-request-failed', 'auth/unavailable', 'auth/timeout'].includes(code)) {
    return 'A network problem prevented sign-in. Check your connection and try again.';
  }
  return 'We could not complete that request. Please try again.';
}
