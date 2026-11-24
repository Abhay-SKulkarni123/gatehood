import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { Platform } from 'react-native';
import type { ClientConfig } from '@/config/env';
import type { FirebaseServices } from '@/types/firebase';

let cachedAppCheck: FirebaseServices['appCheck'] | null = null;
let cachedServices: FirebaseServices | null = null;
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;

function emulatorHost(): string {
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

function getAppCheck(app: FirebaseServices['app']): FirebaseServices['appCheck'] {
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

  cachedAppCheck = initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return cachedAppCheck;
}

export function initializeFirebase(config: ClientConfig): FirebaseServices {
  if (cachedServices) {
    return cachedServices;
  }

  const app = getApp();
  const appCheck = getAppCheck(app);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, config.functionsRegion);

  if (config.useFirebaseEmulator) {
    const host = emulatorHost();

    if (!authEmulatorConnected) {
      connectAuthEmulator(auth, `http://${host}:9099`);
      authEmulatorConnected = true;
    }

    if (!firestoreEmulatorConnected) {
      connectFirestoreEmulator(firestore, host, 8080);
      firestoreEmulatorConnected = true;
    }
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
