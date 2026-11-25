import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from '@react-native-firebase/auth';
import type { User } from '@react-native-firebase/auth';
import { getFirebaseServices } from '@/lib/firebase';
import { AuthActionError, describeAuthError, validateCredentials, validateRegistration } from '@/lib/auth/errors';
import { loginWithEmailPassword, logoutUser, registerBuyer } from '@/lib/auth/service';
import { subscribeToAuthState } from '@/lib/auth/subscription';
import { authStateReducer, initialAuthState } from '@/lib/auth/state';

jest.mock('@react-native-firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  getFirebaseServices: jest.fn(),
}));

const mockSignIn = signInWithEmailAndPassword as jest.Mock;
const mockCreateUser = createUserWithEmailAndPassword as jest.Mock;
const mockSignOut = signOut as jest.Mock;
const mockOnAuthStateChanged = onAuthStateChanged as jest.Mock;
const mockGetFirebaseServices = getFirebaseServices as jest.Mock;
const auth = {} as Parameters<typeof signInWithEmailAndPassword>[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFirebaseServices.mockReturnValue({ auth });
  mockSignIn.mockResolvedValue(undefined);
  mockCreateUser.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});

test('credential and registration validation blocks invalid input', () => {
  expect(validateCredentials('not-an-email', 'pass1234')).toBe('Enter a valid email address.');
  expect(validateCredentials('buyer@example.com', '')).toBe('Enter your password.');
  expect(validateCredentials('buyer@example.com', 'pass1234')).toBeNull();

  expect(
    validateRegistration({
      email: 'buyer@example.com',
      password: 'short1',
      confirmPassword: 'short1',
    }),
  ).toBe('Use at least 8 characters with a letter and a number.');
  expect(
    validateRegistration({
      email: 'buyer@example.com',
      password: 'password1',
      confirmPassword: 'password2',
    }),
  ).toBe('Passwords do not match.');
  expect(
    validateRegistration({
      email: 'buyer@example.com',
      password: 'password1',
      confirmPassword: 'password1',
    }),
  ).toBeNull();
});

test('auth errors are mapped to safe messages', () => {
  expect(describeAuthError({ code: 'auth/wrong-password' })).toBe(
    'The email or password is incorrect.',
  );
  expect(describeAuthError({ code: 'auth/network-request-failed' })).toContain('network problem');
  expect(describeAuthError(new AuthActionError('Enter a valid email address.'))).toBe(
    'Enter a valid email address.',
  );
  expect(describeAuthError(new Error('internal detail'))).toBe(
    'We could not complete that request. Please try again.',
  );
});

test('login rejects invalid credentials before calling Firebase', async () => {
  await expect(loginWithEmailPassword('bad', '')).rejects.toThrow('Enter a valid email address.');
  expect(mockSignIn).not.toHaveBeenCalled();
});

test('login, registration, and logout call Firebase auth with validated input', async () => {
  await loginWithEmailPassword(' buyer@example.com ', 'password1');
  await registerBuyer({
    email: ' buyer2@example.com ',
    password: 'password1',
    confirmPassword: 'password1',
  });
  await logoutUser();

  expect(mockSignIn).toHaveBeenCalledWith(auth, 'buyer@example.com', 'password1');
  expect(mockCreateUser).toHaveBeenCalledWith(auth, 'buyer2@example.com', 'password1');
  expect(mockSignOut).toHaveBeenCalledWith(auth);
});

test('Firebase auth errors are normalized for the UI', async () => {
  mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
  await expect(loginWithEmailPassword('buyer@example.com', 'password1')).rejects.toThrow(
    'The email or password is incorrect.',
  );
});

test('auth subscription registers once and returns unsubscribe', () => {
  const onUserChanged = jest.fn();
  const unsubscribe = jest.fn();
  mockOnAuthStateChanged.mockReturnValue(unsubscribe);

  expect(subscribeToAuthState(auth, onUserChanged)).toBe(unsubscribe);
  expect(mockOnAuthStateChanged).toHaveBeenCalledWith(auth, onUserChanged);
});

test('auth reducer tracks initialization, changes, actions, and sign-out', () => {
  const user = { uid: 'uid-1' } as User;
  const initialized = authStateReducer(initialAuthState, { type: 'initialized', user });
  expect(initialized).toEqual({
    user,
    sessionId: 1,
    authLoading: false,
    actionPending: false,
    actionError: null,
  });

  const started = authStateReducer(initialized, { type: 'actionStarted' });
  expect(started.actionPending).toBe(true);

  const failed = authStateReducer(started, { type: 'actionFailed', message: 'Nope' });
  expect(failed).toEqual({ ...initialized, actionError: 'Nope' });

  const succeeded = authStateReducer(failed, { type: 'actionSucceeded' });
  expect(succeeded.actionError).toBeNull();

  const changed = authStateReducer(succeeded, { type: 'userChanged', user: null });
  expect(changed.user).toBeNull();

  expect(authStateReducer(changed, { type: 'signedOut' })).toEqual({
    user: null,
    sessionId: 3,
    authLoading: false,
    actionPending: false,
    actionError: null,
  });
});

test('auth reducer creates a new session id for sign-out and same-uid sign-in', () => {
  const firstSession = authStateReducer(initialAuthState, {
    type: 'initialized',
    user: { uid: 'uid-1' } as User,
  });
  const signedOut = authStateReducer(firstSession, { type: 'userChanged', user: null });
  const sameUid = authStateReducer(signedOut, {
    type: 'userChanged',
    user: { uid: 'uid-1' } as User,
  });
  const switchedAccount = authStateReducer(sameUid, {
    type: 'userChanged',
    user: { uid: 'uid-2' } as User,
  });

  expect(firstSession.sessionId).toBe(1);
  expect(signedOut.sessionId).toBe(2);
  expect(sameUid.sessionId).toBe(3);
  expect(switchedAccount.sessionId).toBe(4);
  expect(firstSession.user?.uid).toBe(sameUid.user?.uid);
});
