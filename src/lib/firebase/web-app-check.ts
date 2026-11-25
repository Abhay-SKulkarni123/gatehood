import { getApp as getWebApp } from 'firebase/app';
import {
  CustomProvider as WebCustomProvider,
  initializeAppCheck as initializeWebAppCheckSdk,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from 'firebase/app-check';
import type { WebFirebaseConfig } from '@/config/env';
import type { FirebaseServices } from '@/types/firebase';
import { resolveWebAppCheckProvider } from './platform';

type WebAppCheckGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

function createDebugProvider(): WebCustomProvider {
  const scope = globalThis as WebAppCheckGlobal;
  scope.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

  return new WebCustomProvider({
    async getToken() {
      throw new Error(
        'Web App Check debug token is not registered. Register the token printed in the browser console in Firebase Console.',
      );
    },
  });
}

export function initializeWebAppCheck(
  appName: string,
  config: WebFirebaseConfig,
  isDevelopment: boolean,
): FirebaseServices['appCheck'] {
  const providerKind = resolveWebAppCheckProvider(config, isDevelopment);

  const provider =
    providerKind === 'debug'
      ? createDebugProvider()
      : providerKind === 'recaptchaEnterprise'
        ? new ReCaptchaEnterpriseProvider(config.appCheckSiteKey as string)
        : new ReCaptchaV3Provider(config.appCheckSiteKey as string);

  const appCheck = initializeWebAppCheckSdk(getWebApp(appName), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return appCheck as unknown as FirebaseServices['appCheck'];
}
