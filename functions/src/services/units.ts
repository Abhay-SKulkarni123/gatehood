import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type {
  BuyerContactDoc,
  BuyerImportData,
  BuyerImportResult,
  BuyerImportRow,
  TowerDoc,
  UnitDoc,
  UpdateUnitInfoData,
  UpdateUnitInfoResult,
} from '../domain/types';
import { FIRESTORE_BATCH_LIMIT, IMPORT_LOOKUP_LIMIT } from '../config';
import { invalidPayload } from '../errors';
import { db, timestampNow } from '../firestore';
import { paths } from '../paths';
import { stableImportId } from '../security';
import {
  normalizePhone,
  parseBuyerContact,
  parseProject,
  parseTower,
  parseUnit,
  toRecord,
  parseUpdateUnitInfo,
} from '../validation';

interface CsvRow {
  line: number;
  values: string[];
}

interface BuyerCandidate {
  row: number;
  tower: string;
  unit: string;
  name: string;
  phone: string;
  towerKey: string;
  unitKey: string;
  phoneKey: string;
  status: 'create' | 'unchanged' | 'error';
  message: string | null;
}

interface NamedRecord {
  id: string;
  key: string;
}

interface TowerRecord extends NamedRecord {
  projectId: string;
}

interface UnitRecord extends NamedRecord {
  projectId: string;
  towerId: string;
}

const HEADER_ALIASES = new Map<string, keyof Pick<BuyerCandidate, 'tower' | 'unit' | 'name' | 'phone'>>([
  ['tower', 'tower'],
  ['towername', 'tower'],
  ['unit', 'unit'],
  ['unitname', 'unit'],
  ['unitlabel', 'unit'],
  ['name', 'name'],
  ['buyername', 'name'],
  ['phone', 'phone'],
  ['phonenumber', 'phone'],
  ['mobile', 'phone'],
  ['mobilenumber', 'phone'],
]);

const REQUIRED_HEADERS = ['tower', 'unit', 'name', 'phone'] as const;

function parseCsv(csv: string): CsvRow[] {
  const source = csv.replace(/^\uFEFF/, '');
  const rows: CsvRow[] = [];
  let values: string[] = [];
  let field = '';
  let line = 1;
  let rowLine = 1;
  let inQuotes = false;
  let hasContent = false;

  const commitField = () => {
    values.push(field.trim());
    field = '';
  };

  const commitRow = () => {
    commitField();
    if (values.some((value) => value.length > 0) || hasContent) {
      rows.push({ line: rowLine, values });
    }
    values = [];
    hasContent = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
          hasContent = true;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') {
          line += 1;
        }
        field += char;
        hasContent = true;
      }
      continue;
    }

    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
        hasContent = true;
      } else {
        field += char;
        hasContent = true;
      }
      continue;
    }

    if (char === ',') {
      commitField();
      continue;
    }

    if (char === '\n') {
      commitRow();
      line += 1;
      rowLine = line;
      continue;
    }

    if (char === '\r') {
      if (source[index + 1] !== '\n') {
        commitRow();
        line += 1;
        rowLine = line;
      }
      continue;
    }

    field += char;
    hasContent = true;
  }

  if (inQuotes) {
    throw invalidPayload('CSV import contains an unclosed quoted field.');
  }

  commitRow();
  return rows;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerIndexes(header: string[]): Record<string, number> {
  const indexes: Record<string, number> = {};
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    const key = HEADER_ALIASES.get(normalized);
    if (!key || key in indexes) {
      throw invalidPayload('CSV header must include Tower, Unit, Name, and Phone.');
    }
    indexes[key] = index;
  });

  for (const key of REQUIRED_HEADERS) {
    if (indexes[key] === undefined) {
      throw invalidPayload('CSV header must include Tower, Unit, Name, and Phone.');
    }
  }
  return indexes;
}

function errorCandidate(
  candidate: BuyerCandidate,
  message: string,
): BuyerCandidate {
  return { ...candidate, status: 'error', message };
}

function candidatesFromCsv(csv: string): BuyerCandidate[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    throw invalidPayload('CSV import must include a header and at least one buyer row.');
  }

  const indexes = headerIndexes(rows[0].values);
  const candidates = rows.slice(1).map((row): BuyerCandidate => {
    const tower = row.values[indexes.tower] ?? '';
    const unit = row.values[indexes.unit] ?? '';
    const name = row.values[indexes.name] ?? '';
    const phone = row.values[indexes.phone] ?? '';
    const candidate: BuyerCandidate = {
      row: row.line,
      tower,
      unit,
      name,
      phone,
      towerKey: normalizeKey(tower),
      unitKey: normalizeKey(unit),
      phoneKey: normalizePhone(phone),
      status: 'create',
      message: null,
    };

    if (row.values.length !== rows[0].values.length) {
      return errorCandidate(candidate, 'Row has the wrong number of columns.');
    }
    if (!tower || tower.length > 120) {
      return errorCandidate(candidate, 'Tower must be 1 to 120 characters.');
    }
    if (!unit || unit.length > 120) {
      return errorCandidate(candidate, 'Unit must be 1 to 120 characters.');
    }
    if (!name || name.length > 120) {
      return errorCandidate(candidate, 'Name must be 1 to 120 characters.');
    }
    if (!/^\+?[0-9]{7,15}$/.test(candidate.phoneKey)) {
      return errorCandidate(
        candidate,
        'Phone must contain 7 to 15 digits and may include only a leading country code.',
      );
    }
    return candidate;
  });

  if (candidates.length === 0) {
    throw invalidPayload('CSV import must include at least one buyer row.');
  }
  if (candidates.length > FIRESTORE_BATCH_LIMIT) {
    throw invalidPayload(`CSV import supports at most ${FIRESTORE_BATCH_LIMIT} rows.`);
  }

  const towerUnitKeys = new Set<string>();
  const phoneKeys = new Set<string>();
  return candidates.map((candidate) => {
    if (candidate.status === 'error') {
      return candidate;
    }
    const towerUnitKey = `${candidate.towerKey}\u0000${candidate.unitKey}`;
    if (towerUnitKeys.has(towerUnitKey)) {
      return errorCandidate(candidate, 'Tower and unit combination is duplicated in this CSV.');
    }
    towerUnitKeys.add(towerUnitKey);
    if (phoneKeys.has(candidate.phoneKey)) {
      return errorCandidate(candidate, 'Phone number is duplicated in this CSV.');
    }
    phoneKeys.add(candidate.phoneKey);
    return candidate;
  });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadCollection(path: string): Promise<DocumentSnapshot[]> {
  const snapshot = await db.collection(path).limit(IMPORT_LOOKUP_LIMIT).get();
  return snapshot.docs;
}

async function loadRefs(pathsToLoad: readonly string[]): Promise<Map<string, DocumentSnapshot>> {
  const snapshots = new Map<string, DocumentSnapshot>();
  const unique = Array.from(new Set(pathsToLoad));
  for (const chunk of chunks(unique, 100)) {
    const loaded = await db.getAll(...chunk.map((path) => db.doc(path)));
    for (const snapshot of loaded) {
      snapshots.set(snapshot.ref.path, snapshot);
    }
  }
  return snapshots;
}

function buildNamedIndex<T extends NamedRecord>(records: readonly T[]): Map<string, T | null> {
  const index = new Map<string, T | null>();
  for (const record of records) {
    const existing = index.get(record.key);
    if (existing === undefined) {
      index.set(record.key, record);
    } else if (existing !== null && existing.id !== record.id) {
      index.set(record.key, null);
    }
  }
  return index;
}

export async function importBuyers(
  builderUid: string,
  data: BuyerImportData,
): Promise<BuyerImportResult> {
  const candidates = candidatesFromCsv(data.csv);
  const validCandidates = candidates.filter((candidate) => candidate.status !== 'error');

  const projectSnapshot = await db.doc(paths.project(data.projectId)).get();
  if (!projectSnapshot.exists) {
    throw invalidPayload('Project was not found.');
  }
  parseProject({ ...toRecord(projectSnapshot.data()), id: data.projectId });

  const [towerSnapshots, unitSnapshots] = await Promise.all([
    loadCollection(paths.towers(data.projectId)),
    loadCollection(paths.units(data.projectId)),
  ]);

  const towers = towerSnapshots.flatMap((snapshot) => {
    try {
      const parsed = parseTower({ ...toRecord(snapshot.data()), id: snapshot.id });
      if (parsed.projectId !== data.projectId || parsed.id !== snapshot.id) {
        return [];
      }
      return [{ id: parsed.id, projectId: parsed.projectId, key: normalizeKey(parsed.name) }];
    } catch {
      return [];
    }
  });
  const units = unitSnapshots.flatMap((snapshot) => {
    try {
      const parsed = parseUnit({ ...toRecord(snapshot.data()), id: snapshot.id });
      if (parsed.projectId !== data.projectId || parsed.id !== snapshot.id) {
        return [];
      }
      return [{ id: parsed.id, projectId: parsed.projectId, towerId: parsed.towerId, key: normalizeKey(parsed.label) }];
    } catch {
      return [];
    }
  });

  const towerByKey = buildNamedIndex(towers);
  const unitByTowerAndKey = buildNamedIndex(
    units.map((unit) => ({ ...unit, key: `${unit.towerId}\u0000${unit.key}` })),
  );
  const unitsByKey = new Map<string, UnitRecord[]>();
  for (const unit of units) {
    const list = unitsByKey.get(unit.key) ?? [];
    list.push(unit);
    unitsByKey.set(unit.key, list);
  }

  const deterministicTowerIds = new Map<string, string>();
  const contactPaths = new Map<string, string>();
  for (const candidate of validCandidates) {
    if (!deterministicTowerIds.has(candidate.towerKey)) {
      deterministicTowerIds.set(
        candidate.towerKey,
        stableImportId('tower', data.projectId, candidate.towerKey),
      );
    }
    contactPaths.set(
      candidate.phoneKey,
      paths.buyerContact(data.projectId, stableImportId('contact', data.projectId, candidate.phoneKey)),
    );
  }

  const [towerRefSnapshots, contactSnapshots] = await Promise.all([
    loadRefs(
      Array.from(deterministicTowerIds.values()).map((towerId) =>
        paths.tower(data.projectId, towerId),
      ),
    ),
    loadRefs(Array.from(contactPaths.values())),
  ]);

  const resolvedTowerIds = new Map<string, string | null>();
  for (const [towerKey, deterministicId] of deterministicTowerIds) {
    const existing = towerByKey.get(towerKey);
    if (existing === null) {
      resolvedTowerIds.set(towerKey, null);
      continue;
    }
    if (existing) {
      resolvedTowerIds.set(towerKey, existing.id);
      continue;
    }

    const direct = towerRefSnapshots.get(paths.tower(data.projectId, deterministicId));
    if (!direct?.exists) {
      resolvedTowerIds.set(towerKey, deterministicId);
      continue;
    }
    try {
      const tower = parseTower({ ...toRecord(direct.data()), id: direct.id });
      if (tower.projectId === data.projectId && normalizeKey(tower.name) === towerKey) {
        resolvedTowerIds.set(towerKey, tower.id);
      } else {
        resolvedTowerIds.set(towerKey, null);
      }
    } catch {
      resolvedTowerIds.set(towerKey, null);
    }
  }

  const deterministicUnitIds = new Map<string, string>();
  for (const candidate of validCandidates) {
    const towerId = resolvedTowerIds.get(candidate.towerKey);
    if (!towerId) {
      continue;
    }
    const unitIdKey = `${towerId}\u0000${candidate.unitKey}`;
    if (!deterministicUnitIds.has(unitIdKey)) {
      deterministicUnitIds.set(
        unitIdKey,
        stableImportId('unit', data.projectId, unitIdKey),
      );
    }
  }
  const unitRefSnapshots = await loadRefs(
    Array.from(deterministicUnitIds.values()).map((unitId) => paths.unit(data.projectId, unitId)),
  );

  const writes = new Map<string, Record<string, unknown>>();
  const now = timestampNow();
  const rows = candidates.map((candidate): BuyerImportRow => {
    const base = {
      row: candidate.row,
      tower: candidate.tower,
      unit: candidate.unit,
      name: candidate.name,
      phone: candidate.phoneKey,
    };
    if (candidate.status === 'error') {
      return { ...base, status: 'error', message: candidate.message };
    }

    const towerId = resolvedTowerIds.get(candidate.towerKey);
    if (!towerId) {
      return { ...base, status: 'error', message: 'Tower name conflicts with an existing tower.' };
    }
    const towerPath = paths.tower(data.projectId, towerId);
    if (!towerByKey.has(candidate.towerKey) && !towerRefSnapshots.get(towerPath)?.exists) {
      writes.set(towerPath, {
        id: towerId,
        projectId: data.projectId,
        name: candidate.tower,
        createdAt: now,
      });
    }

    const unitIndexKey = `${towerId}\u0000${candidate.unitKey}`;
    const existingUnit = unitByTowerAndKey.get(unitIndexKey);
    if (existingUnit === null) {
      return { ...base, status: 'error', message: 'Unit name conflicts with an existing unit.' };
    }
    const otherTowerUnits = unitsByKey.get(candidate.unitKey) ?? [];
    if (otherTowerUnits.some((unit) => unit.towerId !== towerId) && !existingUnit) {
      return { ...base, status: 'error', message: 'Unit name already exists in another tower.' };
    }

    let unitId: string;
    if (existingUnit) {
      unitId = existingUnit.id;
    } else {
      unitId = deterministicUnitIds.get(unitIndexKey) ?? '';
      const unitPath = paths.unit(data.projectId, unitId);
      const direct = unitRefSnapshots.get(unitPath);
      if (direct?.exists) {
        try {
          const unit = parseUnit({ ...toRecord(direct.data()), id: direct.id });
          if (
            unit.projectId !== data.projectId ||
            unit.towerId !== towerId ||
            normalizeKey(unit.label) !== candidate.unitKey
          ) {
            return { ...base, status: 'error', message: 'Unit name conflicts with an existing unit.' };
          }
        } catch {
          return { ...base, status: 'error', message: 'Unit name conflicts with an existing unit.' };
        }
      } else {
        writes.set(unitPath, {
          id: unitId,
          projectId: data.projectId,
          towerId,
          label: candidate.unit,
          createdAt: now,
        });
      }
    }

    const contactPath = contactPaths.get(candidate.phoneKey) ?? '';
    const contactSnapshot = contactSnapshots.get(contactPath);
    if (contactSnapshot?.exists) {
      try {
        const contact = parseBuyerContact({
          ...toRecord(contactSnapshot.data()),
          id: contactSnapshot.id,
        });
        if (
          contact.projectId !== data.projectId ||
          contact.name.trim() !== candidate.name.trim() ||
          contact.towerId !== towerId ||
          contact.unitId !== unitId
        ) {
          return {
            ...base,
            status: 'error',
            message: 'Phone number is already imported for different buyer details.',
          };
        }
        return { ...base, status: 'unchanged', message: null };
      } catch {
        return {
          ...base,
          status: 'error',
          message: 'Phone number is already imported with invalid contact data.',
        };
      }
    }

    writes.set(contactPath, {
      id: contactSnapshot?.id ?? stableImportId('contact', data.projectId, candidate.phoneKey),
      projectId: data.projectId,
      towerId,
      unitId,
      name: candidate.name,
      phone: candidate.phoneKey,
      importedByUid: builderUid,
      importedAt: now,
      updatedAt: now,
    });
    return { ...base, status: 'create', message: null };
  });

  const failed = rows.filter((row) => row.status === 'error').length;
  if (!data.dryRun && failed > 0) {
    throw invalidPayload('Fix the highlighted CSV rows before importing.');
  }
  if (writes.size > FIRESTORE_BATCH_LIMIT) {
    throw invalidPayload(`CSV import would exceed ${FIRESTORE_BATCH_LIMIT} writes. Split the file.`);
  }

  if (!data.dryRun && writes.size > 0) {
    const batch = db.batch();
    for (const [path, value] of writes) {
      batch.create(db.doc(path), value);
    }
    await batch.commit();
  }

  return {
    dryRun: data.dryRun,
    rows,
    created: rows.filter((row) => row.status === 'create').length,
    unchanged: rows.filter((row) => row.status === 'unchanged').length,
    failed,
    complete: failed === 0,
  };
}

function parseRequiredDocument<T>(
  snapshot: DocumentSnapshot,
  parser: (value: unknown) => T,
  id: string,
  message: string,
): T {
  if (!snapshot.exists) {
    throw invalidPayload(message);
  }
  try {
    return parser({ ...toRecord(snapshot.data()), id });
  } catch {
    throw invalidPayload(message);
  }
}

export async function updateUnitInfo(
  builderUid: string,
  data: UpdateUnitInfoData,
): Promise<UpdateUnitInfoResult> {
  const input = parseUpdateUnitInfo(data);
  const projectSnapshot = await db.doc(paths.project(input.projectId)).get();
  const unitSnapshot = await db.doc(paths.unit(input.projectId, input.unitId)).get();
  parseRequiredDocument(
    projectSnapshot,
    parseProject,
    input.projectId,
    'Project was not found.',
  );
  const unit = parseRequiredDocument(
    unitSnapshot,
    parseUnit,
    input.unitId,
    'Unit was not found.',
  );
  if (unit.projectId !== input.projectId) {
    throw invalidPayload('Unit was not found.');
  }

  const towerSnapshot = await db.doc(paths.tower(input.projectId, unit.towerId)).get();
  const tower = parseRequiredDocument(
    towerSnapshot,
    parseTower,
    unit.towerId,
    'Unit was not found.',
  );
  if (tower.projectId !== input.projectId) {
    throw invalidPayload('Unit was not found.');
  }

  const [year, month, day] = input.possessionDate.split('-').map(Number);
  const possessionDate = Timestamp.fromMillis(Date.UTC(year, month - 1, day));
  const updatedAt = timestampNow();

  await db.doc(paths.unit(input.projectId, input.unitId)).update({
    configuration: input.configuration,
    constructionProgress: input.constructionProgress,
    possessionDate,
    updatedAt,
    updatedByUid: builderUid,
  });

  return {
    projectId: input.projectId,
    unitId: input.unitId,
    configuration: input.configuration,
    constructionProgress: input.constructionProgress,
    possessionDate: input.possessionDate,
    updatedAt: updatedAt.toDate().toISOString(),
  };
}
