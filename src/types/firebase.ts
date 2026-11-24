import type { FirebaseApp } from '@react-native-firebase/app';
import type { AppCheck } from '@react-native-firebase/app-check';
import type { Auth } from '@react-native-firebase/auth';
import type { Firestore } from '@react-native-firebase/firestore';
import type { Functions } from '@react-native-firebase/functions';

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  appCheck: AppCheck;
};
