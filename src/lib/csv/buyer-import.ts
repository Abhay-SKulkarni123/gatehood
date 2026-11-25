import type { BuyerImportRow } from '@/types/domain';

export type BuyerCsvValidation = {
  rows: BuyerImportRow[];
  errors: string[];
  valid: boolean;
};

type HeaderKey = 'tower' | 'unit' | 'name' | 'phone';

const HEADER_ALIASES = new Map<string, HeaderKey>([
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

const REQUIRED_HEADERS: HeaderKey[] = ['tower', 'unit', 'name', 'phone'];

interface CsvRow {
  line: number;
  values: string[];
}

export function normalizeBuyerPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

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
    return [];
  }

  commitRow();
  return rows;
}

function headerIndexes(header: string[]): Record<string, number> | null {
  const indexes: Record<string, number> = {};
  for (const [index, value] of header.entries()) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = HEADER_ALIASES.get(normalized);
    if (!key || key in indexes) {
      return null;
    }
    indexes[key] = index;
  }
  return REQUIRED_HEADERS.every((key) => indexes[key] !== undefined) ? indexes : null;
}

export function validateBuyerCsv(csv: string): BuyerCsvValidation {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return { rows: [], errors: ['CSV must include a header and at least one buyer row.'], valid: false };
  }

  const indexes = headerIndexes(rows[0].values);
  if (!indexes) {
    return {
      rows: [],
      errors: ['CSV header must include Tower, Unit, Name, and Phone.'],
      valid: false,
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { rows: [], errors: ['CSV must include at least one buyer row.'], valid: false };
  }
  if (dataRows.length > 200) {
    return { rows: [], errors: ['CSV import supports at most 200 buyer rows.'], valid: false };
  }

  const draft = dataRows.map((row): BuyerImportRow => {
    const tower = row.values[indexes.tower] ?? '';
    const unit = row.values[indexes.unit] ?? '';
    const name = row.values[indexes.name] ?? '';
    const phone = normalizeBuyerPhone(row.values[indexes.phone] ?? '');
    const base = { row: row.line, tower, unit, name, phone, status: 'create' as const, message: null };

    if (row.values.length !== rows[0].values.length) {
      return { ...base, status: 'error', message: 'Row has the wrong number of columns.' };
    }
    if (!tower || tower.length > 120) {
      return { ...base, status: 'error', message: 'Tower must be 1 to 120 characters.' };
    }
    if (!unit || unit.length > 120) {
      return { ...base, status: 'error', message: 'Unit must be 1 to 120 characters.' };
    }
    if (!name || name.length > 120) {
      return { ...base, status: 'error', message: 'Name must be 1 to 120 characters.' };
    }
    if (!/^\+?[0-9]{7,15}$/.test(phone)) {
      return {
        ...base,
        status: 'error',
        message: 'Phone must contain 7 to 15 digits and may include only a leading country code.',
      };
    }
    return base;
  });

  const towerUnitKeys = new Set<string>();
  const phoneKeys = new Set<string>();
  const finalRows = draft.map((row) => {
    if (row.status === 'error') {
      return row;
    }
    const towerUnitKey = `${normalizeKey(row.tower)}\u0000${normalizeKey(row.unit)}`;
    if (towerUnitKeys.has(towerUnitKey)) {
      return { ...row, status: 'error' as const, message: 'Tower and unit combination is duplicated.' };
    }
    towerUnitKeys.add(towerUnitKey);
    if (phoneKeys.has(row.phone)) {
      return { ...row, status: 'error' as const, message: 'Phone number is duplicated.' };
    }
    phoneKeys.add(row.phone);
    return row;
  });

  const errors = finalRows
    .filter((row) => row.status === 'error')
    .map((row) => `Row ${row.row}: ${row.message ?? 'Invalid row.'}`);
  return { rows: finalRows, errors, valid: errors.length === 0 };
}
