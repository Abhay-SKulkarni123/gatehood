jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(async () => ({})),
}));

jest.mock('@react-native-firebase/app-check', () => ({
  initializeAppCheck: jest.fn(() => ({ kind: 'native-app-check' })),
  ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({
    configure: jest.fn(),
  })),
}));

jest.mock('@react-native-firebase/auth', () => ({
  connectAuthEmulator: jest.fn(),
  getAuth: jest.fn(() => ({ kind: 'auth' })),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  connectFirestoreEmulator: jest.fn(),
  getFirestore: jest.fn(() => ({ kind: 'web-firestore' })),
  initializeFirestore: jest.fn(() => ({ kind: 'native-firestore' })),
}));

jest.mock('@react-native-firebase/functions', () => ({
  connectFunctionsEmulator: jest.fn(),
  getFunctions: jest.fn(() => ({ kind: 'functions' })),
}));

jest.mock('@/lib/firebase/web-app-check', () => ({
  initializeWebAppCheck: jest.fn(() => ({ kind: 'web-app-check' })),
}));

jest.mock('@/lib/firebase/web-firestore', () => ({
  connectWebFirestoreEmulator: jest.fn(),
  getWebFirestore: jest.fn(() => ({ kind: 'full-web-firestore' })),
}));

const appModule = jest.requireMock('@react-native-firebase/app');
const appCheckModule = jest.requireMock('@react-native-firebase/app-check');
const authModule = jest.requireMock('@react-native-firebase/auth');
const firestoreModule = jest.requireMock('@react-native-firebase/firestore');
const functionsModule = jest.requireMock('@react-native-firebase/functions');
const webAppCheckModule = jest.requireMock('@/lib/firebase/web-app-check');
const webFirestoreModule = jest.requireMock('@/lib/firebase/web-firestore');

const app = { name: '[DEFAULT]' };

function loadFirebaseModule(): typeof import('@/lib/firebase') {
  let loaded!: typeof import('@/lib/firebase');
  jest.isolateModules(() => {
    loaded = require('@/lib/firebase');
  });
  return loaded;
}

function createConfig() {
  return {
    constructionProjectId: 'demo-project',
    functionsRegion: 'us-central1',
    useFirebaseEmulator: true,
    webFirebase: {
      apiKey: 'web-api-key',
      authDomain: 'infra-project.firebaseapp.com',
      projectId: 'infra-project',
      storageBucket: 'infra-project.firebasestorage.app',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abc',
      databaseUrl: 'https://infra-project-default-rtdb.firebaseio.com',
      appCheckProvider: 'recaptchaV3' as const,
      appCheckSiteKey: 'site-key',
    },
  };
}

function resetMocks() {
  jest.clearAllMocks();
  appModule.getApp.mockReturnValue(app);
  appModule.getApps.mockReturnValue([]);
  appModule.initializeApp.mockResolvedValue(app);
  authModule.getAuth.mockReturnValue({ kind: 'auth' });
  firestoreModule.getFirestore.mockReturnValue({ kind: 'web-firestore' });
  firestoreModule.initializeFirestore.mockReturnValue({ kind: 'native-firestore' });
  functionsModule.getFunctions.mockReturnValue({ kind: 'functions' });
  webAppCheckModule.initializeWebAppCheck.mockReturnValue({ kind: 'web-app-check' });
  webFirestoreModule.connectWebFirestoreEmulator.mockImplementation(() => undefined);
  webFirestoreModule.getWebFirestore.mockReturnValue({ kind: 'full-web-firestore' });
}

describe('platform-aware Firebase initialization', () => {
  beforeEach(resetMocks);

  it('initializes the web app before calling getApp', async () => {
    const firebase = loadFirebaseModule();
    const config = createConfig();

    const services = await firebase.initializeFirebase(config, 'web');

    expect(appModule.initializeApp).toHaveBeenCalledWith({
      apiKey: 'web-api-key',
      appId: '1:1234567890:web:abc',
      authDomain: 'infra-project.firebaseapp.com',
      databaseURL: 'https://infra-project-default-rtdb.firebaseio.com',
      messagingSenderId: '1234567890',
      projectId: 'infra-project',
      storageBucket: 'infra-project.firebasestorage.app',
    });
    expect(appModule.initializeApp.mock.invocationCallOrder[0]).toBeLessThan(
      appModule.getApp.mock.invocationCallOrder[0],
    );
    expect(webAppCheckModule.initializeWebAppCheck).toHaveBeenCalledWith(
      '[DEFAULT]',
      config.webFirebase,
      true,
    );
    const appCheckOrder = webAppCheckModule.initializeWebAppCheck.mock.invocationCallOrder[0];
    expect(appCheckOrder).toBeLessThan(authModule.getAuth.mock.invocationCallOrder[0]);
    expect(appCheckOrder).toBeLessThan(firestoreModule.getFirestore.mock.invocationCallOrder[0]);
    expect(appCheckOrder).toBeLessThan(functionsModule.getFunctions.mock.invocationCallOrder[0]);
    expect(firestoreModule.getFirestore).toHaveBeenCalledWith(app);
    expect(firestoreModule.initializeFirestore).not.toHaveBeenCalled();
    expect(services.appCheck).toEqual({ kind: 'web-app-check' });
  });

  it('preserves native initialization', async () => {
    const firebase = loadFirebaseModule();
    const config = createConfig();

    await firebase.initializeFirebase(config, 'native');

    expect(appModule.initializeApp).not.toHaveBeenCalled();
    expect(appModule.getApp).toHaveBeenCalledTimes(1);
    expect(appCheckModule.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(appCheckModule.ReactNativeFirebaseAppCheckProvider).toHaveBeenCalledTimes(1);
    expect(firestoreModule.initializeFirestore).toHaveBeenCalledWith(app, { persistence: true });
    expect(firestoreModule.getFirestore).not.toHaveBeenCalled();
    expect(webAppCheckModule.initializeWebAppCheck).not.toHaveBeenCalled();
    expect(webFirestoreModule.connectWebFirestoreEmulator).not.toHaveBeenCalled();
    expect(webFirestoreModule.getWebFirestore).not.toHaveBeenCalled();
  });

  it('initializes Firebase only once for concurrent callers', async () => {
    const firebase = loadFirebaseModule();
    const config = createConfig();

    await Promise.all([
      firebase.initializeFirebase(config, 'web'),
      firebase.initializeFirebase(config, 'web'),
    ]);
    await firebase.initializeFirebase(config, 'web');

    expect(appModule.initializeApp).toHaveBeenCalledTimes(1);
    expect(appModule.getApp).toHaveBeenCalledTimes(1);
  });

  it('uses the localhost emulator host for web', async () => {
    const firebase = loadFirebaseModule();

    await firebase.initializeFirebase(createConfig(), 'web');

    expect(authModule.connectAuthEmulator).toHaveBeenCalledWith(
      { kind: 'auth' },
      'http://127.0.0.1:9099',
    );
    expect(firestoreModule.connectFirestoreEmulator).toHaveBeenCalledWith(
      { kind: 'web-firestore' },
      '127.0.0.1',
      8080,
    );
    expect(webFirestoreModule.connectWebFirestoreEmulator).toHaveBeenCalledWith(
      '127.0.0.1',
      8080,
    );
    expect(functionsModule.connectFunctionsEmulator).toHaveBeenCalledWith(
      { kind: 'functions' },
      '127.0.0.1',
      5001,
    );
  });
});
