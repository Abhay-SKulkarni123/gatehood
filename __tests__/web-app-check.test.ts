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
  ReCaptchaV3Provider: jest.fn().mockImplementation((siteKey) => ({
    kind: 'v3',
    siteKey,
    debugTokenAtProviderCreation: (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN,
  })),
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

function config(overrides: Partial<{
  appCheckProvider: 'recaptchaV3' | 'recaptchaEnterprise';
  appCheckSiteKey: string | null;
}> = {}) {
  return {
    apiKey: 'web-api-key',
    authDomain: 'infra-project.firebaseapp.com',
    projectId: 'infra-project',
    storageBucket: 'infra-project.firebasestorage.app',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abc',
    databaseUrl: 'https://infra-project-default-rtdb.firebaseio.com',
    appCheckProvider: overrides.appCheckProvider ?? 'recaptchaV3',
    appCheckSiteKey:
      'appCheckSiteKey' in overrides ? overrides.appCheckSiteKey : 'site-key',
  };
}

describe('web App Check provider selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  afterEach(() => {
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('enables debug mode before initializing a supported reCAPTCHA V3 provider', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config(), true);

    const provider = appCheckSdk.ReCaptchaV3Provider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect(provider.debugTokenAtProviderCreation).toBe(true);
    expect(appCheck.debugTokenAtInitialization).toBe(true);
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck).toHaveBeenCalledWith(webAppModule.getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('uses reCAPTCHA Enterprise with debug mode in development when configured', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck(
      '[DEFAULT]',
      config({ appCheckProvider: 'recaptchaEnterprise' }),
      true,
    );

    const provider = appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect(provider.debugTokenAtProviderCreation).toBe(true);
    expect(appCheck.debugTokenAtInitialization).toBe(true);
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
  });

  it('preserves an explicitly registered debug token', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = 'registered-token';

    initializeWebAppCheck('[DEFAULT]', config(), true);

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('registered-token');
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBe(
      'registered-token',
    );
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
  });

  it('uses reCAPTCHA V3 without debug mode in production', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config({ appCheckProvider: 'recaptchaV3' }), false);

    expect(appCheckSdk.ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBeUndefined();
    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('uses reCAPTCHA Enterprise without debug mode in production when configured', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck(
      '[DEFAULT]',
      config({ appCheckProvider: 'recaptchaEnterprise' }),
      false,
    );

    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBeUndefined();
  });

  it('requires a site key in development and production', () => {
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
