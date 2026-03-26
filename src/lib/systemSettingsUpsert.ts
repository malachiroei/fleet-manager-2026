/**
 * Upsert ל־system_settings עם אימות קריאה־חוזרת (מניעת "הצלחה במודאל" בלי עדכון בפועל).
 */
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import { SYSTEM_SETTINGS_VERSION_MANIFEST_KEY, normalizeVersion } from '@/lib/versionManifest';

export type SystemSettingRow = { key: string; value: unknown };

function jsonbValueToString(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  return String(val ?? '').trim();
}

/**
 * Upsert מרובה שורות; זורק אם Supabase מחזיר שגיאה או אין אישור לשורות.
 */
export async function upsertSystemSettingsRows(supabase: any, rows: SystemSettingRow[]): Promise<void> {
  if (!rows.length) throw new Error('upsertSystemSettingsRows: empty rows');
  const { error } = await supabase.from(FLEET_KV_TABLE).upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}

/**
 * מאמת ש־version_manifest.version ו־app_version תואמים לגרסה שפורסמה, וש־publishedAt במניפסט עדכני.
 */
export async function verifyPublishWrittenToSupabase(
  supabase: any,
  expectedVersion: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const exp = normalizeVersion(String(expectedVersion ?? '').trim());
  if (!exp) return { ok: false, message: 'verify: expectedVersion empty' };

  const { data: mData, error: mErr } = await supabase
    .from(FLEET_KV_TABLE)
    .select('value')
    .eq('key', SYSTEM_SETTINGS_VERSION_MANIFEST_KEY)
    .maybeSingle();
  if (mErr) return { ok: false, message: `verify: version_manifest read — ${mErr.message}` };
  const mVal = mData?.value;
  if (!mVal || typeof mVal !== 'object') {
    return { ok: false, message: 'verify: version_manifest missing or not object' };
  }
  const obj = mVal as Record<string, unknown>;
  const mv = typeof obj.version === 'string' ? normalizeVersion(obj.version.trim()) : '';
  if (mv !== normalizeVersion(exp)) {
    return { ok: false, message: `verify: version_manifest.version mismatch (got ${mv}, expected ${exp})` };
  }
  const pubAt = typeof obj.publishedAt === 'string' ? obj.publishedAt.trim() : '';
  if (!pubAt) {
    return { ok: false, message: 'verify: version_manifest.publishedAt missing' };
  }
  const tGot = Date.parse(pubAt);
  if (Number.isNaN(tGot)) {
    return { ok: false, message: 'verify: publishedAt not a valid ISO date' };
  }
  const skewMs = Math.abs(Date.now() - tGot);
  if (skewMs > 20 * 60 * 1000) {
    return { ok: false, message: 'verify: publishedAt not within expected window' };
  }

  const { data: aData, error: aErr } = await supabase
    .from(FLEET_KV_TABLE)
    .select('value')
    .eq('key', 'app_version')
    .maybeSingle();
  if (aErr) return { ok: false, message: `verify: app_version read — ${aErr.message}` };
  const av = jsonbValueToString(aData?.value);
  if (normalizeVersion(av) !== normalizeVersion(exp)) {
    return { ok: false, message: `verify: app_version mismatch (got ${av}, expected ${exp})` };
  }

  return { ok: true };
}

/**
 * אימות פרסום שמעדכן רק `app_version` (ללא שינוי version_manifest).
 */
export async function verifyAppVersionInSupabase(
  supabase: any,
  expectedVersion: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const exp = normalizeVersion(String(expectedVersion ?? '').trim());
  if (!exp) return { ok: false, message: 'verify: expectedVersion empty' };

  const { data: aData, error: aErr } = await supabase
    .from(FLEET_KV_TABLE)
    .select('value')
    .eq('key', 'app_version')
    .maybeSingle();
  if (aErr) return { ok: false, message: `verify: app_version read — ${aErr.message}` };
  const av = jsonbValueToString(aData?.value);
  if (normalizeVersion(av) !== normalizeVersion(exp)) {
    return { ok: false, message: `verify: app_version mismatch (got ${av}, expected ${exp})` };
  }

  return { ok: true };
}
