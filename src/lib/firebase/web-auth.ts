import { getApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator as connectFirebaseAuthEmulator,
  createUserWithEmailAndPassword,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';

let cachedAuth: Auth | null = null;
let emulatorConnected = false;

export function getWebAuth(appName?: string): Auth {
  if (!cachedAuth) {
    const app = appName ? getApp(appName) : getApp();
    cachedAuth = initializeAuth(app, {
      persistence: browserLocalPersistence,
    });
  }

  return cachedAuth;
}

export function connectWebAuthEmulator(auth: Auth, host: string): void {
  if (emulatorConnected) {
    return;
  }

  connectFirebaseAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  emulatorConnected = true;
}

export function subscribeToWebAuthState(
  auth: Auth,
  onUserChanged: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, onUserChanged);
}

export async function webSignInWithEmailPassword(
  auth: Auth,
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function webCreateUserWithEmailAndPassword(
  auth: Auth,
  email: string,
  password: string,
): Promise<void> {
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function webSignOut(auth: Auth): Promise<void> {
  await signOut(auth);
}
