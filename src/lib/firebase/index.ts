import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
} from '@react-native-firebase/functions';
import { Platform } from 'react-native';
import type { ClientConfig } from '@/config/env';
import type { FirebaseServices } from '@/types/firebase';

let cachedServices: FirebaseServices | null = null;

function emulatorHost(): string {
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

function createAppCheck(app: FirebaseServices['app']): FirebaseServices['appCheck'] {
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
    },
  });

  return initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}

export function initializeFirebase(config: ClientConfig): FirebaseServices {
  if (cachedServices) {
    return cachedServices;
  }

  const app = getApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, config.functionsRegion);
  const appCheck = createAppCheck(app);

  if (config.useFirebaseEmulator) {
    const host = emulatorHost();
    connectAuthEmulator(auth, `http://${host}:9099`);
    connectFirestoreEmulator(firestore, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
  }

  const services: FirebaseServices = {
    app,
    auth,
    firestore,
    functions,
    appCheck,
  };

  cachedServices = services;
  return services;
}
