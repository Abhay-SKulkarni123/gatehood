import { ConfigurationError, parseClientConfig } from '@/config/env';

const validEnv = {
  EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID: 'demo-project',
  EXPO_PUBLIC_FUNCTIONS_REGION: 'us-central1',
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
});
