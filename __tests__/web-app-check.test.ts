jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('firebase/app-check', () => ({
  CustomProvider: jest.fn().mockImplementation((options) => ({ kind: 'custom', options })),
  ReCaptchaEnterpriseProvider: jest.fn().mockImplementation((siteKey) => ({
    kind: 'enterprise',
    siteKey,
    debugTokenAtProviderCreation: (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN,
  })),
  ReCaptchaV3Provider: jest.fn().mockImplementation((siteKey) => ({ kind: 'v3', siteKey })),
  initializeAppCheck: jest.fn((app, options) => ({
    kind: 'app-check',
    app,
    options,
    debugTokenAtInitialization: (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN,
  })),
}));

const webAppModule = jest.requireMock('firebase/app');
const appCheckSdk = jest.requireMock('firebase/app-check');

type WebAppCheckGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

function config(overrides: Partial<{ appCheckSiteKey: string | null }> = {}) {
  return {
    apiKey: 'web-api-key',
    authDomain: 'infra-project.firebaseapp.com',
    projectId: 'infra-project',
    storageBucket: 'infra-project.firebasestorage.app',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abc',
    databaseUrl: 'https://infra-project-default-rtdb.firebaseio.com',
    appCheckProvider: 'recaptchaEnterprise' as const,
    appCheckSiteKey:
      'appCheckSiteKey' in overrides ? overrides.appCheckSiteKey : 'site-key',
  };
}

describe('web App Check Enterprise provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  afterEach(() => {
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('sets debug-token mode before initializing the Enterprise provider in development', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config(), true);

    const provider = appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect(provider.debugTokenAtProviderCreation).toBe(true);
    expect(appCheck.debugTokenAtInitialization).toBe(true);
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck).toHaveBeenCalledWith(webAppModule.getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('preserves an explicitly registered debug token', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = 'registered-token';

    initializeWebAppCheck('[DEFAULT]', config(), true);

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('registered-token');
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBe(
      'registered-token',
    );
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
  });

  it('uses the Enterprise provider without debug mode in production', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config(), false);

    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBeUndefined();
    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('requires an Enterprise site key in development and production', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    expect(() =>
      initializeWebAppCheck('[DEFAULT]', config({ appCheckSiteKey: null }), true),
    ).toThrow('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
    expect(() =>
      initializeWebAppCheck('[DEFAULT]', config({ appCheckSiteKey: null }), false),
    ).toThrow('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
    expect(appCheckSdk.initializeAppCheck).not.toHaveBeenCalled();
  });
});
