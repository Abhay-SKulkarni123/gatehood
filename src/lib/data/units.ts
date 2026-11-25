import { doc, getDoc } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FirestoreTimestamp, MembershipDoc, UnitDoc } from '@/types/domain';
import { isUnitDoc } from './parse';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function timestampDate(value: FirestoreTimestamp): Date | null {
  try {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function utcCalendarDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function loadBuyerUnit(
  firestore: Firestore,
  membership: MembershipDoc,
): Promise<UnitDoc | null> {
  if (!membership.unitId || !membership.towerId) {
    return null;
  }

  const snapshot = await getDoc(
    doc(firestore, 'projects', membership.projectId, 'units', membership.unitId),
  );
  if (!snapshot.exists) {
    return null;
  }

  const value = { ...snapshot.data(), id: snapshot.id };
  if (!isUnitDoc(value, membership.unitId)) {
    return null;
  }
  return value.projectId === membership.projectId && value.towerId === membership.towerId
    ? value
    : null;
}

export function isValidPossessionDateInput(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function possessionDateToIsoDate(value: FirestoreTimestamp | null | undefined): string | null {
  const date = value ? timestampDate(value) : null;
  return date ? date.toISOString().slice(0, 10) : null;
}

export function getDaysUntilPossession(
  value: FirestoreTimestamp | null | undefined,
  now: Date = new Date(),
): number | null {
  const date = value ? timestampDate(value) : null;
  if (!date) {
    return null;
  }
  return Math.round((utcCalendarDay(date) - utcCalendarDay(now)) / MS_PER_DAY);
}

export function describeConstructionProgress(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'Construction progress not available';
  }
  return `${value}% complete`;
}

export function describePossessionDate(
  value: FirestoreTimestamp | null | undefined,
  now: Date = new Date(),
): string {
  const isoDate = possessionDateToIsoDate(value);
  if (!isoDate) {
    return 'Possession date not available';
  }

  const days = getDaysUntilPossession(value, now);
  if (days === null) {
    return `Possession date: ${isoDate}`;
  }
  if (days === 0) {
    return `Possession date: ${isoDate} (today)`;
  }
  if (days > 0) {
    return `Possession date: ${isoDate} (in ${days} day${days === 1 ? '' : 's'})`;
  }
  const elapsed = Math.abs(days);
  return `Possession date: ${isoDate} (${elapsed} day${elapsed === 1 ? '' : 's'} ago)`;
}
