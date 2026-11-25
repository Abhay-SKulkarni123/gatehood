import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import type {
  TowerDoc,
  UnitDoc,
  UnitImportData,
  UnitImportResult,
  UnitImportRow,
} from '../domain/types';
import { FIRESTORE_BATCH_LIMIT } from '../config';
import { invalidPayload } from '../errors';
import { db, timestampNow } from '../firestore';
import { paths } from '../paths';
import { isValidId, parseTower, parseUnit, toRecord } from '../validation';

interface CsvRow {
  line: number;
  values: string[];
}

interface UnitCandidate {
  row: number;
  towerId: string;
  unitId: string;
  label: string;
  status: 'create' | 'unchanged' | 'error';
  message: string | null;
}

const HEADER_ALIASES = new Map<string, string>([
  ['towerid', 'towerId'],
  ['tower', 'towerId'],
  ['unitid', 'unitId'],
  ['unit', 'unitId'],
  ['label', 'label'],
  ['unitlabel', 'label'],
  ['name', 'label'],
]);

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

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerIndexes(header: string[]): Record<string, number> {
  const indexes: Record<string, number> = {};
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    const key = HEADER_ALIASES.get(normalized);
    if (!key || key in indexes) {
      throw invalidPayload('CSV header must include towerId, unitId, and label.');
    }
    indexes[key] = index;
  });

  if (
    indexes.towerId === undefined ||
    indexes.unitId === undefined ||
    indexes.label === undefined
  ) {
    throw invalidPayload('CSV header must include towerId, unitId, and label.');
  }
  return indexes;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadSnapshots(refs: readonly DocumentReference[]): Promise<DocumentSnapshot[]> {
  const snapshots: DocumentSnapshot[] = [];
  for (const chunk of chunks(refs, 100)) {
    snapshots.push(...(await db.getAll(...chunk)));
  }
  return snapshots;
}

function errorRow(
  line: number,
  towerId: string,
  unitId: string,
  label: string,
  message: string,
): UnitCandidate {
  return { row: line, towerId, unitId, label, status: 'error', message };
}

function candidatesFromCsv(csv: string): UnitCandidate[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    throw invalidPayload('CSV import must include a header and at least one unit row.');
  }

  const indexes = headerIndexes(rows[0].values);
  const candidates = rows.slice(1).map((row) => {
    if (row.values.length !== rows[0].values.length) {
      return errorRow(row.line, '', '', '', 'Row has the wrong number of columns.');
    }

    const towerId = row.values[indexes.towerId] ?? '';
    const unitId = row.values[indexes.unitId] ?? '';
    const label = row.values[indexes.label] ?? '';

    if (!isValidId(towerId)) {
      return errorRow(row.line, towerId, unitId, label, 'Tower ID is invalid.');
    }
    if (!isValidId(unitId)) {
      return errorRow(row.line, towerId, unitId, label, 'Unit ID is invalid.');
    }
    if (!label || label.length > 120) {
      return errorRow(row.line, towerId, unitId, label, 'Unit label must be 1 to 120 characters.');
    }

    return { row: row.line, towerId, unitId, label, status: 'create' as const, message: null };
  });

  if (candidates.length === 0) {
    throw invalidPayload('CSV import must include at least one unit row.');
  }
  if (candidates.length > FIRESTORE_BATCH_LIMIT) {
    throw invalidPayload(`CSV import supports at most ${FIRESTORE_BATCH_LIMIT} rows.`);
  }
  return candidates;
}

export async function importUnits(
  projectId: string,
  data: UnitImportData,
): Promise<UnitImportResult> {
  const candidates = candidatesFromCsv(data.csv);
  const validCandidates = candidates.filter((candidate) => candidate.status !== 'error');

  const towerRefs = Array.from(
    new Map(validCandidates.map((candidate) => [candidate.towerId, candidate.towerId])).values(),
  ).map((towerId) => db.doc(paths.tower(projectId, towerId)));
  const towerSnapshots = await loadSnapshots(towerRefs);
  const validTowerIds = new Set<string>();

  for (const snapshot of towerSnapshots) {
    if (!snapshot.exists) {
      continue;
    }
    try {
      const tower = parseTower({ ...toRecord(snapshot.data()), id: snapshot.id });
      if (tower.projectId === projectId) {
        validTowerIds.add(tower.id);
      }
    } catch {
      continue;
    }
  }

  const unitRefs = Array.from(
    new Map(validCandidates.map((candidate) => [candidate.unitId, candidate.unitId])).values(),
  ).map((unitId) => db.doc(paths.unit(projectId, unitId)));
  const unitSnapshots = await loadSnapshots(unitRefs);
  const existingUnits = new Map<string, UnitDoc>();

  for (const snapshot of unitSnapshots) {
    if (!snapshot.exists) {
      continue;
    }
    try {
      const unit = parseUnit({ ...toRecord(snapshot.data()), id: snapshot.id });
      if (unit.projectId === projectId) {
        existingUnits.set(unit.id, unit);
      }
    } catch {
      continue;
    }
  }

  const seenUnitIds = new Set<string>();
  const rows = candidates.map((candidate): UnitImportRow => {
    if (candidate.status === 'error') {
      return candidate;
    }
    if (seenUnitIds.has(candidate.unitId)) {
      return errorRow(candidate.row, candidate.towerId, candidate.unitId, candidate.label, 'Unit ID is duplicated in this CSV.');
    }
    seenUnitIds.add(candidate.unitId);

    if (!validTowerIds.has(candidate.towerId)) {
      return errorRow(candidate.row, candidate.towerId, candidate.unitId, candidate.label, 'Tower was not found in this project.');
    }

    const existing = existingUnits.get(candidate.unitId);
    if (!existing) {
      return candidate;
    }
    if (existing.towerId !== candidate.towerId || existing.label !== candidate.label) {
      return errorRow(candidate.row, candidate.towerId, candidate.unitId, candidate.label, 'Unit ID already exists with different details.');
    }
    return { ...candidate, status: 'unchanged' as const };
  });

  const failed = rows.filter((row) => row.status === 'error').length;
  if (!data.dryRun && failed > 0) {
    throw invalidPayload('Fix the highlighted CSV rows before importing.');
  }

  const writes = rows.filter((row) => row.status === 'create');
  if (!data.dryRun && writes.length > 0) {
    const now = timestampNow();
    const batch = db.batch();
    for (const row of writes) {
      batch.set(db.doc(paths.unit(projectId, row.unitId)), {
        id: row.unitId,
        projectId,
        towerId: row.towerId,
        label: row.label,
        createdAt: now,
      });
    }
    await batch.commit();
  }

  return {
    dryRun: data.dryRun,
    rows,
    created: writes.length,
    unchanged: rows.filter((row) => row.status === 'unchanged').length,
    failed,
    complete: failed === 0,
  };
}
