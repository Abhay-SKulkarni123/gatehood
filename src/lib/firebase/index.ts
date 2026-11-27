import { getApp, getApps, initializeApp } from '@react-native-firebase/app';
import {
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';
import { Platform } from 'react-native';
import type { ClientConfig } from '@/config/env';
import type { FirebaseServices } from '@/types/firebase';
import {
  currentFirebasePlatform,
  resolveEmulatorHost,
  resolveWebAppCheckProvider,
  toWebFirebaseOptions,
} from './platform';
import { connectWebAuthEmulator, getWebAuth } from './web-auth';
import { initializeWebAppCheck } from './web-app-check';
import { connectWebFirestoreEmulator } from './web-firestore';

let cachedAppCheck: FirebaseServices['appCheck'] | null = null;
let cachedServices: FirebaseServices | null = null;
let initializationPromise: Promise<FirebaseServices> | null = null;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
let functionsEmulatorConnected = false;

function getNativeAppCheck(app: FirebaseServices['app']): FirebaseServices['appCheck'] {
  if (cachedAppCheck) {
    return cachedAppCheck;
  }

  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
    },
  });

  cachedAppCheck = initializeNativeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return cachedAppCheck;
}

async function ensureFirebaseApp(
  config: ClientConfig,
  platform: ReturnType<typeof currentFirebasePlatform>,
): Promise<FirebaseServices['app']> {
  if (platform === 'web') {
    const webConfig = config.webFirebase;
    if (!webConfig) {
      throw new Error('Firebase web configuration is required when running on web.');
    }

    resolveWebAppCheckProvider(webConfig);

    if (getApps().length === 0) {
      await initializeApp(toWebFirebaseOptions(webConfig));
    }
  }

  return getApp();
}

async function initializeFirebaseServices(
  config: ClientConfig,
  platform: ReturnType<typeof currentFirebasePlatform>,
): Promise<FirebaseServices> {
  const app = await ensureFirebaseApp(config, platform);
  const useDebugWebAppCheck = __DEV__ || config.useFirebaseEmulator;
  const appCheck =
    platform === 'web' && config.webFirebase
      ? await initializeWebAppCheck(app.name, config.webFirebase, useDebugWebAppCheck)
      : getNativeAppCheck(app);
  let auth: FirebaseServices['auth'];
  if (platform === 'web') {
    const webAuth = getWebAuth(app.name);
    if (config.useFirebaseEmulator && !authEmulatorConnected) {
      connectWebAuthEmulator(webAuth, resolveEmulatorHost(Platform.OS));
      authEmulatorConnected = true;
    }
    auth = webAuth;
  } else {
    const nativeAuth = getAuth(app);
    if (config.useFirebaseEmulator && !authEmulatorConnected) {
      connectAuthEmulator(nativeAuth, `http://${resolveEmulatorHost(Platform.OS)}:9099`);
      authEmulatorConnected = true;
    }
    auth = nativeAuth;
  }
  const firestore =
    platform === 'web' ? getFirestore(app) : initializeFirestore(app, { persistence: true });
  const functions = getFunctions(app, config.functionsRegion);

  if (config.useFirebaseEmulator) {
    const host = resolveEmulatorHost(Platform.OS);

    if (!firestoreEmulatorConnected) {
      connectFirestoreEmulator(firestore, host, 8080);
      if (platform === 'web') {
        connectWebFirestoreEmulator(host, 8080);
      }
      firestoreEmulatorConnected = true;
    }

    if (!functionsEmulatorConnected) {
      connectFunctionsEmulator(functions, host, 5001);
      functionsEmulatorConnected = true;
    }
  }

  return {
    app,
    auth,
    firestore,
    functions,
    appCheck,
  };
}

export function getFirebaseServices(): FirebaseServices {
  if (!cachedServices) {
    throw new Error('Firebase has not been initialized.');
  }
  return cachedServices;
}

export function initializeFirebase(
  config: ClientConfig,
  platform: ReturnType<typeof currentFirebasePlatform> = currentFirebasePlatform(),
): Promise<FirebaseServices> {
  if (cachedServices) {
    return Promise.resolve(cachedServices);
  }

  if (!initializationPromise) {
    initializationPromise = initializeFirebaseServices(config, platform)
      .then((services) => {
        cachedServices = services;
        return services;
      })
      .catch((error: unknown) => {
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}
