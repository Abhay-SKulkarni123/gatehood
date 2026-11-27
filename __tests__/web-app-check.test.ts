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
  appCheckDebugToken: string | null;
}>;

const LOCAL_DEBUG_TOKEN = '11111111-2222-4333-8444-555555555555';

function config(overrides: ConfigOverrides = {}) {
  const appCheckDebugToken =
    'appCheckDebugToken' in overrides ? overrides.appCheckDebugToken : LOCAL_DEBUG_TOKEN;

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
    ...(appCheckDebugToken ? { appCheckDebugToken } : {}),
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

  it('sets the configured debug token before initializeAppCheck in development', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await initializeWebAppCheck('[DEFAULT]', config(), true);

    const provider = appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(LOCAL_DEBUG_TOKEN);
    expect(provider.debugTokenAtProviderCreation).toBe(LOCAL_DEBUG_TOKEN);
    expect(appCheck.debugTokenAtInitialization).toBe(LOCAL_DEBUG_TOKEN);
    expect(appCheckSdk.ReCaptchaEnterpriseProvider.mock.invocationCallOrder[0]).toBeLessThan(
      appCheckSdk.initializeAppCheck.mock.invocationCallOrder[0],
    );
    expect(appCheckSdk.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      appCheckSdk.getToken.mock.invocationCallOrder[0],
    );
    expect(appCheckSdk.getToken).toHaveBeenCalledWith(appCheck, true);
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
    expect(appCheckSdk.initializeAppCheck).toHaveBeenCalledWith(webAppModule.getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('reuses the same configured debug token across initialization', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await initializeWebAppCheck('[DEFAULT]', config(), true);
    const firstToken = (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
    await initializeWebAppCheck('[DEFAULT]', config(), true);
    const secondToken = (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;

    expect(firstToken).toBe(LOCAL_DEBUG_TOKEN);
    expect(secondToken).toBe(LOCAL_DEBUG_TOKEN);
    expect(appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value.debugTokenAtProviderCreation).toBe(
      LOCAL_DEBUG_TOKEN,
    );
    expect(appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[1].value.debugTokenAtProviderCreation).toBe(
      LOCAL_DEBUG_TOKEN,
    );
    expect(appCheckSdk.initializeAppCheck.mock.results[0].value.debugTokenAtInitialization).toBe(
      LOCAL_DEBUG_TOKEN,
    );
    expect(appCheckSdk.initializeAppCheck.mock.results[1].value.debugTokenAtInitialization).toBe(
      LOCAL_DEBUG_TOKEN,
    );
  });

  it('ignores debug-token configuration outside local development', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = LOCAL_DEBUG_TOKEN;

    await initializeWebAppCheck('[DEFAULT]', config(), false);

    const provider = appCheckSdk.ReCaptchaEnterpriseProvider.mock.results[0].value;
    const appCheck = appCheckSdk.initializeAppCheck.mock.results[0].value;

    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
    expect(provider.debugTokenAtProviderCreation).toBeUndefined();
    expect(appCheck.debugTokenAtInitialization).toBeUndefined();
    expect(appCheckSdk.getToken).toHaveBeenCalledWith(appCheck, false);
    expect(appCheckSdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(appCheckSdk.ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(appCheckSdk.CustomProvider).not.toHaveBeenCalled();
  });

  it('fails safely when debug mode is requested without a configured token', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');

    await expect(
      initializeWebAppCheck('[DEFAULT]', config({ appCheckDebugToken: null }), true),
    ).rejects.toThrow(
      'A local Firebase App Check debug token is required. Set EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN for local development.',
    );
    expect((globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
    expect(appCheckSdk.initializeAppCheck).not.toHaveBeenCalled();
    expect(appCheckSdk.getToken).not.toHaveBeenCalled();
  });

  it('fails safely when the configured debug token is invalid', async () => {
    const { initializeWebAppCheck } = require('@/lib/firebase/web-app-check');
    const invalidToken = 'invalid-debug-token';

    let thrown: unknown;
    try {
      await initializeWebAppCheck('[DEFAULT]', config({ appCheckDebugToken: invalidToken }), true);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN must be a valid Firebase App Check debug token\./,
    );
    expect((thrown as Error).message).not.toContain(invalidToken);
    expect(appCheckSdk.initializeAppCheck).not.toHaveBeenCalled();
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
