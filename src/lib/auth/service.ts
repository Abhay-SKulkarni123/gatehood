import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@react-native-firebase/auth';
import { getFirebaseServices } from '@/lib/firebase';
import {
  AuthActionError,
  describeAuthError,
  validateCredentials,
  validateRegistration,
} from './errors';

export type BuyerRegistration = {
  email: string;
  password: string;
  confirmPassword: string;
};

async function runAuthAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    throw new AuthActionError(describeAuthError(error));
  }
}

export async function loginWithEmailPassword(email: string, password: string): Promise<void> {
  const validationMessage = validateCredentials(email, password);
  if (validationMessage) {
    throw new AuthActionError(validationMessage);
  }

  const auth = getFirebaseServices().auth;
  await runAuthAction(async () => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  });
}

export async function registerBuyer({
  email,
  password,
  confirmPassword,
}: BuyerRegistration): Promise<void> {
  const validationMessage = validateRegistration({ email, password, confirmPassword });
  if (validationMessage) {
    throw new AuthActionError(validationMessage);
  }

  const auth = getFirebaseServices().auth;
  await runAuthAction(async () => {
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  });
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseServices().auth;
  await runAuthAction(async () => {
    await signOut(auth);
  });
}
