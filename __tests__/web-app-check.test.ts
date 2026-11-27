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
  getToken: jest.fn(async () => ({ token: 'mock-app-check-token' })),
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

type ConfigOverrides = Partial<{
  appCheckSiteKey: string | null;
  appCheckProvider: string;
}>;

function config(overrides: ConfigOverrides = {}) {
  return {
    apiKey: 'web-api-key',
    authDomain: 'infra-project.firebaseapp.com',
    projectId: 'infra-project',
    storageBucket: 'infra-project.firebasestorage.app',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abc',
    databaseUrl: 'https://infra-project-default-rtdb.firebaseio.com',
    appCheckProvider: ('appCheckProvider' in overrides
      ? overrides.appCheckProvider
      : 'recaptchaEnterprise') as 'recaptchaEnterprise',
    appCheckSiteKey:
      'appCheckSiteKey' in overrides ? overrides.appCheckSiteKey : 'site-key',
  };
}

describe('web App Check Enterprise provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appCheckSdk.getToken.mockResolvedValue({ token: 'mock-app-check-token' });
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  afterEach(() => {
    delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });

  it('sets debug-token mode and acquires a token before returning in development', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await initializeWebAppCheck('[DEFAULT]', config(), true);

    const provider = appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect(provider.debugTokenAtProviderCreation).toBe(true);
    expect(appCheck.debugTokenAtInitialization).toBe(true);
    expect(appCheckSdk.getToken).toHaveBeenCalledWith(appCheck, true);
    expect(appCheckSdk.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      appCheckSdk.getToken.mock.invocationCallOrder[0],
    );
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck).toHaveBeenCalledWith(webAppModule.getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('preserves an explicitly registered debug token', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = 'registered-token';

    await initializeWebAppCheck('[DEFAULT]', config(), true);

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe('registered-token');
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBe(
      'registered-token',
    );
    expect(appCheckSdk.getToken).toHaveBeenCalledWith(
      appCheckSdk.initializeAppCheck.mock.results[0].value,
      true,
    );
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
  });

  it('uses the Enterprise provider and cached token without debug mode in production', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await initializeWebAppCheck('[DEFAULT]', config(), false);

    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheck.debugTokenAtInitialization).toBeUndefined();
    expect(appCheckSdk.getToken).toHaveBeenCalledWith(appCheck, false);
    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('fails without exposing token details when token acquisition fails', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    const sensitiveError = 'registered-token-value-must-not-leak';
    appCheckSdk.getToken.mockRejectedValueOnce(new Error(sensitiveError));

    let thrown: unknown;
    try {
      await initializeWebAppCheck('[DEFAULT]', config(), true);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/could not obtain a web token/i);
    expect((thrown as Error).message).not.toContain(sensitiveError);
  });

  it('requires an Enterprise site key in development and production', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await expect(
      initializeWebAppCheck('[DEFAULT]', config({ appCheckSiteKey: null }), true),
    ).rejects.toThrow('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
    await expect(
      initializeWebAppCheck('[DEFAULT]', config({ appCheckSiteKey: null }), false),
    ).rejects.toThrow('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
    expect(appCheckSdk.initializeAppCheck).not.toHaveBeenCalled();
    expect(appCheckSdk.getToken).not.toHaveBeenCalled();
  });

  it('requires the Enterprise provider before initializing App Check', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await expect(
      initializeWebAppCheck('[DEFAULT]', config({ appCheckProvider: 'recaptchaV3' }), true),
    ).rejects.toThrow('EXPO_PUBLIC_APP_CHECK_PROVIDER must be recaptchaEnterprise for web.');
    expect(appCheckSdk.initializeAppCheck).not.toHaveBeenCalled();
    expect(appCheckSdk.getToken).not.toHaveBeenCalled();
  });
});
