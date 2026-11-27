import type { FirebaseApp } from '@react-native-firebase/app';
import type { AppCheck } from '@react-native-firebase/app-check';
import type { Auth as NativeAuth, User as NativeUser } from '@react-native-firebase/auth';
import type { Firestore } from '@react-native-firebase/firestore';
import type { Functions } from '@react-native-firebase/functions';
import type { Auth as WebAuth, User as WebUser } from 'firebase/auth';

export type AppAuth = NativeAuth | WebAuth;
export type AppUser = NativeUser | WebUser;

export type FirebaseServices = {
  app: FirebaseApp;
  auth: AppAuth;
  firestore: Firestore;
  functions: Functions;
  appCheck: AppCheck;
};
