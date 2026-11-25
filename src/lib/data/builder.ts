import { collection, doc, getDoc, getDocs } from '@react-native-firebase/firestore';
import type { Firestore } from '@react-native-firebase/firestore';
import type { MembershipDoc, NoticeDoc, ProjectDoc, TowerDoc, UnitDoc } from '@/types/domain';
import { isMembershipDoc } from '@/lib/membership/repository';
import { isNoticeDoc, isProjectDoc, isRecord, isTowerDoc, isUnitDoc } from './parse';

export type BuilderSnapshot = {
  project: ProjectDoc | null;
  towers: TowerDoc[];
  units: UnitDoc[];
  buyers: MembershipDoc[];
  notices: NoticeDoc[];
};

function timestampMillis(value: { toMillis(): number }): number {
  return value.toMillis();
}

export async function loadBuilderSnapshot(
  firestore: Firestore,
  projectId: string,
): Promise<BuilderSnapshot> {
  const [projectSnapshot, towersSnapshot, unitsSnapshot, membersSnapshot, noticesSnapshot] =
    await Promise.all([
      getDoc(doc(firestore, 'projects', projectId)),
      getDocs(collection(firestore, 'projects', projectId, 'towers')),
      getDocs(collection(firestore, 'projects', projectId, 'units')),
      getDocs(collection(firestore, 'projects', projectId, 'members')),
      getDocs(collection(firestore, 'projects', projectId, 'notices')),
    ]);

  const projectValue = projectSnapshot.exists()
    ? { ...projectSnapshot.data(), id: projectSnapshot.id }
    : null;
  const project = isProjectDoc(projectValue, projectId) ? projectValue : null;

  const towers = towersSnapshot.docs.flatMap((document) => {
    const value = { ...document.data(), id: document.id };
    return isTowerDoc(value, document.id) ? [value] : [];
  });
  const units = unitsSnapshot.docs.flatMap((document) => {
    const value = { ...document.data(), id: document.id };
    return isUnitDoc(value, document.id) ? [value] : [];
  });
  const buyers = membersSnapshot.docs.flatMap((document) => {
    const value = document.data();
    return isRecord(value) && isMembershipDoc(value, document.id, projectId) && value.role === 'buyer'
      ? [value as MembershipDoc]
      : [];
  });
  const notices = noticesSnapshot.docs.flatMap((document) => {
    const value = { ...document.data(), id: document.id };
    return isNoticeDoc(value, document.id) ? [value] : [];
  });

  towers.sort((first, second) => first.name.localeCompare(second.name));
  units.sort((first, second) => first.label.localeCompare(second.label));
  buyers.sort((first, second) => (first.unitId ?? '').localeCompare(second.unitId ?? ''));
  notices.sort((first, second) => timestampMillis(second.createdAt) - timestampMillis(first.createdAt));

  return { project, towers, units, buyers, notices };
}
