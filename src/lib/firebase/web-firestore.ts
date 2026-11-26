import { getApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

let cachedFirestore: Firestore | null = null;
let emulatorConnected = false;

export function getWebFirestore(): Firestore {
  if (!cachedFirestore) {
    cachedFirestore = getFirestore(getApp());
  }
  return cachedFirestore;
}

export function connectWebFirestoreEmulator(host: string, port: number): void {
  if (emulatorConnected) {
    return;
  }

  connectFirestoreEmulator(getWebFirestore(), host, port);
  emulatorConnected = true;
}
