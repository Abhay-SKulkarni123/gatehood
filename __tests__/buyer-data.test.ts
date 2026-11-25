import { doc, getDoc, getDocs } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { FirestoreTimestamp, MembershipDoc } from '@/types/domain';
import { loadBuyerUnit } from '@/lib/data/units';
import { loadBuyerProject } from '@/lib/data/buyer';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
}));

const mockDoc = doc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;

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

beforeEach(() => {
  jest.resetAllMocks();
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
  (getDocs as jest.Mock).mockResolvedValue({ empty: true, docs: [] });

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
