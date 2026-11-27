import { act } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@react-native-firebase/auth';
import { usePathname } from 'expo-router';
import { getClientConfig } from '@/config/env';
import { useAccessDecision } from '@/hooks/use-access-decision';
import { getFirebaseServices } from '@/lib/firebase';
import { subscribeToAuthState } from '@/lib/auth/subscription';
import type { MembershipState } from '@/lib/membership/state';
import { loadMembership } from '@/lib/membership/repository';
import type { AccessDecision, AppRoute } from '@/navigation/access';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { MembershipProvider, useMembership } from '@/providers/membership-provider';

jest.mock('expo-router', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/config/env', () => ({
  getClientConfig: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  getFirebaseServices: jest.fn(),
}));

jest.mock('@/lib/auth/subscription', () => ({
  subscribeToAuthState: jest.fn(),
}));

jest.mock('@/lib/auth/service', () => ({
  loginWithEmailPassword: jest.fn(),
  logoutUser: jest.fn(),
  registerBuyer: jest.fn(),
}));

jest.mock('@/lib/membership/repository', () => ({
  loadMembership: jest.fn(),
}));

type AuthListener = (user: User | null) => void;
type Root = {
  render: (node: ReactNode) => void;
  unmount: () => void;
};
type Observation = {
  sessionId: number;
  uid: string | null;
  membershipStatus: MembershipState['status'];
  decision: AccessDecision['kind'];
  decisionTo: AppRoute | null;
  retry: () => void;
};

const { createRoot } = jest.requireActual<{
  createRoot: (container: HTMLElement) => Root;
}>('react-dom/client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUsePathname = usePathname as jest.Mock;
const mockGetClientConfig = getClientConfig as jest.Mock;
const mockGetFirebaseServices = getFirebaseServices as jest.Mock;
const mockSubscribe = subscribeToAuthState as jest.Mock;
const mockLoadMembership = loadMembership as jest.Mock;
const auth = {} as Parameters<typeof subscribeToAuthState>[0];
const firestore = {} as Parameters<typeof loadMembership>[0];

let emitAuthState: AuthListener = () => {};
let container: HTMLElement | null = null;
let root: Root | null = null;
let observed: Observation = {
  sessionId: 0,
  uid: null,
  membershipStatus: 'anonymous',
  decision: 'loading',
  decisionTo: null,
  retry: () => {},
};

function user(uid: string): User {
  return { uid } as User;
}

function readyMembership(uid: string, role: 'builder' | 'buyer'): MembershipState {
  return {
    status: 'ready',
    membership: {
      uid,
      projectId: 'project-1',
      role,
      towerId: null,
      unitId: null,
      createdByUid: 'builder-1',
      createdAt: {
        seconds: 1,
        nanoseconds: 0,
        toDate: () => new Date(),
        toMillis: () => 1000,
      } as never,
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe() {
  const authValue = useAuth();
  const membership = useMembership();
  const decision = useAccessDecision();
  observed = {
    sessionId: authValue.sessionId,
    uid: authValue.user?.uid ?? null,
    membershipStatus: membership.state.status,
    decision: decision.kind,
    decisionTo: decision.kind === 'redirect' ? decision.to : null,
    retry: membership.retry,
  };
  return null;
}

async function mountProviders() {
  root = createRoot(container as HTMLElement);
  await act(async () => {
    root?.render(
      <AuthProvider>
        <MembershipProvider>
          <Probe />
        </MembershipProvider>
      </AuthProvider>,
    );
  });
}

async function emitAuth(value: User | null) {
  await act(async () => {
    emitAuthState(value);
  });
}

async function resolveLookup<T>(pending: { resolve: (value: T) => void }, value: T) {
  await act(async () => {
    pending.resolve(value);
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockUsePathname.mockReturnValue('/builder');
  mockGetClientConfig.mockReturnValue({
    constructionProjectId: 'project-1',
    functionsRegion: 'us-central1',
    useFirebaseEmulator: true,
  });
  mockGetFirebaseServices.mockReturnValue({ auth, firestore });
  mockSubscribe.mockImplementation((_authValue, listener) => {
    emitAuthState = listener as AuthListener;
    return jest.fn();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

test('initial signed-in lookup is bound to the current auth session', async () => {
  mockLoadMembership.mockResolvedValue(readyMembership('uid-1', 'builder'));
  await mountProviders();

  expect(observed.decision).toBe('loading');

  await emitAuth(user('uid-1'));

  expect(mockLoadMembership).toHaveBeenCalledWith(firestore, 'project-1', 'uid-1');
  expect(observed.sessionId).toBe(1);
  expect(observed.membershipStatus).toBe('ready');
  expect(observed.decision).toBe('allow');
});

test('a restored web auth session resolves builder membership after reload', async () => {
  mockLoadMembership.mockResolvedValue(readyMembership('uid-1', 'builder'));
  await mountProviders();

  await emitAuth(user('uid-1'));

  expect(mockLoadMembership).toHaveBeenCalledWith(firestore, 'project-1', 'uid-1');
  expect(observed.sessionId).toBe(1);
  expect(observed.uid).toBe('uid-1');
  expect(observed.membershipStatus).toBe('ready');
  expect(observed.decision).toBe('allow');
});

test('sign-out invalidates the previous membership result', async () => {
  mockLoadMembership.mockResolvedValue(readyMembership('uid-1', 'builder'));
  await mountProviders();
  await emitAuth(user('uid-1'));
  expect(observed.membershipStatus).toBe('ready');

  await emitAuth(null);

  expect(observed.uid).toBeNull();
  expect(observed.membershipStatus).toBe('anonymous');
  expect(observed.decision).toBe('redirect');
  expect(mockLoadMembership).toHaveBeenCalledTimes(1);
});

test('same uid signs in again and receives a fresh membership lookup', async () => {
  const firstLookup = deferred<MembershipState>();
  const secondLookup = deferred<MembershipState>();
  mockLoadMembership
    .mockReturnValueOnce(firstLookup.promise)
    .mockReturnValueOnce(secondLookup.promise);
  await mountProviders();

  const signedInUser = user('uid-1');
  await emitAuth(signedInUser);
  await resolveLookup(firstLookup, readyMembership('uid-1', 'builder'));
  expect(observed.membershipStatus).toBe('ready');

  await emitAuth(null);
  await emitAuth(signedInUser);

  expect(observed.sessionId).toBe(3);
  expect(observed.membershipStatus).toBe('loading');
  expect(observed.decision).toBe('loading');
  expect(mockLoadMembership).toHaveBeenCalledTimes(2);
  expect(mockLoadMembership).toHaveBeenLastCalledWith(firestore, 'project-1', 'uid-1');

  await resolveLookup(secondLookup, { status: 'missing' });

  expect(observed.membershipStatus).toBe('missing');
  expect(observed.decision).toBe('redirect');
});

test('a different uid cannot see the previous account membership', async () => {
  const firstLookup = deferred<MembershipState>();
  const secondLookup = deferred<MembershipState>();
  mockLoadMembership
    .mockReturnValueOnce(firstLookup.promise)
    .mockReturnValueOnce(secondLookup.promise);
  await mountProviders();

  await emitAuth(user('uid-1'));
  await resolveLookup(firstLookup, readyMembership('uid-1', 'builder'));
  expect(observed.membershipStatus).toBe('ready');

  await emitAuth(user('uid-2'));

  expect(observed.uid).toBe('uid-2');
  expect(observed.membershipStatus).toBe('loading');
  expect(observed.decision).toBe('loading');
  expect(mockLoadMembership).toHaveBeenLastCalledWith(firestore, 'project-1', 'uid-2');

  await resolveLookup(secondLookup, readyMembership('uid-2', 'buyer'));

  expect(observed.membershipStatus).toBe('ready');
  expect(observed.decision).toBe('redirect');
});

test('late result from an earlier session cannot replace the current session result', async () => {
  const firstLookup = deferred<MembershipState>();
  const secondLookup = deferred<MembershipState>();
  mockLoadMembership
    .mockReturnValueOnce(firstLookup.promise)
    .mockReturnValueOnce(secondLookup.promise);
  await mountProviders();

  await emitAuth(user('uid-1'));
  await emitAuth(user('uid-2'));

  expect(observed.membershipStatus).toBe('loading');

  await resolveLookup(firstLookup, readyMembership('uid-1', 'builder'));

  expect(observed.membershipStatus).toBe('loading');
  expect(observed.decision).toBe('loading');

  await resolveLookup(secondLookup, { status: 'invalid' });

  expect(observed.membershipStatus).toBe('invalid');
  expect(observed.decision).toBe('redirect');
});

test('guard remains loading until the current session membership resolves', async () => {
  const lookup = deferred<MembershipState>();
  mockLoadMembership.mockReturnValue(lookup.promise);
  await mountProviders();

  await emitAuth(user('uid-1'));

  expect(observed.decision).toBe('loading');
  expect(observed.membershipStatus).toBe('loading');

  await resolveLookup(lookup, readyMembership('uid-1', 'builder'));

  expect(observed.decision).toBe('allow');
  expect(observed.membershipStatus).toBe('ready');
});

test('retryable membership errors remain distinct and retry the current session', async () => {
  mockLoadMembership
    .mockResolvedValueOnce({
      status: 'error',
      message: 'We could not check your project membership.',
      retryable: true,
    })
    .mockResolvedValueOnce(readyMembership('uid-1', 'buyer'));
  await mountProviders();

  await emitAuth(user('uid-1'));

  expect(observed.membershipStatus).toBe('error');
  expect(observed.decision).toBe('redirect');

  await act(async () => {
    observed.retry();
  });

  expect(mockLoadMembership).toHaveBeenCalledTimes(2);
  expect(observed.membershipStatus).toBe('ready');
});

test('membership refresh after invite redemption moves a pending buyer into the buyer route', async () => {
  mockUsePathname.mockReturnValue('/pending-membership');
  mockLoadMembership
    .mockResolvedValueOnce({ status: 'missing' })
    .mockResolvedValueOnce(readyMembership('uid-1', 'buyer'));
  await mountProviders();

  await emitAuth(user('uid-1'));

  expect(observed.membershipStatus).toBe('missing');
  expect(observed.decision).toBe('allow');

  await act(async () => {
    observed.retry();
  });

  expect(mockLoadMembership).toHaveBeenCalledTimes(2);
  expect(observed.membershipStatus).toBe('ready');
  expect(observed.decision).toBe('redirect');
  expect(observed.decisionTo).toBe('/buyer');
});
