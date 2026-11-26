import { ConfigurationError, parseClientConfig } from '@/config/env';

const validEnv = {
  EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID: 'demo-project',
  EXPO_PUBLIC_FUNCTIONS_REGION: 'us-central1',
};

const validWebEnv = {
  ...validEnv,
  EXPO_PUBLIC_FIREBASE_API_KEY: 'web-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'infra-project.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'infra-project',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'infra-project.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:abc',
  EXPO_PUBLIC_APP_CHECK_PROVIDER: 'recaptchaV3',
  EXPO_PUBLIC_APP_CHECK_SITE_KEY: 'site-key',
};

describe('parseClientConfig', () => {
  it('returns validated client configuration', () => {
    expect(parseClientConfig(validEnv)).toEqual({
      constructionProjectId: 'demo-project',
      functionsRegion: 'us-central1',
      useFirebaseEmulator: false,
    });
  });

  it('parses the emulator flag as a boolean', () => {
    expect(parseClientConfig({ ...validEnv, EXPO_PUBLIC_USE_FIREBASE_EMULATOR: 'true' })).toEqual({
      constructionProjectId: 'demo-project',
      functionsRegion: 'us-central1',
      useFirebaseEmulator: true,
    });
  });

  it('rejects missing required configuration', () => {
    expect(() => parseClientConfig({})).toThrow(ConfigurationError);
  });

  it('rejects an invalid construction project id', () => {
    expect(() =>
      parseClientConfig({ ...validEnv, EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID: 'Demo Project' }),
    ).toThrow('EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID must be a lowercase slug.');
  });

  it('rejects an invalid emulator flag', () => {
    expect(() =>
      parseClientConfig({ ...validEnv, EXPO_PUBLIC_USE_FIREBASE_EMULATOR: 'yes' }),
    ).toThrow('EXPO_PUBLIC_USE_FIREBASE_EMULATOR must be true or false when provided.');
  });

  it('parses Firebase web configuration separately from the construction project id', () => {
    const parsed = parseClientConfig(validWebEnv, 'web');

    expect(parsed.constructionProjectId).toBe('demo-project');
    expect(parsed.webFirebase).toEqual({
      apiKey: 'web-api-key',
      authDomain: 'infra-project.firebaseapp.com',
      projectId: 'infra-project',
      storageBucket: 'infra-project.firebasestorage.app',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abc',
      databaseUrl: 'https://infra-project-default-rtdb.firebaseio.com',
      appCheckProvider: 'recaptchaV3',
      appCheckSiteKey: 'site-key',
    });
  });

  it('requires Firebase web configuration on web', () => {
    expect(() => parseClientConfig(validEnv, 'web')).toThrow(
      'Firebase web configuration is required when running on web.',
    );
  });

  it('requires a web App Check site key for the supported reCAPTCHA provider', () => {
    const withoutSiteKey: Record<string, string> = { ...validWebEnv };
    delete withoutSiteKey.EXPO_PUBLIC_APP_CHECK_SITE_KEY;

    expect(() => parseClientConfig(withoutSiteKey, 'web')).toThrow(
      'EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.',
    );
  });

  it('rejects an invalid web App Check provider', () => {
    expect(() =>
      parseClientConfig(
        { ...validWebEnv, EXPO_PUBLIC_APP_CHECK_PROVIDER: 'debug' },
        'web',
      ),
    ).toThrow('EXPO_PUBLIC_APP_CHECK_PROVIDER must be recaptchaV3 or recaptchaEnterprise.');
  });
});
