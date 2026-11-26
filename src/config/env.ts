import { Platform } from 'react-native';
import { isSlug } from '@/utils/identifiers';

const FUNCTIONS_REGION_PATTERN = /^[a-z0-9-]+$/;
const WEB_APP_CHECK_PROVIDER = 'recaptchaEnterprise';

export type AppCheckWebProvider = typeof WEB_APP_CHECK_PROVIDER;

export type WebFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseUrl: string;
  appCheckProvider: AppCheckWebProvider;
  appCheckSiteKey: string;
};

export type ClientConfig = {
  constructionProjectId: string;
  functionsRegion: string;
  useFirebaseEmulator: boolean;
  webFirebase?: WebFirebaseConfig;
};

export class ConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid client configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

function readValue(env: Record<string, string | undefined>, key: string): string {
  return env[key]?.trim() ?? '';
}

function parseWebFirebaseConfig(
  env: Record<string, string | undefined>,
  issues: string[],
): WebFirebaseConfig | undefined {
  const apiKey = readValue(env, 'EXPO_PUBLIC_FIREBASE_API_KEY');
  const authDomain = readValue(env, 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
  const projectId = readValue(env, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const storageBucket = readValue(env, 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readValue(env, 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  const appId = readValue(env, 'EXPO_PUBLIC_FIREBASE_APP_ID');
  const configuredDatabaseUrl = readValue(env, 'EXPO_PUBLIC_FIREBASE_DATABASE_URL');
  const appCheckProvider = readValue(env, 'EXPO_PUBLIC_APP_CHECK_PROVIDER');
  const appCheckSiteKey = readValue(env, 'EXPO_PUBLIC_APP_CHECK_SITE_KEY');

  const hasWebConfig = [
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    appCheckProvider,
    appCheckSiteKey,
    configuredDatabaseUrl,
  ].some(Boolean);

  if (!hasWebConfig) {
    return undefined;
  }

  if (!apiKey) issues.push('EXPO_PUBLIC_FIREBASE_API_KEY is required for web.');
  if (!authDomain) issues.push('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN is required for web.');
  if (!projectId) issues.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID is required for web.');
  else if (!isSlug(projectId)) {
    issues.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID must be a lowercase slug.');
  }
  if (!storageBucket) issues.push('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET is required for web.');
  if (!messagingSenderId) {
    issues.push('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID is required for web.');
  }
  if (!appId) issues.push('EXPO_PUBLIC_FIREBASE_APP_ID is required for web.');
  if (!appCheckSiteKey) {
    issues.push('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
  }
  if (appCheckProvider !== WEB_APP_CHECK_PROVIDER) {
    issues.push('EXPO_PUBLIC_APP_CHECK_PROVIDER must be recaptchaEnterprise for web.');
  }

  const databaseUrl =
    configuredDatabaseUrl || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : '');

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    databaseUrl,
    appCheckProvider: appCheckProvider as AppCheckWebProvider,
    appCheckSiteKey,
  };
}

export function parseClientConfig(
  env: Record<string, string | undefined> = process.env,
  platform: 'web' | 'native' = 'native',
): ClientConfig {
  const issues: string[] = [];
  const constructionProjectId = readValue(env, 'EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID');
  const functionsRegion = readValue(env, 'EXPO_PUBLIC_FUNCTIONS_REGION');
  const emulatorFlag = readValue(env, 'EXPO_PUBLIC_USE_FIREBASE_EMULATOR');
  const webFirebase = parseWebFirebaseConfig(env, issues);

  if (!constructionProjectId) {
    issues.push('EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID is required.');
  } else if (!isSlug(constructionProjectId)) {
    issues.push('EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID must be a lowercase slug.');
  }

  if (!functionsRegion) {
    issues.push('EXPO_PUBLIC_FUNCTIONS_REGION is required.');
  } else if (!FUNCTIONS_REGION_PATTERN.test(functionsRegion)) {
    issues.push('EXPO_PUBLIC_FUNCTIONS_REGION must contain only lowercase letters, numbers, and hyphens.');
  }

  let useFirebaseEmulator = false;
  if (emulatorFlag && emulatorFlag !== 'true' && emulatorFlag !== 'false') {
    issues.push('EXPO_PUBLIC_USE_FIREBASE_EMULATOR must be true or false when provided.');
  } else {
    useFirebaseEmulator = emulatorFlag === 'true';
  }

  if (platform === 'web' && !webFirebase) {
    issues.push('Firebase web configuration is required when running on web.');
  }

  if (issues.length > 0) {
    throw new ConfigurationError(issues);
  }

  return {
    constructionProjectId,
    functionsRegion,
    useFirebaseEmulator,
    ...(webFirebase ? { webFirebase } : {}),
  };
}

export function getClientConfig(): ClientConfig {
  const platform = Platform.OS === 'web' ? 'web' : 'native';
  return parseClientConfig(process.env, platform);
}
