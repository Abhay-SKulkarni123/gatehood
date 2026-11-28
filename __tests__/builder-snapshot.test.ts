import { getDoc, getDocs } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import { loadBuilderSnapshot, persistedBuyerCount } from '@/lib/data/builder';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn((_firestore: unknown, ...parts: string[]) => parts.join('/')),
  doc: jest.fn((_firestore: unknown, ...parts: string[]) => parts.join('/')),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
}));

const PROJECT_ID = 'demo-project';

function timestampAt(millis: number) {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

const timestamp = timestampAt(1000);

function docSnapshot(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const contacts = [
  ['Aarav Sharma', '+15550100001', 'tower-1', 'unit-1'],
  ['Ananya Rao', '+15550100002', 'tower-1', 'unit-2'],
  ['Diya Iyer', '+15550100003', 'tower-1', 'unit-3'],
  ['Ishaan Verma', '+15550100004', 'tower-1', 'unit-4'],
  ['Kavya Nair', '+15550100005', 'tower-2', 'unit-5'],
  ['Meera Patel', '+15550100006', 'tower-2', 'unit-6'],
  ['Rehan Khan', '+15550100007', 'tower-2', 'unit-7'],
  ['Sanya Gupta', '+15550100008', 'tower-2', 'unit-8'],
].map(([name, phone, towerId, unitId], index) =>
  docSnapshot(`contact-${index + 1}`, {
    id: `contact-${index + 1}`,
    projectId: PROJECT_ID,
    towerId,
    unitId,
    name,
    phone,
    importedByUid: 'local-builder-uid',
    importedAt: timestamp,
    updatedAt: timestamp,
  }),
);

describe('builder snapshot buyer count', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      id: PROJECT_ID,
      data: () => ({ id: PROJECT_ID, name: 'Demo', createdByUid: 'local-builder-uid', createdAt: timestamp }),
    });
    (getDocs as jest.Mock).mockImplementation((path: string) => {
      if (path === `projects/${PROJECT_ID}/buyerContacts`) {
        return Promise.resolve({
          docs: [
            ...contacts,
            docSnapshot('invalid-contact', {
              id: 'invalid-contact',
              projectId: PROJECT_ID,
              towerId: 'tower-1',
              unitId: 'unit-9',
              name: '',
              phone: '+15550100009',
              importedByUid: 'local-builder-uid',
              importedAt: timestamp,
              updatedAt: timestamp,
            }),
          ],
        });
      }
      if (path === `projects/${PROJECT_ID}/members`) {
        return Promise.resolve({
          docs: [
            docSnapshot('local-buyer-uid', {
              uid: 'local-buyer-uid',
              projectId: PROJECT_ID,
              role: 'buyer',
              towerId: 'tower-1',
              unitId: 'unit-1',
              createdByUid: 'local-builder-uid',
              createdAt: timestamp,
            }),
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });
  });

  it('counts persisted buyer contacts, not joined memberships or attempted writes', async () => {
    const snapshot = await loadBuilderSnapshot({} as Firestore, PROJECT_ID);

    expect(snapshot.buyers).toHaveLength(1);
    expect(snapshot.buyerContacts).toHaveLength(8);
    expect(persistedBuyerCount(snapshot)).toBe(8);
    expect(snapshot.buyerContacts[0]).toMatchObject({
      name: 'Aarav Sharma',
      phone: '+15550100001',
      towerId: 'tower-1',
      unitId: 'unit-1',
    });
  });
});
