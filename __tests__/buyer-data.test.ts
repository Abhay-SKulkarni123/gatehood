import { collection, doc, getDoc, onSnapshot } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FeedEntryDoc, FirestoreTimestamp, MembershipDoc } from '@/types/domain';
import { loadBuyerUnit } from '@/lib/data/units';
import { loadBuyerProject, subscribeBuyerFeed } from '@/lib/data/buyer';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
}));

const mockCollection = collection as jest.Mock;
const mockDoc = doc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;

const firestore = {} as Firestore;

function timestampAt(millis: number): FirestoreTimestamp {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

const timestamp = timestampAt(1000);

function membership(overrides: Partial<MembershipDoc> = {}): MembershipDoc {
  return {
    uid: 'buyer-1',
    projectId: 'project-1',
    role: 'buyer',
    towerId: 'tower-1',
    unitId: 'unit-1',
    createdByUid: 'builder-1',
    createdAt: timestamp,
    ...overrides,
  };
}

function feedDoc(noticeId: string, overrides: Record<string, unknown> = {}) {
  const value = {
    uid: 'buyer-1',
    noticeId,
    projectId: 'project-1',
    title: noticeId,
    body: 'Body',
    pinned: false,
    deliveredAt: timestamp,
    updatedAt: timestamp,
    readAt: null,
    audienceType: 'project',
    audienceTowerIds: [],
    audienceUnitIds: [],
    ...overrides,
  };
  return { id: noticeId, data: () => value };
}

beforeEach(() => {
  jest.resetAllMocks();
});

test('buyer feed subscription reads only the buyer feed path and applies live changes in feed order', () => {
  const listeners: {
    onNext?: (snapshot: { docs: ReturnType<typeof feedDoc>[] }) => void;
    onError?: (error: unknown) => void;
  } = {};
  const unsubscribe = jest.fn();
  mockCollection.mockReturnValue('feed-collection');
  mockOnSnapshot.mockImplementation((_reference, onNext, onError) => {
    listeners.onNext = onNext;
    listeners.onError = onError;
    return unsubscribe;
  });

  const onEntries = jest.fn();
  const onError = jest.fn();
  const stop = subscribeBuyerFeed(firestore, 'buyer-1', 'project-1', onEntries, onError);

  expect(mockCollection).toHaveBeenCalledWith(firestore, 'users', 'buyer-1', 'feed');
  expect(stop).toBe(unsubscribe);

  listeners.onNext?.({
    docs: [
      feedDoc('older', { deliveredAt: timestampAt(1000) }),
      feedDoc('pinned', { pinned: true, deliveredAt: timestampAt(500) }),
      feedDoc('newer', { deliveredAt: timestampAt(2000) }),
      feedDoc('other-project', { projectId: 'project-2' }),
      feedDoc('wrong-uid', { uid: 'buyer-2' }),
    ],
  });

  expect(onEntries).toHaveBeenCalledTimes(1);
  expect((onEntries.mock.calls[0][0] as FeedEntryDoc[]).map((entry) => entry.noticeId)).toEqual([
    'pinned',
    'newer',
    'older',
  ]);
  expect(
    (onEntries.mock.calls[0][0] as FeedEntryDoc[]).every((entry) => entry.uid === 'buyer-1'),
  ).toBe(true);

  listeners.onNext?.({ docs: [feedDoc('fresh', { deliveredAt: timestampAt(3000) })] });
  expect((onEntries.mock.calls[1][0] as FeedEntryDoc[]).map((entry) => entry.noticeId)).toEqual([
    'fresh',
  ]);

  const failure = new Error('offline');
  listeners.onError?.(failure);
  expect(onError).toHaveBeenCalledWith(failure);
});

test('buyer unit loading validates the assigned unit and rejects another project or tower', async () => {
  mockDoc.mockReturnValue('unit-ref');
  const unitData = {
    id: 'unit-1',
    projectId: 'project-1',
    towerId: 'tower-1',
    label: 'Unit 101',
    createdAt: timestamp,
    configuration: '2 BHK',
    constructionProgress: 45,
    possessionDate: timestampAt(Date.UTC(2027, 5, 30)),
    updatedAt: timestamp,
    updatedByUid: 'builder-1',
  };
  mockGetDoc.mockResolvedValue({ exists: true, id: 'unit-1', data: () => unitData });

  const unit = await loadBuyerUnit(firestore, membership());
  expect(mockDoc).toHaveBeenCalledWith(firestore, 'projects', 'project-1', 'units', 'unit-1');
  expect(unit).toMatchObject({
    id: 'unit-1',
    configuration: '2 BHK',
    constructionProgress: 45,
  });

  mockGetDoc.mockResolvedValue({
    exists: true,
    id: 'unit-1',
    data: () => ({ ...unitData, projectId: 'project-2' }),
  });
  await expect(loadBuyerUnit(firestore, membership())).resolves.toBeNull();

  mockGetDoc.mockResolvedValue({
    exists: true,
    id: 'unit-1',
    data: () => ({ ...unitData, towerId: 'tower-2' }),
  });
  await expect(loadBuyerUnit(firestore, membership())).resolves.toBeNull();

  await expect(
    loadBuyerUnit(firestore, membership({ unitId: null, towerId: null })),
  ).resolves.toBeNull();
});

test('buyer project loading validates the project from the buyer membership', async () => {
  mockDoc.mockReturnValue('project-ref');
  const projectData = {
    id: 'project-1',
    name: 'Sunrise Residences',
    createdByUid: 'builder-1',
    createdAt: timestamp,
  };
  mockGetDoc.mockResolvedValue({ exists: true, id: 'project-1', data: () => projectData });

  const project = await loadBuyerProject(firestore, membership());
  expect(mockDoc).toHaveBeenCalledWith(firestore, 'projects', 'project-1');
  expect(project).toMatchObject({ id: 'project-1', name: 'Sunrise Residences' });

  mockGetDoc.mockResolvedValue({
    exists: true,
    id: 'project-1',
    data: () => ({ ...projectData, name: '' }),
  });
  await expect(loadBuyerProject(firestore, membership())).resolves.toBeNull();

  mockGetDoc.mockResolvedValue({ exists: false, id: 'project-1', data: () => projectData });
  await expect(loadBuyerProject(firestore, membership())).resolves.toBeNull();
});
