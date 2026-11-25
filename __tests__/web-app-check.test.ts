jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

jest.mock('firebase/app-check', () => ({
  CustomProvider: jest.fn().mockImplementation((options) => ({ kind: 'custom', options })),
  ReCaptchaEnterpriseProvider: jest.fn().mockImplementation((siteKey) => ({
    kind: 'enterprise',
    siteKey,
  })),
  ReCaptchaV3Provider: jest.fn().mockImplementation((siteKey) => ({ kind: 'v3', siteKey })),
  initializeAppCheck: jest.fn((app, options) => ({ kind: 'app-check', app, options })),
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

  it('uses debug mode in development with a custom provider', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config(), true);

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    expect(appCheckSdk.CustomProvider).toHaveBeenCalledTimes(1);
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck).toHaveBeenCalledWith(
      webAppModule.getApp.mock.results[0].value,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });

  it('uses reCAPTCHA V3 in production', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck('[DEFAULT]', config({ appCheckProvider: 'recaptchaV3' }), false);

    expect(appCheckSdk.ReCaptchaV3Provider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('uses reCAPTCHA Enterprise in production when configured', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    initializeWebAppCheck(
      '[DEFAULT]',
      config({ appCheckProvider: 'recaptchaEnterprise' }),
      false,
    );

    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
  });

  it('requires a site key outside development', () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    expect(() =>
      initializeWebAppCheck('[DEFAULT]', config({ appCheckSiteKey: null }), false),
    ).toThrow('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for non-development web builds.');
  });
});
