jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('firebase/firestore', () => ({
  connectFirestoreEmulator: jest.fn(),
  getFirestore: jest.fn(() => ({ kind: 'full-web-firestore' })),
}));

const webAppModule = jest.requireMock('firebase/app');
const firestoreSdk = jest.requireMock('firebase/firestore');

function loadWebFirestore(): typeof import('@/lib/firebase/web-firestore') {
  let loaded!: typeof import('@/lib/firebase/web-firestore');
  jest.isolateModules(() => {
    loaded = require('@/lib/firebase/web-firestore');
  });
  return loaded;
}

describe('full web Firestore instance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    webAppModule.getApp.mockReturnValue({ name: '[DEFAULT]' });
    firestoreSdk.getFirestore.mockReturnValue({ kind: 'full-web-firestore' });
  });

  it('reuses the default Firebase app and one Firestore instance', () => {
    const webFirestore = loadWebFirestore();

    expect(webFirestore.getWebFirestore()).toBe(webFirestore.getWebFirestore());
    expect(webAppModule.getApp).toHaveBeenCalledTimes(1);
    expect(firestoreSdk.getFirestore).toHaveBeenCalledTimes(1);
    expect(firestoreSdk.getFirestore).toHaveBeenCalledWith({ name: '[DEFAULT]' });
    expect(webAppModule.getApp).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('connects the shared full Firestore instance to the emulator only once', () => {
    const webFirestore = loadWebFirestore();
    const firestore = webFirestore.getWebFirestore();

    webFirestore.connectWebFirestoreEmulator('127.0.0.1', 8080);
    webFirestore.connectWebFirestoreEmulator('127.0.0.1', 8080);

    expect(firestoreSdk.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(firestoreSdk.connectFirestoreEmulator).toHaveBeenCalledWith(firestore, '127.0.0.1', 8080);
  });
});
