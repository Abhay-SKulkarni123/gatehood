import {
  createUserWithEmailAndPassword as createUserWithEmailAndPasswordNative,
  onAuthStateChanged as onAuthStateChangedNative,
  signInWithEmailAndPassword as signInWithEmailAndPasswordNative,
  signOut as signOutNative,
} from '@react-native-firebase/auth';
import type { Auth as NativeAuth, User as NativeUser } from '@react-native-firebase/auth';
import { Platform } from 'react-native';
import type { AppAuth, AppUser } from '@/types/firebase';
import {
  subscribeToWebAuthState,
  webCreateUserWithEmailAndPassword,
  webSignInWithEmailPassword,
  webSignOut,
} from '@/lib/firebase/web-auth';
import type { Auth as WebAuth, User as WebUser } from 'firebase/auth';

type AuthStateListener = (user: AppUser | null) => void;

function asNativeAuth(auth: AppAuth): NativeAuth {
  return auth as NativeAuth;
}

function asWebAuth(auth: AppAuth): WebAuth {
  return auth as WebAuth;
}

function subscribeNative(auth: AppAuth, onUserChanged: AuthStateListener): () => void {
  return onAuthStateChangedNative(asNativeAuth(auth), (user: NativeUser | null) => {
    onUserChanged(user as AppUser | null);
  });
}

function subscribeWeb(auth: AppAuth, onUserChanged: AuthStateListener): () => void {
  return subscribeToWebAuthState(asWebAuth(auth), (user: WebUser | null) => {
    onUserChanged(user as AppUser | null);
  });
}

async function signInNative(auth: AppAuth, email: string, password: string): Promise<void> {
  await signInWithEmailAndPasswordNative(asNativeAuth(auth), email, password);
}

async function signInWeb(auth: AppAuth, email: string, password: string): Promise<void> {
  await webSignInWithEmailPassword(asWebAuth(auth), email, password);
}

async function registerNative(auth: AppAuth, email: string, password: string): Promise<void> {
  await createUserWithEmailAndPasswordNative(asNativeAuth(auth), email, password);
}

async function registerWeb(auth: AppAuth, email: string, password: string): Promise<void> {
  await webCreateUserWithEmailAndPassword(asWebAuth(auth), email, password);
}

async function logoutNative(auth: AppAuth): Promise<void> {
  await signOutNative(asNativeAuth(auth));
}

async function logoutWeb(auth: AppAuth): Promise<void> {
  await webSignOut(asWebAuth(auth));
}

export const authAdapter =
  Platform.OS === 'web'
    ? {
        subscribe: subscribeWeb,
        signIn: signInWeb,
        register: registerWeb,
        logout: logoutWeb,
      }
    : {
        subscribe: subscribeNative,
        signIn: signInNative,
        register: registerNative,
        logout: logoutNative,
      };
