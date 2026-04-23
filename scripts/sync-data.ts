/**
 * סנכרון נתונים: Staging → Production (Service Role).
 *
 * כולל: organizations (כל השורות), profiles (לפי אימייל), user_roles, org_members, drivers, vehicles,
 * תחזוקה, driver_documents, ui_customization, ui_settings (לכל הארגונים), organization_settings,
 * system_settings (מניפסט / כפתורים גלובליים), org_documents, feature_flags,
 * user_feature_overrides, vehicle_handovers, driver_vehicle_assignments — והעתקת קבצי Storage.
 *
 * משתני סביבה (חובה):
 *   NEXT_PUBLIC_SUPABASE_URL_STAGING / NEXT_PUBLIC_SUPABASE_URL_PROD
 *   NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY_STAGING או SUPABASE_SERVICE_ROLE_KEY_STAGING
 *   NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY_PROD או SUPABASE_SERVICE_ROLE_KEY_PROD
 *
 * אופציונלי:
 *   SYNC_TARGET_ORG_ID — org_id בפרו (נהגים/רכבים/פרופילים וכו')
 *   SYNC_SOURCE_ORG_ID — org בסטייג'ינג (אם לא מוגדר — נלקח ה-org הנפוץ בפרופילים)
 *   SYNC_MAINTENANCE_TABLE — maintenance_tasks | maintenance_logs
 *   SYNC_STORAGE_BUCKETS — רשימה מופרדת בפסיקים (ברירת מחדל: vehicle-documents,mileage-reports,handover-photos)
 *   SYNC_SKIP_STORAGE=1 — לדלג על Storage
 *   SYNC_STORAGE_MAX_FILES — מקסימום קבצים לכל bucket (ברירת מחדל ללא הגבלה)
 *
 * טוען .env, .env.local, env.local מהשורש.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

config({ path: resolve(ROOT, '.env') });
config({ path: resolve(ROOT, '.env.local'), override: true });
config({ path: resolve(ROOT, 'env.local'), override: true });

function pickEnv(keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function requireEnv(keys: string[], label: string): string {
  const v = pickEnv(keys);
  if (!v) {
    console.error(`חסר משתנה סביבה: ${label}. נסה אחד מ: ${keys.join(', ')}`);
    process.exit(1);
  }
  return v;
}

const STAGING_URL = requireEnv(['NEXT_PUBLIC_SUPABASE_URL_STAGING'], 'Staging Supabase URL');
const PROD_URL = requireEnv(['NEXT_PUBLIC_SUPABASE_URL_PROD'], 'Production Supabase URL');
const STAGING_SERVICE_KEY = requireEnv(
  ['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY_STAGING', 'SUPABASE_SERVICE_ROLE_KEY_STAGING'],
  'Staging service role key',
);
const PROD_SERVICE_KEY = requireEnv(
  ['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY_PROD', 'SUPABASE_SERVICE_ROLE_KEY_PROD'],
  'Production service role key',
);

const STAGING_HOST = new URL(STAGING_URL).hostname.toLowerCase();
const PROD_HOST = new URL(PROD_URL).hostname.toLowerCase();

const SYNC_TARGET_ORG_ID = pickEnv(['SYNC_TARGET_ORG_ID']).trim() || null;
const SYNC_SOURCE_ORG_ID_ENV = pickEnv(['SYNC_SOURCE_ORG_ID']).trim() || null;
const SYNC_SKIP_STORAGE = pickEnv(['SYNC_SKIP_STORAGE']) === '1';
const SYNC_STORAGE_MAX = Number(pickEnv(['SYNC_STORAGE_MAX_FILES']) || '0') || 0;
const DEFAULT_BUCKETS = 'vehicle-documents,mileage-reports,handover-photos';
const SYNC_STORAGE_BUCKETS = (pickEnv(['SYNC_STORAGE_BUCKETS']) || DEFAULT_BUCKETS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 150;

function normalizePlate(p: unknown): string {
  return String(p ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeIdNumber(n: unknown): string {
  return String(n ?? '').replace(/\s+/g, '');
}

function normEmail(e: unknown): string {
  return String(e ?? '')
    .trim()
    .toLowerCase();
}

function rewriteStorageUrlsInValue(v: unknown): unknown {
  if (typeof v === 'string' && v.includes(STAGING_HOST)) {
    return v.split(STAGING_HOST).join(PROD_HOST);
  }
  return v;
}

function rewriteUrlsRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string') {
      out[k] = rewriteStorageUrlsInValue(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** החלפת hostname סטייג׳ינג→פרו בכל מחרוזת (jsonb / מניפסט / הגדרות). */
function rewriteDeepUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    return rewriteStorageUrlsInValue(value);
  }
  if (Array.isArray(value)) {
    return value.map(rewriteDeepUrls);
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = rewriteDeepUrls(v);
    }
    return out;
  }
  return value;
}

function rewriteRowDeepHosts(row: Record<string, unknown>): Record<string, unknown> {
  return rewriteDeepUrls(row) as Record<string, unknown>;
}

async function fetchAllRows(client: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`[${table}] select: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function upsertChunks(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  [${table}] אין שורות לייבוא`);
    return;
  }
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await client.from(table).upsert(chunk, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`[${table}] upsert: ${error.message}`);
    console.log(`  [${table}] upsert ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
  }
}

async function tableExists(client: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await client.from(table).select('*').limit(1);
  if (!error) return true;
  const msg = error.message ?? '';
  if (/relation|does not exist|schema cache|404/i.test(msg)) return false;
  if (/permission denied|42501/i.test(msg)) {
    console.warn(`  [${table}] אין הרשאת SELECT — מניחים שהטבלה קיימת או מדלגים`);
    return false;
  }
  throw new Error(`[${table}] probe: ${error.message}`);
}

async function resolveMaintenanceTable(staging: SupabaseClient): Promise<string> {
  const envName = pickEnv(['SYNC_MAINTENANCE_TABLE']).trim();
  const candidates = envName ? [envName] : ['maintenance_tasks', 'maintenance_logs'];
  const prod = createClient(PROD_URL, PROD_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const t of candidates) {
    if (await tableExists(staging, t)) {
      if (!(await tableExists(prod, t))) {
        console.warn(`  אזהרה: ${t} קיים בסטייג'ינג אבל לא בפרו — דילוג`);
        continue;
      }
      return t;
    }
  }
  throw new Error('לא נמצאה טבלת תחזוקה (נסה SYNC_MAINTENANCE_TABLE)');
}

function applyTargetOrg(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!SYNC_TARGET_ORG_ID) return rows;
  return rows.map((r) => ({ ...r, org_id: SYNC_TARGET_ORG_ID }));
}

function inferSourceOrgId(stagingProfiles: Record<string, unknown>[]): string | null {
  if (SYNC_SOURCE_ORG_ID_ENV) return SYNC_SOURCE_ORG_ID_ENV;
  const counts = new Map<string, number>();
  for (const p of stagingProfiles) {
    const oid = String(p.org_id ?? '').trim();
    if (!oid) continue;
    counts.set(oid, (counts.get(oid) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [oid, c] of counts) {
    if (c > n) {
      n = c;
      best = oid;
    }
  }
  return best;
}

/** כל שורות organizations (שמות, custom_labels, settings) — תואם פרו/טסט עם אותם UUID ארגון. */
async function syncAllOrganizations(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (!(await tableExists(staging, 'organizations')) || !(await tableExists(prod, 'organizations'))) {
    console.log('\n[organizations] דילוג — הטבלה לא קיימת');
    return;
  }
  const rows = await fetchAllRows(staging, 'organizations');
  const mapped = rows.map((r) => rewriteRowDeepHosts({ ...r }));
  await upsertChunks(prod, 'organizations', mapped, 'id');
  console.log(`\n[organizations] upsert מלא ${mapped.length} ארגונים (כולל תוויות/הגדרות כפתורים)`);
}

async function syncSystemSettings(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (!(await tableExists(staging, 'system_settings')) || !(await tableExists(prod, 'system_settings'))) {
    console.log('\n[system_settings] דילוג — הטבלה לא קיימת');
    return;
  }
  const rows = await fetchAllRows(staging, 'system_settings');
  const mapped = rows.map((r) => ({
    key: r.key,
    value: rewriteDeepUrls(r.value),
    updated_at: r.updated_at ?? new Date().toISOString(),
  })) as Record<string, unknown>[];
  await upsertChunks(prod, 'system_settings', mapped, 'key');
  console.log(`\n[system_settings] upsert ${mapped.length} מפתחות (version_manifest, מיילים, וכו׳)`);
}

/** ui_settings לכל org_id (לא רק ארגון «הנפוף») — onConflict על org_id. */
async function syncUiSettingsAllOrgs(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (!(await tableExists(staging, 'ui_settings')) || !(await tableExists(prod, 'ui_settings'))) {
    console.log('\n[ui_settings] דילוג — הטבלה לא קיימת');
    return;
  }
  const rows = await fetchAllRows(staging, 'ui_settings');
  const mapped = rows.map((r) => rewriteRowDeepHosts({ ...r }));
  for (let i = 0; i < mapped.length; i += UPSERT_CHUNK) {
    const chunk = mapped.slice(i, i + UPSERT_CHUNK);
    const { error } = await prod.from('ui_settings').upsert(chunk, { onConflict: 'org_id' });
    if (error) throw new Error(`[ui_settings] upsert: ${error.message}`);
    console.log(`  [ui_settings] upsert ${Math.min(i + chunk.length, mapped.length)}/${mapped.length}`);
  }
  console.log(`\n[ui_settings] סה״כ ${mapped.length} שורות (כל הארגונים)`);
}

async function syncOrganizationSettingsAll(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (
    !(await tableExists(staging, 'organization_settings')) ||
    !(await tableExists(prod, 'organization_settings'))
  ) {
    console.log('\n[organization_settings] דילוג — הטבלה לא קיימת');
    return;
  }
  const rows = await fetchAllRows(staging, 'organization_settings');
  const mapped = rows.map((r) => rewriteRowDeepHosts({ ...r }));
  await upsertChunks(prod, 'organization_settings', mapped, 'id');
  console.log(`\n[organization_settings] upsert ${mapped.length} שורות`);
}

async function syncOrgDocumentsAll(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (!(await tableExists(staging, 'org_documents')) || !(await tableExists(prod, 'org_documents'))) {
    console.log('\n[org_documents] דילוג — הטבלה לא קיימת');
    return;
  }
  const rows = await fetchAllRows(staging, 'org_documents');
  const mapped = rows.map((r) => rewriteRowDeepHosts({ ...r }));
  await upsertChunks(prod, 'org_documents', mapped, 'id');
  console.log(`\n[org_documents] upsert מלא ${mapped.length} שורות`);
}

async function buildEmailToProdProfileId(prod: SupabaseClient): Promise<Map<string, string>> {
  const profiles = await fetchAllRows(prod, 'profiles');
  const m = new Map<string, string>();
  for (const p of profiles) {
    const em = normEmail(p.email);
    const id = String(p.id ?? '').trim();
    if (em && id) m.set(em, id);
  }
  return m;
}

async function buildStagingProfileIdToEmail(staging: SupabaseClient): Promise<Map<string, string>> {
  const profiles = await fetchAllRows(staging, 'profiles');
  const m = new Map<string, string>();
  for (const p of profiles) {
    const em = normEmail(p.email);
    const id = String(p.id ?? '').trim();
    if (em && id) m.set(id, em);
  }
  return m;
}

async function syncProfilesFromStaging(
  staging: SupabaseClient,
  prod: SupabaseClient,
  emailToProdId: Map<string, string>,
  stagingProfileIdToProdProfileId: Map<string, string>,
): Promise<void> {
  console.log('\n[profiles] מיזוג שדות לפי אימייל (רק משתמשים שכבר קיימים בפרו)');
  const stagingProfiles = await fetchAllRows(staging, 'profiles');
  let updated = 0;
  let skipped = 0;

  for (const sp of stagingProfiles) {
    const em = normEmail(sp.email);
    if (!em) {
      skipped++;
      continue;
    }
    const prodId = emailToProdId.get(em);
    if (!prodId) {
      skipped++;
      continue;
    }

    const orgId =
      SYNC_TARGET_ORG_ID ??
      (sp.org_id ? String(sp.org_id) : null);

    const managedRaw = sp.managed_by_user_id ? String(sp.managed_by_user_id) : null;
    const parentRaw = sp.parent_admin_id ? String(sp.parent_admin_id) : null;
    const managedByProd = managedRaw ? stagingProfileIdToProdProfileId.get(managedRaw) ?? null : null;
    const parentProd = parentRaw ? stagingProfileIdToProdProfileId.get(parentRaw) ?? null : null;

    const patch: Record<string, unknown> = {
      full_name: sp.full_name,
      phone: sp.phone ?? null,
      org_id: orgId,
      permissions: sp.permissions ?? null,
      status: sp.status ?? 'active',
      is_system_admin: sp.is_system_admin ?? null,
      managed_by_user_id: managedByProd,
      parent_admin_id: parentProd,
      allowed_features: sp.allowed_features ?? null,
      denied_features: sp.denied_features ?? null,
      ui_denied_features_anchor_version: sp.ui_denied_features_anchor_version ?? null,
      current_app_version: sp.current_app_version ?? null,
      target_version: sp.target_version ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await prod.from('profiles').update(patch).eq('id', prodId);
    if (error) {
      console.warn(`  אזהרה: עדכון פרופיל ${em} נכשל: ${error.message}`);
      continue;
    }
    updated++;
  }
  console.log(`  עודכנו ${updated} פרופילים, דולגו ${skipped} (ללא התאמת אימייל בפרו)`);
}

async function buildStagingToProdUserId(
  staging: SupabaseClient,
  emailToProdId: Map<string, string>,
): Promise<Map<string, string>> {
  const stagingProfiles = await fetchAllRows(staging, 'profiles');
  const m = new Map<string, string>();
  for (const p of stagingProfiles) {
    const em = normEmail(p.email);
    const sid = String(p.id ?? '').trim();
    if (!em || !sid) continue;
    const pid = emailToProdId.get(em);
    if (pid) m.set(sid, pid);
  }
  return m;
}

async function syncUserRoles(
  staging: SupabaseClient,
  prod: SupabaseClient,
  stagingToProdUser: Map<string, string>,
): Promise<void> {
  if (!(await tableExists(staging, 'user_roles')) || !(await tableExists(prod, 'user_roles'))) {
    console.log('\n[user_roles] דילוג');
    return;
  }
  console.log('\n[user_roles]');
  const stagingRoles = await fetchAllRows(staging, 'user_roles');
  const prodUserIds = new Set(stagingToProdUser.values());

  for (const uid of prodUserIds) {
    const { error } = await prod.from('user_roles').delete().eq('user_id', uid);
    if (error) throw new Error(`[user_roles] delete: ${error.message}`);
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const row of stagingRoles) {
    const sid = String(row.user_id ?? '');
    const pid = stagingToProdUser.get(sid);
    if (!pid) continue;
    toInsert.push({ user_id: pid, role: row.role });
  }

  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
    const { error } = await prod.from('user_roles').insert(chunk);
    if (error) throw new Error(`[user_roles] insert: ${error.message}`);
    console.log(`  הוכנסו תפקידים ${Math.min(i + chunk.length, toInsert.length)}/${toInsert.length}`);
  }
}

async function syncOrgMembers(
  staging: SupabaseClient,
  prod: SupabaseClient,
  stagingToProdUser: Map<string, string>,
  sourceOrgId: string | null,
): Promise<void> {
  if (!(await tableExists(staging, 'org_members')) || !(await tableExists(prod, 'org_members'))) {
    console.log('\n[org_members] דילוג');
    return;
  }
  console.log('\n[org_members]');
  let rows = await fetchAllRows(staging, 'org_members');
  if (sourceOrgId) {
    rows = rows.filter((r) => String(r.org_id ?? '') === sourceOrgId);
  }
  const mapped: Record<string, unknown>[] = [];
  for (const r of rows) {
    const sid = String(r.user_id ?? '');
    const pid = stagingToProdUser.get(sid);
    if (!pid) continue;
    const orgId = SYNC_TARGET_ORG_ID ?? String(r.org_id ?? '');
    if (!orgId) continue;
    mapped.push({
      user_id: pid,
      org_id: orgId,
      created_at: r.created_at ?? new Date().toISOString(),
    });
  }
  if (mapped.length === 0) {
    console.log('  אין שורות ממופות');
    return;
  }
  const existing = await fetchAllRows(prod, 'org_members');
  const key = (u: string, o: string) => `${u}|${o}`;
  const existingKeys = new Set(
    existing.map((r) => key(String(r.user_id ?? ''), String(r.org_id ?? ''))),
  );
  const toInsert = mapped.filter((r) => !existingKeys.has(key(String(r.user_id), String(r.org_id))));
  if (toInsert.length === 0) {
    console.log(`  כל ${mapped.length} החברויות כבר קיימות בפרו`);
    return;
  }
  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
    const { error } = await prod.from('org_members').insert(chunk);
    if (error) throw new Error(`[org_members] insert: ${error.message}`);
    console.log(`  הוכנסו ${Math.min(i + chunk.length, toInsert.length)}/${toInsert.length}`);
  }
  console.log(`  סה״כ חברויות חדשות: ${toInsert.length} (מתוך ${mapped.length} ממופות)`);
}

async function syncGenericOrgTable(
  label: string,
  staging: SupabaseClient,
  prod: SupabaseClient,
  table: string,
  onConflict: string,
  sourceOrgId: string | null,
): Promise<void> {
  if (!(await tableExists(staging, table)) || !(await tableExists(prod, table))) {
    console.log(`\n[${table}] דילוג`);
    return;
  }
  console.log(`\n[${table}]`);
  let rows = await fetchAllRows(staging, table);
  if (sourceOrgId && rows.some((r) => 'org_id' in r)) {
    rows = rows.filter((r) => String(r.org_id ?? '') === sourceOrgId);
  }
  const mapped = rows.map((r) => {
    const x = { ...r };
    if (SYNC_TARGET_ORG_ID && 'org_id' in x) x.org_id = SYNC_TARGET_ORG_ID;
    return rewriteUrlsRow(x);
  });
  await upsertChunks(prod, table, mapped, onConflict);
}

async function syncFeatureFlags(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  await syncGenericOrgTable('feature_flags', staging, prod, 'feature_flags', 'feature_key', null);
}

async function syncUserFeatureOverrides(
  staging: SupabaseClient,
  prod: SupabaseClient,
  stagingToProdUser: Map<string, string>,
): Promise<void> {
  if (!(await tableExists(staging, 'user_feature_overrides'))) {
    console.log('\n[user_feature_overrides] דילוג — לא קיים בסטייג\'ינג');
    return;
  }
  if (!(await tableExists(prod, 'user_feature_overrides'))) {
    console.warn(
      '\n[user_feature_overrides] הטבלה חסרה בפרו — הריצו supabase/create_user_feature_overrides.sql ב-SQL Editor',
    );
    return;
  }
  console.log('\n[user_feature_overrides]');
  const rows = await fetchAllRows(staging, 'user_feature_overrides');
  const mapped: Record<string, unknown>[] = [];
  for (const r of rows) {
    const sid = String(r.user_id ?? '');
    const pid = stagingToProdUser.get(sid);
    if (!pid) continue;
    mapped.push({ ...r, user_id: pid });
  }
  await upsertChunks(prod, 'user_feature_overrides', mapped, 'user_id,feature_key');
}

async function listAllStoragePaths(client: SupabaseClient, bucket: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`[storage ${bucket}] list ${prefix}: ${error.message}`);
  if (!data?.length) return out;

  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      const sub = await listAllStoragePaths(client, bucket, path);
      out.push(...sub);
    } else {
      out.push(path);
    }
  }
  return out;
}

async function copyStorageBuckets(staging: SupabaseClient, prod: SupabaseClient): Promise<void> {
  if (SYNC_SKIP_STORAGE) {
    console.log('\n[storage] SYNC_SKIP_STORAGE=1 — דילוג');
    return;
  }
  console.log('\n[storage] העתקת buckets:', SYNC_STORAGE_BUCKETS.join(', '));
  for (const bucket of SYNC_STORAGE_BUCKETS) {
    try {
      const paths = await listAllStoragePaths(staging, bucket);
      let list = paths;
      if (SYNC_STORAGE_MAX > 0) list = paths.slice(0, SYNC_STORAGE_MAX);
      console.log(`  [${bucket}] ${list.length} קבצים`);
      let ok = 0;
      for (const path of list) {
        const { data, error } = await staging.storage.from(bucket).download(path);
        if (error || !data) {
          console.warn(`    דילוג ${path}: ${error?.message ?? 'no data'}`);
          continue;
        }
        const buf = await data.arrayBuffer();
        const { error: upErr } = await prod.storage.from(bucket).upload(path, buf, {
          upsert: true,
        });
        if (upErr) {
          console.warn(`    העלאה נכשלה ${path}: ${upErr.message}`);
          continue;
        }
        ok++;
      }
      console.log(`  [${bucket}] הועתקו ${ok}/${list.length}`);
    } catch (e) {
      console.warn(`  [${bucket}] שגיאה: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function mapOptionalUserId(
  v: unknown,
  stagingToProdUser: Map<string, string>,
): string | null {
  if (v == null || v === '') return null;
  const s = String(v);
  return stagingToProdUser.get(s) ?? null;
}

async function assertProdServiceRoleCanAccessTables(prod: SupabaseClient): Promise<void> {
  const { error } = await prod.from('drivers').select('id').limit(1);
  if (!error) return;
  const msg = String(error.message ?? '');
  if (/42501|permission denied/i.test(msg)) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  פרויקט הפרו חוסם גישת PostgREST ל-service_role על טבלאות public ║
╚══════════════════════════════════════════════════════════════════╝

פתרון: הריצו ב-Supabase → SQL Editor על פרויקט הייצור את המיגרציה:
  supabase/migrations/20260402140000_service_role_grants_public.sql

או ידנית:
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ואז Settings → API → Reload schema.

אם מופיע "Could not find table user_roles" — החסר בפרו מיגרציות; הריצו supabase db push / המיגרציות מהריפו.
`);
    throw new Error('PROD_SERVICE_ROLE_BLOCKED');
  }
}

async function main(): Promise<void> {
  console.log('--- סנכרון מורחב Staging → Production ---');
  if (SYNC_TARGET_ORG_ID) console.log(`SYNC_TARGET_ORG_ID=${SYNC_TARGET_ORG_ID}`);
  if (SYNC_SOURCE_ORG_ID_ENV) console.log(`SYNC_SOURCE_ORG_ID=${SYNC_SOURCE_ORG_ID_ENV}`);

  const staging = createClient(STAGING_URL, STAGING_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const prod = createClient(PROD_URL, PROD_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await assertProdServiceRoleCanAccessTables(prod);

  const stagingProfiles = await fetchAllRows(staging, 'profiles');
  const sourceOrgId = inferSourceOrgId(stagingProfiles);
  console.log(`מזוהה ארגון מקור בסטייג'ינג: ${sourceOrgId ?? '(לא נמצא)'}`);

  await syncAllOrganizations(staging, prod);

  const emailToProdId = await buildEmailToProdProfileId(prod);
  const stagingIdToEmail = await buildStagingProfileIdToEmail(staging);
  const stagingProfileIdToProdProfileId = new Map<string, string>();
  for (const [sid, em] of stagingIdToEmail) {
    const pid = emailToProdId.get(em);
    if (pid) stagingProfileIdToProdProfileId.set(sid, pid);
  }

  await syncProfilesFromStaging(staging, prod, emailToProdId, stagingProfileIdToProdProfileId);
  const stagingToProdUser = await buildStagingToProdUserId(staging, emailToProdId);

  await syncUserRoles(staging, prod, stagingToProdUser);
  await syncOrgMembers(staging, prod, stagingToProdUser, sourceOrgId);

  console.log('\n[1] drivers');
  const stagingDrivers = await fetchAllRows(staging, 'drivers');
  const driversForProd = applyTargetOrg(stagingDrivers).map((r) => {
    const x = rewriteUrlsRow({ ...r });
    x.managed_by_user_id = mapOptionalUserId(x.managed_by_user_id, stagingToProdUser);
    x.user_id = mapOptionalUserId(x.user_id, stagingToProdUser);
    return x;
  });
  await upsertChunks(prod, 'drivers', driversForProd, 'id');

  console.log('\n[2] vehicles');
  const stagingVehicles = await fetchAllRows(staging, 'vehicles');
  const vehiclesForProd = applyTargetOrg(stagingVehicles).map((r) => {
    const x = rewriteUrlsRow({ ...r });
    x.managed_by_user_id = mapOptionalUserId(x.managed_by_user_id, stagingToProdUser);
    return x;
  });
  await upsertChunks(prod, 'vehicles', vehiclesForProd, 'id');

  const prodVehicles = await fetchAllRows(prod, 'vehicles');
  const plateToProdVehicleId = new Map<string, string>();
  for (const v of prodVehicles) {
    const id = String(v.id ?? '');
    const plate = normalizePlate(v.plate_number);
    if (id && plate) plateToProdVehicleId.set(plate, id);
  }

  const stagingVehicleIdToPlate = new Map<string, string>();
  for (const v of stagingVehicles) {
    const id = String(v.id ?? '');
    const plate = normalizePlate(v.plate_number);
    if (id && plate) stagingVehicleIdToPlate.set(id, plate);
  }

  const maintenanceTable = await resolveMaintenanceTable(staging);
  console.log(`\n[3] ${maintenanceTable}`);
  const stagingMaint = await fetchAllRows(staging, maintenanceTable);
  const maintForProd: Record<string, unknown>[] = [];
  let skippedMaint = 0;
  for (const row of stagingMaint) {
    const vid = String(row.vehicle_id ?? '');
    const plate = stagingVehicleIdToPlate.get(vid);
    const mapped = plate ? plateToProdVehicleId.get(plate) : undefined;
    const nextVid = mapped ?? vid;
    if (!nextVid) {
      skippedMaint++;
      continue;
    }
    const x = rewriteUrlsRow({ ...row, vehicle_id: nextVid });
    x.created_by = mapOptionalUserId(x.created_by, stagingToProdUser);
    maintForProd.push(x);
  }
  if (skippedMaint) console.warn(`  דולגו ${skippedMaint} שורות תחזוקה`);
  await upsertChunks(prod, maintenanceTable, maintForProd, 'id');

  console.log('\n[4] driver_documents');
  const stagingDocs = await fetchAllRows(staging, 'driver_documents');
  const prodDriversAfter = await fetchAllRows(prod, 'drivers');
  const idNumberToProdDriverId = new Map<string, string>();
  for (const d of prodDriversAfter) {
    const id = String(d.id ?? '');
    const num = normalizeIdNumber(d.id_number);
    if (id && num) idNumberToProdDriverId.set(num, id);
  }
  const stagingDriverIdToIdNumber = new Map<string, string>();
  for (const d of stagingDrivers) {
    const id = String(d.id ?? '');
    const num = normalizeIdNumber(d.id_number);
    if (id && num) stagingDriverIdToIdNumber.set(id, num);
  }

  const docsForProd: Record<string, unknown>[] = [];
  let skippedDocs = 0;
  for (const row of stagingDocs) {
    const did = String(row.driver_id ?? '');
    const idNum = stagingDriverIdToIdNumber.get(did);
    const mappedDriver = idNum ? idNumberToProdDriverId.get(idNum) : undefined;
    const nextDid = mappedDriver ?? did;
    if (!nextDid) {
      skippedDocs++;
      continue;
    }
    docsForProd.push(rewriteUrlsRow({ ...row, driver_id: nextDid }));
  }
  if (skippedDocs) console.warn(`  דולגו ${skippedDocs} מסמכים`);
  await upsertChunks(prod, 'driver_documents', docsForProd, 'id');

  console.log('\n[5] ui_customization');
  if (await tableExists(staging, 'ui_customization') && (await tableExists(prod, 'ui_customization'))) {
    const uiRows = await fetchAllRows(staging, 'ui_customization');
    const uiForProd = uiRows.map((r) => rewriteRowDeepHosts({ ...r }));
    await upsertChunks(prod, 'ui_customization', uiForProd, 'key');
  } else {
    console.log('  דילוג — ui_customization');
  }

  await syncUiSettingsAllOrgs(staging, prod);
  await syncOrganizationSettingsAll(staging, prod);
  await syncOrgDocumentsAll(staging, prod);

  await syncFeatureFlags(staging, prod);
  await syncUserFeatureOverrides(staging, prod, stagingToProdUser);
  await syncSystemSettings(staging, prod);

  if (await tableExists(staging, 'vehicle_handovers') && (await tableExists(prod, 'vehicle_handovers'))) {
    console.log('\n[vehicle_handovers]');
    const rows = await fetchAllRows(staging, 'vehicle_handovers');
    const mapped = rows.map((row) => {
      const vid = String(row.vehicle_id ?? '');
      const plate = stagingVehicleIdToPlate.get(vid);
      const prodVid = plate ? plateToProdVehicleId.get(plate) ?? vid : vid;
      const did = String(row.driver_id ?? '');
      const idNum = stagingDriverIdToIdNumber.get(did);
      const prodDid = idNum ? idNumberToProdDriverId.get(idNum) ?? did : did;
      const x = rewriteUrlsRow({
        ...row,
        vehicle_id: prodVid,
        driver_id: prodDid,
      });
      x.created_by = mapOptionalUserId(x.created_by, stagingToProdUser);
      return x;
    });
    await upsertChunks(prod, 'vehicle_handovers', mapped, 'id');
  }

  if (
    await tableExists(staging, 'driver_vehicle_assignments') &&
    (await tableExists(prod, 'driver_vehicle_assignments'))
  ) {
    console.log('\n[driver_vehicle_assignments]');
    const rows = await fetchAllRows(staging, 'driver_vehicle_assignments');
    const mapped = rows.map((row) => {
      const vid = String(row.vehicle_id ?? '');
      const plate = stagingVehicleIdToPlate.get(vid);
      const prodVid = plate ? plateToProdVehicleId.get(plate) ?? vid : vid;
      const did = row.driver_id ? String(row.driver_id) : '';
      const idNum = did ? stagingDriverIdToIdNumber.get(did) : '';
      const prodDid = idNum ? idNumberToProdDriverId.get(idNum) ?? did : did;
      return { ...row, vehicle_id: prodVid, driver_id: prodDid || null };
    });
    await upsertChunks(prod, 'driver_vehicle_assignments', mapped, 'id');
  }

  await copyStorageBuckets(staging, prod);

  console.log('\nסיום סנכרון מורחב.');
}

main().catch((e) => {
  if (e instanceof Error && e.message === 'PROD_SERVICE_ROLE_BLOCKED') {
    process.exitCode = 1;
    return;
  }
  console.error(e);
  process.exit(1);
});
