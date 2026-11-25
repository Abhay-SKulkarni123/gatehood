import { randomUUID } from 'crypto';
import { db } from './firestore';
import { paths } from './paths';
import { toRecord } from './validation';
import { RETRY_LEASE_MS } from './config';

interface LeaseDoc {
  owner: string;
  expiresAtMs: number;
  updatedAtMs: number;
}

function readLease(value: unknown): LeaseDoc | null {
  let data: Record<string, unknown>;
  try {
    data = toRecord(value);
  } catch {
    return null;
  }

  if (
    typeof data.owner !== 'string' ||
    typeof data.expiresAtMs !== 'number' ||
    typeof data.updatedAtMs !== 'number'
  ) {
    return null;
  }

  return {
    owner: data.owner,
    expiresAtMs: data.expiresAtMs,
    updatedAtMs: data.updatedAtMs,
  };
}

export async function acquireRetryLease(): Promise<string | null> {
  const leaseRef = db.doc(paths.retryLock());
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(leaseRef);
    if (snapshot.exists) {
      const current = readLease(snapshot.data());
      if (current && current.expiresAtMs > now) {
        return null;
      }
    }

    const owner = randomUUID();
    transaction.set(leaseRef, {
      owner,
      expiresAtMs: now + RETRY_LEASE_MS,
      updatedAtMs: now,
    });
    return owner;
  });
}

export async function releaseRetryLease(owner: string): Promise<void> {
  const leaseRef = db.doc(paths.retryLock());

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(leaseRef);
    if (!snapshot.exists) {
      return;
    }

    const current = readLease(snapshot.data());
    if (current?.owner === owner) {
      transaction.delete(leaseRef);
    }
  });
}
