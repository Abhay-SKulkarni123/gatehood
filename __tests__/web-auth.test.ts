jest.mock('firebase/app', () => ({
  getApp: jest.fn((name?: string) => ({ name })),
}));

jest.mock('firebase/auth', () => ({
  browserLocalPersistence: { type: 'local' },
  connectAuthEmulator: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(async () => undefined),
  initializeAuth: jest.fn(() => ({ kind: 'web-auth' })),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  signInWithEmailAndPassword: jest.fn(async () => undefined),
  signOut: jest.fn(async () => undefined),
}));

const appModule = jest.requireMock('firebase/app');
const authModule = jest.requireMock('firebase/auth');

type WebAuthModule = typeof import('@/lib/firebase/web-auth');

function loadWebAuthModule(): WebAuthModule {
  let loaded!: WebAuthModule;
  jest.isolateModules(() => {
    loaded = require('@/lib/firebase/web-auth');
  });
  return loaded;
}

beforeEach(() => {
  jest.clearAllMocks();
  appModule.getApp.mockImplementation((name?: string) => ({ name }));
  authModule.initializeAuth.mockReturnValue({ kind: 'web-auth' });
  authModule.onAuthStateChanged.mockReturnValue(jest.fn());
  authModule.connectAuthEmulator.mockImplementation(() => undefined);
  authModule.createUserWithEmailAndPassword.mockResolvedValue(undefined);
  authModule.signInWithEmailAndPassword.mockResolvedValue(undefined);
  authModule.signOut.mockResolvedValue(undefined);
});

test('web auth uses browser local persistence and reuses one Auth instance on reload', () => {
  const webAuth = loadWebAuthModule();

  const first = webAuth.getWebAuth('[DEFAULT]');
  const second = webAuth.getWebAuth('[DEFAULT]');

  expect(first).toBe(second);
  expect(appModule.getApp).toHaveBeenCalledWith('[DEFAULT]');
  expect(authModule.initializeAuth).toHaveBeenCalledTimes(1);
  expect(authModule.initializeAuth).toHaveBeenCalledWith(
    { name: '[DEFAULT]' },
    { persistence: authModule.browserLocalPersistence },
  );
});

test('web auth connects to the Auth emulator once', () => {
  const webAuth = loadWebAuthModule();
  const auth = webAuth.getWebAuth('[DEFAULT]');

  webAuth.connectWebAuthEmulator(auth, '127.0.0.1');
  webAuth.connectWebAuthEmulator(auth, '127.0.0.1');

  expect(authModule.connectAuthEmulator).toHaveBeenCalledTimes(1);
  expect(authModule.connectAuthEmulator).toHaveBeenCalledWith(
    auth,
    'http://127.0.0.1:9099',
    { disableWarnings: true },
  );
});

test('web auth subscription forwards a restored persisted user', () => {
  const webAuth = loadWebAuthModule();
  const auth = webAuth.getWebAuth('[DEFAULT]');
  const onUserChanged = jest.fn();
  const unsubscribe = jest.fn();
  const restoredUser = { uid: 'uid-1' };
  authModule.onAuthStateChanged.mockReturnValue(unsubscribe);

  expect(webAuth.subscribeToWebAuthState(auth, onUserChanged)).toBe(unsubscribe);

  const listener = authModule.onAuthStateChanged.mock.calls[0][1] as (user: unknown) => void;
  listener(restoredUser);
  expect(onUserChanged).toHaveBeenCalledWith(restoredUser);
  expect(authModule.onAuthStateChanged).toHaveBeenCalledWith(auth, expect.any(Function));
});

test('web auth actions use the Firebase web SDK', async () => {
  const webAuth = loadWebAuthModule();
  const auth = webAuth.getWebAuth('[DEFAULT]');

  await webAuth.webSignInWithEmailPassword(auth, 'user@example.com', 'example-password');
  await webAuth.webCreateUserWithEmailAndPassword(auth, 'new-user@example.com', 'example-password');
  await webAuth.webSignOut(auth);

  expect(authModule.signInWithEmailAndPassword).toHaveBeenCalledWith(
    auth,
    'user@example.com',
    'example-password',
  );
  expect(authModule.createUserWithEmailAndPassword).toHaveBeenCalledWith(
    auth,
    'new-user@example.com',
    'example-password',
  );
  expect(authModule.signOut).toHaveBeenCalledWith(auth);
});
