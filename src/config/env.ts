import { isSlug } from '@/utils/identifiers';

const FUNCTIONS_REGION_PATTERN = /^[a-z0-9-]+$/;

export type ClientConfig = {
  constructionProjectId: string;
  functionsRegion: string;
  useFirebaseEmulator: boolean;
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

export function parseClientConfig(
  env: Record<string, string | undefined> = process.env,
): ClientConfig {
  const issues: string[] = [];
  const constructionProjectId = readValue(env, 'EXPO_PUBLIC_CONSTRUCTION_PROJECT_ID');
  const functionsRegion = readValue(env, 'EXPO_PUBLIC_FUNCTIONS_REGION');
  const emulatorFlag = readValue(env, 'EXPO_PUBLIC_USE_FIREBASE_EMULATOR');

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

  if (issues.length > 0) {
    throw new ConfigurationError(issues);
  }

  return {
    constructionProjectId,
    functionsRegion,
    useFirebaseEmulator,
  };
}

export function getClientConfig(): ClientConfig {
  return parseClientConfig(process.env);
}
