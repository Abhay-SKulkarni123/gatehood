import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();

export function timestampNow(): Timestamp {
  return Timestamp.now();
}

export function incrementBy(value: number): FieldValue {
  return FieldValue.increment(value);
}
