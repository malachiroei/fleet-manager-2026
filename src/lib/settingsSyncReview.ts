import type { ReleaseSnapshotFile } from '@/lib/releaseSnapshot';
import type { ProfilePermissions } from '@/types/fleet';
import { PERMISSION_KEYS, PERMISSION_LABELS, getDefaultPermissions } from '@/lib/permissions';
import type { OrgSettings } from '@/hooks/useOrgSettings';
import type { SystemSettingRow } from '@/lib/systemSettingsUpsert';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';

/** ערכי ברירת מחדל להרשאות (תבנית) — נשמרים ב-system_settings לאחר יישום */
export const SNAPSHOT_PERMISSION_SYSTEM_KEY = 'fleet_sync_default_permissions';
/** דגלי ממשק מתוך סנאפשוט — נשמרים ב-system_settings */
export const SNAPSHOT_UI_FEATURES_SYSTEM_KEY = 'fleet_sync_ui_features';

export const FORM_SYNC_FIELDS = [
  { key: 'org_id_number', label: 'מספר זיהוי ארגון (ח.פ / ע.מ)' },
  { key: 'health_statement_text', label: 'הצהרת בריאות — טקסט (טופס / מסמך)' },
  { key: 'vehicle_policy_text', label: 'מדיניות רכב — טקסט (טופס / מסמך)' },
  { key: 'health_statement_pdf_url', label: 'הצהרת בריאות — קישור PDF' },
  { key: 'vehicle_policy_pdf_url', label: 'מדיניות רכב — קישור PDF' },
] as const;

export type FormSyncFieldKey = (typeof FORM_SYNC_FIELDS)[number]['key'];

export type SyncDiffRow = {
  id: string;
  category: 'forms' | 'permissions' | 'ui';
  label: string;
  status: 'new' | 'changed';
  defaultSelected: boolean;
};

const UI_FEATURE_LABELS: Record<string, string> = {
  boldVersion: 'הדגשת גרסה בכותרת',
  starInHeader: 'כוכב בכותרת',
  dashboardTreatment: 'תצוגת לוח בקרה (טיפול)',
  dashboardTest: 'מצב בדיקה ללוח בקרה',
  maintenanceForm: 'טופס תחזוקה',
};

function valEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** מזהה האם זה גיבוי צי (רכבים / נהגים) ולא סנאפשוט הגדרות */
export function isFleetDataBackupJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  if (Array.isArray(o.vehicles) || Array.isArray(o.drivers) || Array.isArray(o.odometer_logs)) return true;
  return false;
}

/**
 * מפרסר JSON להעלאה — צריך לפחות חלק אחד מתוך הסנאפשוט.
 */
export function parseSystemSettingsUpload(parsed: unknown): {
  snapshot: Partial<ReleaseSnapshotFile>;
  error?: string;
} {
  if (!parsed || typeof parsed !== 'object') {
    return { snapshot: {}, error: 'קובץ JSON לא תקין' };
  }
  if (isFleetDataBackupJson(parsed)) {
    return {
      snapshot: {},
      error: 'קובץ זה נראה כגיבוי צי (רכבים/נהגים). לשחזור מלא השתמש ב״שחזור הג׳ובוי״. להגדרות מערכת השתמש בקובץ release_snapshot או ייצוא מנהל.',
    };
  }

  const o = parsed as Record<string, unknown>;
  const snapshot: Partial<ReleaseSnapshotFile> = {};

  if (typeof o.version === 'string') snapshot.version = o.version;
  if (typeof o.generatedAt === 'string') snapshot.generatedAt = o.generatedAt;
  if (o.uiSettingsTemplate && typeof o.uiSettingsTemplate === 'object') {
    snapshot.uiSettingsTemplate = o.uiSettingsTemplate as ReleaseSnapshotFile['uiSettingsTemplate'];
  }
  if (o.defaultPermissions && typeof o.defaultPermissions === 'object') {
    snapshot.defaultPermissions = o.defaultPermissions as ProfilePermissions;
  }
  if (o.uiFeatures && typeof o.uiFeatures === 'object') {
    snapshot.uiFeatures = o.uiFeatures as ReleaseSnapshotFile['uiFeatures'];
  }

  const hasAny =
    (snapshot.uiSettingsTemplate && Object.keys(snapshot.uiSettingsTemplate).length > 0) ||
    (snapshot.defaultPermissions && Object.keys(snapshot.defaultPermissions).length > 0) ||
    (snapshot.uiFeatures && Object.keys(snapshot.uiFeatures).length > 0);

  if (!hasAny) {
    return {
      snapshot: {},
      error: 'בקובץ אין סעיפי הגדרות מערכת (טפסים, הרשאות או ממשק). ודא שזה קובץ release_snapshot תקין.',
    };
  }

  return { snapshot };
}

export function computeSyncDiffRows(
  current: ReleaseSnapshotFile,
  upload: Partial<ReleaseSnapshotFile>,
): SyncDiffRow[] {
  const rows: SyncDiffRow[] = [];
  const curT = current.uiSettingsTemplate ?? {};
  const upT = upload.uiSettingsTemplate;

  if (upT && typeof upT === 'object') {
    for (const { key, label } of FORM_SYNC_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(upT, key)) continue;
      const c = curT[key as keyof typeof curT];
      const u = upT[key as keyof typeof upT];
      if (valEq(c, u)) continue;
      const emptyCur = c === undefined || c === null || (typeof c === 'string' && !String(c).trim());
      rows.push({
        id: `form:${key}`,
        category: 'forms',
        label,
        status: emptyCur ? 'new' : 'changed',
        defaultSelected: true,
      });
    }
  }

  const upP = upload.defaultPermissions;
  const curP = current.defaultPermissions ?? getDefaultPermissions();
  if (upP && typeof upP === 'object') {
    for (const key of PERMISSION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(upP, key)) continue;
      const c = curP[key];
      const u = upP[key];
      if (valEq(c, u)) continue;
      rows.push({
        id: `perm:${key}`,
        category: 'permissions',
        label: PERMISSION_LABELS[key],
        status: c === undefined ? 'new' : 'changed',
        defaultSelected: true,
      });
    }
  }

  const upF = upload.uiFeatures;
  const curF = current.uiFeatures ?? {};
  if (upF && typeof upF === 'object') {
    for (const key of Object.keys(upF)) {
      if (!Object.prototype.hasOwnProperty.call(upF, key)) continue;
      const c = (curF as Record<string, unknown>)[key];
      const u = (upF as Record<string, unknown>)[key];
      if (valEq(c, u)) continue;
      rows.push({
        id: `ui:${key}`,
        category: 'ui',
        label: UI_FEATURE_LABELS[key] ?? key,
        status: c === undefined ? 'new' : 'changed',
        defaultSelected: true,
      });
    }
  }

  return rows;
}

export function buildApplySystemSettingRows(
  upload: Partial<ReleaseSnapshotFile>,
  selected: Set<string>,
  basePermissions: ProfilePermissions,
  baseUi: ReleaseSnapshotFile['uiFeatures'],
): SystemSettingRow[] {
  const out: SystemSettingRow[] = [];

  const permKeys = PERMISSION_KEYS.filter((k) => selected.has(`perm:${k}`));
  if (permKeys.length && upload.defaultPermissions) {
    const next = { ...basePermissions };
    for (const k of permKeys) {
      const v = upload.defaultPermissions[k];
      if (typeof v === 'boolean') next[k] = v;
    }
    out.push({ key: SNAPSHOT_PERMISSION_SYSTEM_KEY, value: next });
  }

  const uiKeys = [...selected].filter((id) => id.startsWith('ui:')).map((id) => id.slice(3));
  if (uiKeys.length && upload.uiFeatures) {
    const next = { ...baseUi } as Record<string, unknown>;
    const upRec = upload.uiFeatures as Record<string, unknown>;
    for (const k of uiKeys) {
      if (Object.prototype.hasOwnProperty.call(upRec, k)) {
        next[k] = upRec[k];
      }
    }
    out.push({ key: SNAPSHOT_UI_FEATURES_SYSTEM_KEY, value: next });
  }

  return out;
}

/** מיזוג שדות נבחרים לעדכון ui_settings */
export function mergeOrgSettingsFromUpload(
  orgRow: OrgSettings | null,
  orgId: string,
  upload: Partial<ReleaseSnapshotFile>,
  selected: Set<string>,
): Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { org_id: string } {
  const up = upload.uiSettingsTemplate ?? {};
  const base = orgRow ?? ({
    org_id: orgId,
    org_name: '',
    org_id_number: '',
    admin_email: '',
    health_statement_text: '',
    vehicle_policy_text: '',
    health_statement_pdf_url: null,
    vehicle_policy_pdf_url: null,
  } as OrgSettings);

  const patch: Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { org_id: string } = {
    org_id: orgId,
    org_id_number: base.org_id_number,
    health_statement_text: base.health_statement_text,
    vehicle_policy_text: base.vehicle_policy_text,
    health_statement_pdf_url: base.health_statement_pdf_url,
    vehicle_policy_pdf_url: base.vehicle_policy_pdf_url,
  };

  if (selected.has('form:org_id_number') && Object.prototype.hasOwnProperty.call(up, 'org_id_number')) {
    patch.org_id_number = String((up as Record<string, unknown>).org_id_number ?? '');
  }
  if (selected.has('form:health_statement_text') && Object.prototype.hasOwnProperty.call(up, 'health_statement_text')) {
    patch.health_statement_text = String((up as Record<string, unknown>).health_statement_text ?? '');
  }
  if (selected.has('form:vehicle_policy_text') && Object.prototype.hasOwnProperty.call(up, 'vehicle_policy_text')) {
    patch.vehicle_policy_text = String((up as Record<string, unknown>).vehicle_policy_text ?? '');
  }
  if (selected.has('form:health_statement_pdf_url') && Object.prototype.hasOwnProperty.call(up, 'health_statement_pdf_url')) {
    const v = (up as Record<string, unknown>).health_statement_pdf_url;
    patch.health_statement_pdf_url = v == null || v === '' ? null : String(v);
  }
  if (selected.has('form:vehicle_policy_pdf_url') && Object.prototype.hasOwnProperty.call(up, 'vehicle_policy_pdf_url')) {
    const v = (up as Record<string, unknown>).vehicle_policy_pdf_url;
    patch.vehicle_policy_pdf_url = v == null || v === '' ? null : String(v);
  }

  return patch;
}

/** קריאת ערכים שמורים ב-system_settings עבור השוואה ויישום מצטבר */
export async function fetchSyncBaselines(supabase: any): Promise<{
  permissions: ProfilePermissions;
  uiFeatures: ReleaseSnapshotFile['uiFeatures'];
}> {
  let permissions = getDefaultPermissions();
  let uiFeatures: ReleaseSnapshotFile['uiFeatures'] = {};

  try {
    const { data: p } = await (supabase as any)
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', SNAPSHOT_PERMISSION_SYSTEM_KEY)
      .maybeSingle();
    if (p?.value && typeof p.value === 'object') {
      permissions = { ...permissions, ...(p.value as ProfilePermissions) };
    }
    const { data: u } = await (supabase as any)
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', SNAPSHOT_UI_FEATURES_SYSTEM_KEY)
      .maybeSingle();
    if (u?.value && typeof u.value === 'object') {
      uiFeatures = { ...(u.value as ReleaseSnapshotFile['uiFeatures']) };
    }
  } catch {
    /* best-effort */
  }

  return { permissions, uiFeatures };
}
