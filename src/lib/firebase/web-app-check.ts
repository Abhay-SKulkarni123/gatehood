import { getApp as getWebApp } from 'firebase/app';
import {
  initializeAppCheck as initializeWebAppCheckSdk,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import type { WebFirebaseConfig } from '@/config/env';
import type { FirebaseServices } from '@/types/firebase';
import { resolveWebAppCheckProvider } from './platform';

type WebAppCheckGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

function enableWebAppCheckDebugMode(): void {
  const scope = globalThis as WebAppCheckGlobal;
  if (typeof scope.FIREBASE_APPCHECK_DEBUG_TOKEN !== 'string') {
    scope.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

export function initializeWebAppCheck(
  appName: string,
  config: WebFirebaseConfig,
  isDevelopment: boolean,
): FirebaseServices['appCheck'] {
  if (isDevelopment) {
    enableWebAppCheckDebugMode();
  }

  resolveWebAppCheckProvider(config);
  const provider = new ReCaptchaEnterpriseProvider(config.appCheckSiteKey);

  const appCheck = initializeWebAppCheckSdk(getWebApp(appName), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return appCheck as unknown as FirebaseServices['appCheck'];
}
