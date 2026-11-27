import { getApp as getWebApp } from 'firebase/app';
import {
  getToken as getWebAppCheckToken,
  initializeAppCheck as initializeWebAppCheckSdk,
  ReCaptchaEnterpriseProvider,
  type AppCheck as WebAppCheck,
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

export async function initializeWebAppCheck(
  appName: string,
  config: WebFirebaseConfig,
  isDevelopment: boolean,
): Promise<FirebaseServices['appCheck']> {
  if (isDevelopment) {
    enableWebAppCheckDebugMode();
  }

  resolveWebAppCheckProvider(config);
  const provider = new ReCaptchaEnterpriseProvider(config.appCheckSiteKey);

  const appCheck = initializeWebAppCheckSdk(getWebApp(appName), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  try {
    await getWebAppCheckToken(appCheck as WebAppCheck, isDevelopment);
  } catch {
    throw new Error(
      'Firebase App Check could not obtain a web token. Verify the App Check registration, reCAPTCHA Enterprise configuration, and local debug token, then reload.',
    );
  }

  return appCheck as unknown as FirebaseServices['appCheck'];
}
