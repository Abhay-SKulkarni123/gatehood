import { Platform } from 'react-native';
import type { AppCheckWebProvider, WebFirebaseConfig } from '@/config/env';

export type FirebasePlatform = 'web' | 'native';

export function currentFirebasePlatform(): FirebasePlatform {
  return Platform.OS === 'web' ? 'web' : 'native';
}

export function resolveEmulatorHost(platformOS: string): string {
  return platformOS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

export function toWebFirebaseOptions(config: WebFirebaseConfig) {
  return {
    apiKey: config.apiKey,
    appId: config.appId,
    authDomain: config.authDomain,
    databaseURL: config.databaseUrl,
    messagingSenderId: config.messagingSenderId,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
  };
}

export function resolveWebAppCheckProvider(config: WebFirebaseConfig): AppCheckWebProvider {
  if (!config.appCheckSiteKey) {
    throw new Error('EXPO_PUBLIC_APP_CHECK_SITE_KEY is required for web.');
  }

  return config.appCheckProvider;
}
