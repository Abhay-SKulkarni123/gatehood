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

const APP_CHECK_DEBUG_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireWebAppCheckDebugToken(config: WebFirebaseConfig): string {
  const token = config.appCheckDebugToken?.trim();

  if (!token) {
    throw new Error(
      'A local Firebase App Check debug token is required. Set EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN for local development.',
    );
  }

  if (!APP_CHECK_DEBUG_TOKEN_PATTERN.test(token)) {
    throw new Error(
      'EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN must be a valid Firebase App Check debug token.',
    );
  }

  return token;
}

function configureWebAppCheckDebugToken(token: string): void {
  const scope = globalThis as WebAppCheckGlobal;
  scope.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
}

function clearWebAppCheckDebugToken(): void {
  delete (globalThis as WebAppCheckGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN;
}

export async function initializeWebAppCheck(
  appName: string,
  config: WebFirebaseConfig,
  isDevelopment: boolean,
): Promise<FirebaseServices['appCheck']> {
  resolveWebAppCheckProvider(config);

  if (isDevelopment) {
    configureWebAppCheckDebugToken(requireWebAppCheckDebugToken(config));
  } else {
    clearWebAppCheckDebugToken();
  }

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
