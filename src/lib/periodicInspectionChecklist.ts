/** סימון לשורה בביקורת תקופתית — תקין | לא תקין | טופל */
export type PeriodicInspectionMark = 'ok' | 'fault' | 'handled';

export interface PeriodicInspectionRow {
  id: string;
  label: string;
  /** ברירת מחדל true. false — השורה נשמרת בתבנית אך לא מוצגת בטופס המילוי ואינה חובת סימון */
  includedInForm?: boolean;
}

/** ברירת מחדל: מוצג בטופס */
export function isRowIncludedInForm(row: PeriodicInspectionRow): boolean {
  return row.includedInForm !== false;
}

export function itemsIncludedInForm(items: PeriodicInspectionRow[]): PeriodicInspectionRow[] {
  return items.filter(isRowIncludedInForm);
}

/** לשמירת JSON ב־DB */
export function serializePeriodicRowsForStorage(rows: PeriodicInspectionRow[]): unknown[] {
  return rows.map((r) => ({
    id: r.id,
    label: String(r.label ?? '').trim() || '—',
    included_in_form: r.includedInForm !== false,
  }));
}

export interface PeriodicInspectionJson {
  items: PeriodicInspectionRow[];
  /** תוצאת הביקורת האחרונה שנשמרה במערכת */
  last?: {
    date: string;
    km: number | null;
    inspector_name: string | null;
    inspector_signature_url?: string | null;
    marks: Record<string, PeriodicInspectionMark>;
  };
}

const DEFAULT_LABELS_HE: string[] = [
  'מרכב כללי',
  'צמיגים+רזרבי',
  'תקינות מראות',
  'בדיקת כלי נהג',
  'רישיון + ביטוח',
  'חגורות בטיחות',
  'צופר',
  'מגבים',
  'אורות + כיוון',
  'מים / שמן',
  'מערכות הגה',
  'בלמים',
  'מדבקת נוהל 6',
];

function newRowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function newPeriodicRow(label = 'שורה חדשה'): PeriodicInspectionRow {
  return { id: newRowId(), label, includedInForm: true };
}

/** יוצר רשימת ברירת מחדל עם מזהים יציבים חד-פעמיים */
export function defaultPeriodicInspectionRows(): PeriodicInspectionRow[] {
  return DEFAULT_LABELS_HE.map((label) => ({ id: newRowId(), label }));
}

/** טוען מתוך DB או ברירת מחדל */
export function rowsFromVehicleJson(raw: unknown): PeriodicInspectionRow[] {
  const parsed = parsePeriodicInspectionJson(raw);
  if (parsed?.items?.length) {
    return parsed.items.filter((r) => r.id && String(r.label ?? '').trim());
  }
  return defaultPeriodicInspectionRows();
}

export function parsePeriodicInspectionJson(raw: unknown): PeriodicInspectionJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemsIn = o.items;
  if (!Array.isArray(itemsIn)) return null;
  const items: PeriodicInspectionRow[] = [];
  for (const el of itemsIn) {
    if (!el || typeof el !== 'object') continue;
    const row = el as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!id || !label) continue;
    const includedRaw = row.included_in_form;
    const includedInForm =
      includedRaw === false ? false : row.includedInForm === false ? false : true;
    items.push({ id, label, ...(includedInForm ? {} : { includedInForm: false as const }) });
  }
  const lastRaw = o.last;
  let last: PeriodicInspectionJson['last'];
  if (lastRaw && typeof lastRaw === 'object') {
    const L = lastRaw as Record<string, unknown>;
    const date = typeof L.date === 'string' ? L.date.slice(0, 10) : '';
    const marksIn = L.marks;
    const marks: Record<string, PeriodicInspectionMark> = {};
    if (marksIn && typeof marksIn === 'object') {
      for (const [k, v] of Object.entries(marksIn as Record<string, unknown>)) {
        if (v === 'ok' || v === 'fault' || v === 'handled') marks[k] = v;
      }
    }
    last = {
      date: date || '',
      km: typeof L.km === 'number' && Number.isFinite(L.km) ? L.km : null,
      inspector_name:
        typeof L.inspector_name === 'string' && L.inspector_name.trim()
          ? L.inspector_name.trim()
          : null,
      inspector_signature_url:
        typeof L.inspector_signature_url === 'string' && L.inspector_signature_url.trim()
          ? L.inspector_signature_url.trim()
          : null,
      marks,
    };
  }

  return { items, ...(last?.date ? { last } : {}) };
}

/** כל השורות חייבות להיות מסומנות לפני שמירת ביקורת */
export function countMissingMarks(
  items: PeriodicInspectionRow[],
  marks: Record<string, PeriodicInspectionMark | undefined>,
): number {
  let n = 0;
  for (const r of items) {
    if (!isRowIncludedInForm(r)) continue;
    const m = marks[r.id];
    if (m !== 'ok' && m !== 'fault' && m !== 'handled') n++;
  }
  return n;
}

export function summarizeMarks(
  marks: Record<string, PeriodicInspectionMark>,
): { ok: number; fault: number; handled: number } {
  let ok = 0;
  let fault = 0;
  let handled = 0;
  for (const v of Object.values(marks)) {
    if (v === 'ok') ok++;
    else if (v === 'fault') fault++;
    else if (v === 'handled') handled++;
  }
  return { ok, fault, handled };
}
