import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams, type To } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { useVehicles } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import type { Driver, Vehicle } from '@/types/fleet';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import { cn } from '@/lib/utils';
import { Columns3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';

type ComplianceTabKey =
  | 'annual_licensing'
  | 'insurance'
  | 'periodic_inspection'
  | 'maintenance'
  | 'driver_license'
  | 'health_declaration'
  | 'regulation_585';

type TowerViewFilter = 'all' | 'custom_range' | 'expiring_soon' | 'urgent';
type ComplianceSource = 'vehicle' | 'driver';
/** v2: כולל מפתח סינתטי לעמודת «סטטוס שליחה»; v1 נטען פעם אחת וממיגרץ */
const COMPLIANCE_COLUMNS_DEFAULTS_KEY = 'admin_compliance_default_columns_v2';
const COMPLIANCE_COLUMNS_DEFAULTS_LEGACY_KEY = 'admin_compliance_default_columns_v1';
/** מפתח סינתטי בבורר העמודות — מציג עמודת «סטטוס שליחה» (בקשות/מעקב), לא שדה DB */
const COMPLIANCE_COLUMN_SEND_STATUS = '__send_status';

function appendSendStatusColumnKey(keys: string[]): string[] {
  return keys.includes(COMPLIANCE_COLUMN_SEND_STATUS) ? keys : [...keys, COMPLIANCE_COLUMN_SEND_STATUS];
}

/** נשמר ב-localStorage — שורד רענון + התנתקות/התחברות; מנוקה כשהשרת מחזיר בקשה פתוחה או כשנסגרת (הושלמה/פגה) */
const TOWER_SENT_HINTS_LS_KEY = 'fleet_compliance_tower_sent_hints_v2';
const TOWER_HINT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type TowerSentHint = { sentAt: string; notifySequence?: number };

function towerHintStorageKey(orgId: string, entityId: string, taskKey: string): string {
  return `${orgId}|${entityId}|${taskKey}`;
}

type TowerHintsByUser = Record<string, Record<string, TowerSentHint>>;

function readTowerSentHints(userId: string): Record<string, TowerSentHint> {
  try {
    const raw = localStorage.getItem(TOWER_SENT_HINTS_LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as TowerHintsByUser;
    const byUser = p && typeof p === 'object' ? p : {};
    const u = byUser?.[userId];
    return u && typeof u === 'object' ? u : {};
  } catch {
    return {};
  }
}

function writeTowerSentHints(userId: string, all: Record<string, TowerSentHint>) {
  try {
    const raw = localStorage.getItem(TOWER_SENT_HINTS_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as TowerHintsByUser) : {};
    const next: TowerHintsByUser = parsed && typeof parsed === 'object' ? { ...parsed } : {};
    next[userId] = all;
    localStorage.setItem(TOWER_SENT_HINTS_LS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

function setTowerSentHint(userId: string, orgId: string, entityId: string, taskKey: string, hint: TowerSentHint) {
  const k = towerHintStorageKey(orgId, entityId, taskKey);
  const all = readTowerSentHints(userId);
  all[k] = hint;
  writeTowerSentHints(userId, all);
}

function removeTowerSentHintByStorageKey(storageKey: string) {
  try {
    const raw = localStorage.getItem(TOWER_SENT_HINTS_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as TowerHintsByUser;
    if (!parsed || typeof parsed !== 'object') return;
    let changed = false;
    const next: TowerHintsByUser = { ...parsed };
    for (const [uid, hints] of Object.entries(parsed)) {
      if (!hints || typeof hints !== 'object') continue;
      if (hints[storageKey]) {
        const copy = { ...hints };
        delete copy[storageKey];
        next[uid] = copy;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(TOWER_SENT_HINTS_LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function removeTowerSentHint(userId: string, orgId: string, entityId: string, taskKey: string) {
  const k = towerHintStorageKey(orgId, entityId, taskKey);
  const all = readTowerSentHints(userId);
  if (!all[k]) return;
  delete all[k];
  writeTowerSentHints(userId, all);
}

function parseTowerHintStorageKey(key: string): { orgId: string; entityId: string; taskKey: string } | null {
  const parts = key.split('|');
  if (parts.length < 3) return null;
  const orgId = parts[0] ?? '';
  const entityId = parts[1] ?? '';
  const taskKey = parts.slice(2).join('|');
  if (!orgId || !entityId || !taskKey) return null;
  return { orgId, entityId, taskKey };
}

function mapKeyFromEntityTask(entityId: string, taskKey: string): string {
  return `${entityId}::${taskKey}`;
}

function pruneExpiredTowerHintsPersisted(userId: string) {
  const now = Date.now();
  const all = readTowerSentHints(userId);
  let changed = false;
  const next = { ...all };
  for (const [k, v] of Object.entries(all)) {
    const sent = Date.parse(v.sentAt);
    if (!Number.isFinite(sent) || now - sent > TOWER_HINT_MAX_AGE_MS) {
      delete next[k];
      changed = true;
    }
  }
  if (changed) writeTowerSentHints(userId, next);
}

/** יישור מפתח רמז עם entity_id או driver_id בשורת compliance_requests */
function removeTowerHintsMatchingComplianceRow(
  orgId: string,
  row: { entity_id?: unknown; driver_id?: unknown; task_key?: unknown },
) {
  const tk = String(row.task_key ?? '').trim();
  if (!tk) return;
  const eid = String(row.entity_id ?? '').trim();
  const did = String(row.driver_id ?? '').trim();
  // userId נשלף בעת האירוע (ראה realtime effect)
}

const FIXED_PICKER_KEYS = {
  due: '__fixed_due',
  days: '__fixed_days',
  status: '__fixed_status',
  actions: '__fixed_actions',
  bulk: '__fixed_bulk',
} as const;

/** שליחת בקשה זמינה רק עם עד N ימים לפני פקיעה (וכשפג) — למעלה מזה לא לוחצים. */
const COMPLIANCE_SEND_MAX_DAYS_REMAINING = 60;

/** תצוגת צבעים וביטוי «טיפול דחוף»: פג תוקף או עד כמה ימים נותרים כולל */
const COMPLIANCE_RED_MAX_DAYS_REMAINING = 5;
/** צהוב: מעל האדום ועד כמה ימים נותרים כולל */
const COMPLIANCE_YELLOW_MAX_DAYS_REMAINING = 30;

function complianceDueBand(dueDays: number | null): 'red' | 'yellow' | 'green' | null {
  if (dueDays == null) return null;
  if (dueDays < 0 || dueDays <= COMPLIANCE_RED_MAX_DAYS_REMAINING) return 'red';
  if (dueDays <= COMPLIANCE_YELLOW_MAX_DAYS_REMAINING) return 'yellow';
  return 'green';
}

const VEHICLE_KEYS: string[] = [
  'id', 'org_id', 'plate_number', 'manufacturer', 'model', 'year', 'current_odometer', 'next_maintenance_km',
  'next_maintenance_date', 'test_expiry', 'insurance_expiry', 'license_image_url', 'insurance_pdf_url', 'status',
  'created_at', 'updated_at', 'engine_volume', 'color', 'ignition_code', 'is_active', 'assigned_driver_id',
  'managed_by_user_id', 'pickup_date', 'road_ascent_year', 'road_ascent_month', 'ownership_type',
  'leasing_company_name', 'last_odometer_date', 'manufacturer_code', 'model_code', 'tax_value_price', 'tax_year',
  'adjusted_price', 'chassis_number', 'average_fuel_consumption', 'monthly_total_cost', 'purchase_date', 'sale_date',
  'group_name', 'internal_number', 'vehicle_budget', 'upgrade_addition', 'vehicle_type_name', 'base_index',
  'driver_code', 'pascal', 'next_alert_km', 'mandatory_end_date', 'odometer_diff_maintenance', 'vehicle_type_code',
  'model_description', 'fuel_type', 'vehicle_standard', 'vat_recognized', 'commercial_name', 'is_automatic',
  'drive_type', 'green_score', 'pollution_level', 'weight', 'list_price', 'effective_date', 'last_service_date',
  'last_service_km', 'service_interval_km', 'safety_officer', 'last_tire_change_date', 'next_tire_change_date',
  'tire_change_date_front_right', 'tire_change_date_front_left', 'tire_change_date_rear_right',
  'tire_change_date_rear_left', 'last_inspection_date', 'next_inspection_date', 'inspection_form_url',
  'periodic_inspection_json',
];

const DRIVER_KEYS: string[] = [
  'id', 'org_id', 'user_id', 'managed_by_user_id', 'full_name', 'id_number', 'phone', 'email', 'license_expiry',
  'pending_license_expiry',
  'health_declaration_date', 'safety_training_date', 'license_front_url', 'license_back_url',
  'health_declaration_url', 'status', 'created_at', 'updated_at', 'address', 'job_title', 'department',
  'license_number', 'regulation_585b_date', 'driver_code', 'is_active', 'employee_number', 'work_start_date', 'city',
  'note1', 'note2', 'rating', 'division', 'eligibility', 'area', 'group_name', 'group_code', 'safety_officer',
  'birth_date', 'family_permit_date', 'driving_permit', 'is_field_person', 'practical_driving_test_date',
];

/** ללא עמודת DB של status — דחיפות/פג תוקף מוצגים ב«ימים נותרו» */
const VEHICLE_DEFAULT_COLUMNS = ['plate_number', 'manufacturer', 'model'];
const DRIVER_DEFAULT_COLUMNS = ['full_name', 'id_number', 'phone', 'email'];

const TAB_DEFS: Array<{ key: ComplianceTabKey; label: string; source: 'vehicle' | 'driver'; dueField: string }> = [
  { key: 'annual_licensing', label: 'רישוי שנתי', source: 'vehicle', dueField: 'test_expiry' },
  { key: 'insurance', label: 'ביטוח', source: 'vehicle', dueField: 'insurance_expiry' },
  { key: 'periodic_inspection', label: 'ביקורת תקופתית', source: 'vehicle', dueField: 'next_inspection_date' },
  { key: 'maintenance', label: 'טיפול', source: 'vehicle', dueField: 'next_maintenance_date' },
  { key: 'driver_license', label: 'רישיון נהיגה', source: 'driver', dueField: 'license_expiry' },
  { key: 'health_declaration', label: 'הצהרת בריאות', source: 'driver', dueField: 'health_declaration_date' },
  { key: 'regulation_585', label: 'תקנה 585', source: 'driver', dueField: 'regulation_585b_date' },
];

const REQUEST_CTA_BY_TAB: Record<ComplianceTabKey, string> = {
  annual_licensing: 'Your annual vehicle license is overdue. Please click to update the required document.',
  insurance: 'Vehicle insurance is overdue. Please click and upload updated insurance.',
  periodic_inspection: 'Periodic inspection is due. Please click and upload the new inspection proof.',
  maintenance: 'Scheduled maintenance is due. Please click and update the maintenance confirmation.',
  driver_license: 'Your license is overdue, please click here to upload a new photo.',
  health_declaration: 'Your health declaration requires an update. Please click and upload the updated document.',
  regulation_585: 'Regulation 585 documentation is due. Please click and upload the required update.',
};

/** טאבי מייל/מערכת עם תצוגת מטא מלאה (תאריך, מונה); הצהרת בריאות — מסלול חתימה נפרד */
const COMPLIANCE_RICH_SENT_TAB_KEYS = new Set<ComplianceTabKey>([
  'annual_licensing',
  'insurance',
  'driver_license',
  'periodic_inspection',
  'maintenance',
  'regulation_585',
]);

function isComplianceRichSentTab(tabKey: ComplianceTabKey): boolean {
  return COMPLIANCE_RICH_SENT_TAB_KEYS.has(tabKey);
}

function availableKeysFromRows(rows: Array<Record<string, unknown>>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) out.add(k);
  }
  return out;
}

function filterKeysByAvailable(keys: string[], available: Set<string>): string[] {
  return keys.filter((k) => k === COMPLIANCE_COLUMN_SEND_STATUS || available.has(k));
}

/** סינכרון בורר ↔ טבלה: רק מפתחות קיימים בנתונים; אם לא נשאר כלום — תאריך יעד לטאב + סטטוס שליחה */
function normalizeComplianceTabColumns(
  tab: { key: ComplianceTabKey; dueField: string; source: 'vehicle' | 'driver' },
  keys: string[],
  available: Set<string>,
): string[] {
  const filtered = filterKeysByAvailable(keys, available);
  if (filtered.length === 0) {
    return appendSendStatusColumnKey([tab.dueField]);
  }
  return filtered;
}

function toStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoYmdTodayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToIsoYmd(isoYmd: string, days: number): string {
  const d = parseIsoDate(isoYmd);
  if (!d) return isoYmd;
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : toStartOfDay(d);
}

function daysUntil(raw: unknown): number | null {
  const target = parseIsoDate(raw);
  if (!target) return null;
  const now = toStartOfDay(new Date());
  const targetDay = toStartOfDay(target);
  return Math.round((targetDay.getTime() - now.getTime()) / 86_400_000);
}

/** תאריך יעד לחישוב תצוגה/סינון: ברישיון ב־pending — התאריך שהנהג הזין בטופס הציבורי */
function complianceDueRawForRow(
  tabKey: ComplianceTabKey,
  dueField: string,
  row: Record<string, unknown>,
): unknown {
  if (tabKey === 'driver_license') {
    const st = String(row.status ?? '').trim().toLowerCase();
    const p = String((row as { pending_license_expiry?: string | null }).pending_license_expiry ?? '').trim();
    if (st === 'pending_approval' && p) return p;
  }
  return row[dueField];
}

/** סיבה לחסימת שליחה (אימייל / ממתין לחתימה / יותר מדי ימים לפני פקיעה) — null אם מותר לשלוח */
function complianceRequestSendBarrier(
  tab: { key: ComplianceTabKey; dueField: string },
  row: Record<string, unknown>,
  requestDisabledReason: (row: Record<string, unknown>) => string | null,
): string | null {
  const awaitingEmp =
    tab.key === 'health_declaration' &&
    Boolean((row as { __awaitingEmployeeSignature?: boolean }).__awaitingEmployeeSignature);
  const baseBarrier =
    awaitingEmp ? 'כבר נשלח קישור — ממתין להשלמת חתימה במערכת' : requestDisabledReason(row);
  const dueDays = daysUntil(complianceDueRawForRow(tab.key, tab.dueField, row));
  const farBarrier =
    dueDays != null && dueDays > COMPLIANCE_SEND_MAX_DAYS_REMAINING
      ? `שליחה זמינה רק עד ${COMPLIANCE_SEND_MAX_DAYS_REMAINING} יום לפני פקיעה (או אחרי פקיעת תוקף).`
      : null;
  return baseBarrier ?? farBarrier;
}

function dueIsoFromRaw(raw: unknown): string | null {
  const d = parseIsoDate(raw);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isExpiredRaw(raw: unknown): boolean {
  const d = daysUntil(raw);
  return d != null && d < 0;
}

function formatDate(raw: unknown): string {
  const d = parseIsoDate(raw);
  return d ? d.toLocaleDateString('he-IL') : '—';
}

/** ISO YYYY-MM-DD → 1/8/2026 (יום/חודש/שנה, בלי אפס מוביל) */
function formatIsoYmdAsDmySlash(raw: unknown): string {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return s;
  return `${d}/${mo}/${y}`;
}

/** תאריך ושעת שליחת בקשת ציות (ISO מהשרת) */
function formatComplianceSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

function parseComplianceNotifySequence(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }
  const n = Number((metadata as Record<string, unknown>).notify_sequence);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** תשובת Edge לפעמים מחרוזת JSON או אובייקט — נרמול לשדות כמו persisted_token */
function normalizeInvokePayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** גוף JSON מ־Response של functions.invoke כשמתקבל 4xx/5xx — כולל existing_request_id ב־409 לליסינג */
async function readEdgeFunctionInvokeErrorPayload(err: unknown): Promise<{
  message: string;
  existing_request_id?: string;
}> {
  const fallbackMsg = err instanceof Error ? err.message : String(err);
  const ctx = (err as { context?: Response }).context;
  if (!ctx?.clone) {
    return { message: fallbackMsg };
  }
  try {
    const body = (await ctx.clone().json()) as Record<string, unknown>;
    const er =
      typeof body.error === 'string' && body.error.trim().length > 0 ? body.error.trim() : '';
    const m =
      typeof body.message === 'string' && body.message.trim().length > 0 ? body.message.trim() : '';
    const rid = body.existing_request_id;
    const existing_request_id =
      typeof rid === 'string' && rid.trim().length > 0 ? rid.trim() : undefined;
    const messageFromBody = er || m;
    return { message: messageFromBody || fallbackMsg, ...(existing_request_id ? { existing_request_id } : {}) };
  } catch {
    return { message: fallbackMsg };
  }
}

function prettifyKey(key: string): string {
  const dict: Record<string, string> = {
    id: 'מזהה',
    org_id: 'מזהה ארגון',
    user_id: 'מזהה משתמש',
    managed_by_user_id: 'מנוהל על ידי',
    plate_number: 'מספר רישוי',
    manufacturer: 'יצרן',
    model: 'דגם',
    year: 'שנת ייצור',
    full_name: 'שם מלא',
    id_number: 'ת.ז.',
    phone: 'טלפון',
    email: 'אימייל',
    status: 'סטטוס',
    test_expiry: 'תוקף רישוי',
    insurance_expiry: 'תוקף ביטוח',
    next_inspection_date: 'ביקורת תקופתית הבאה',
    next_maintenance_date: 'טיפול הבא',
    assigned_driver_id: 'מזהה נהג משויך',
    license_number: 'מספר רישיון',
    license_front_url: 'קובץ רישיון חזית',
    license_back_url: 'קובץ רישיון גב',
    health_declaration_url: 'קובץ הצהרת בריאות',
    license_expiry: 'תוקף רישיון',
    pending_license_expiry: 'תוקף מוצע (מהנהג)',
    health_declaration_date: 'הצהרת בריאות',
    safety_training_date: 'הדרכת בטיחות',
    regulation_585b_date: 'תקנה 585',
    safety_officer: 'קצין בטיחות',
    address: 'כתובת',
    job_title: 'תפקיד',
    department: 'מחלקה',
    city: 'עיר',
    created_at: 'נוצר בתאריך',
    updated_at: 'עודכן בתאריך',
    current_odometer: 'מד אוץ נוכחי',
    next_maintenance_km: 'ק"מ לטיפול הבא',
    license_image_url: 'קובץ רישוי',
    insurance_pdf_url: 'קובץ ביטוח',
    engine_volume: 'נפח מנוע',
    color: 'צבע',
    ignition_code: 'קוד הנעה',
    is_active: 'פעיל',
    pickup_date: 'תאריך עלייה לכביש',
    road_ascent_year: 'שנת עלייה לכביש',
    road_ascent_month: 'חודש עלייה לכביש',
    ownership_type: 'סוג בעלות',
    leasing_company_name: 'חברת ליסינג',
    last_odometer_date: 'תאריך אוץ אחרון',
    manufacturer_code: 'קוד יצרן',
    model_code: 'קוד דגם',
    tax_value_price: 'שווי מס',
    tax_year: 'שנת מס',
    adjusted_price: 'מחיר מתואם',
    chassis_number: 'מספר שלדה',
    average_fuel_consumption: 'צריכת דלק ממוצעת',
    monthly_total_cost: 'עלות חודשית כוללת',
    purchase_date: 'תאריך רכישה',
    sale_date: 'תאריך מכירה',
    group_name: 'קבוצת שיוך',
    internal_number: 'מספר פנימי',
    vehicle_budget: 'תקציב רכב',
    upgrade_addition: 'תוספת שדרוג',
    vehicle_type_name: 'סוג רכב',
    base_index: 'מדד בסיס',
    driver_code: 'קוד נהג',
    pascal: 'פסקל',
    next_alert_km: 'התראה הבאה בק"מ',
    mandatory_end_date: 'סיום חובה',
    odometer_diff_maintenance: 'פער אוץ לטיפול',
    vehicle_type_code: 'קוד סוג רכב',
    model_description: 'תיאור דגם',
    fuel_type: 'סוג דלק',
    vehicle_standard: 'תקן רכב',
    vat_recognized: 'מע"מ מוכר',
    commercial_name: 'שם מסחרי',
    is_automatic: 'אוטומטי',
    drive_type: 'סוג הנעה',
    green_score: 'ציון ירוק',
    pollution_level: 'רמת זיהום',
    weight: 'משקל',
    list_price: 'מחיר מחירון',
    effective_date: 'תאריך תחולה',
    last_service_date: 'תאריך טיפול אחרון',
    last_service_km: 'ק"מ טיפול אחרון',
    service_interval_km: 'מרווח טיפול בק"מ',
    last_tire_change_date: 'תאריך החלפת צמיגים אחרון',
    next_tire_change_date: 'תאריך החלפת צמיגים הבא',
    tire_change_date_front_right: 'החלפת צמיג קדמי ימין',
    tire_change_date_front_left: 'החלפת צמיג קדמי שמאל',
    tire_change_date_rear_right: 'החלפת צמיג אחורי ימין',
    tire_change_date_rear_left: 'החלפת צמיג אחורי שמאל',
    last_inspection_date: 'תאריך ביקורת אחרון',
    inspection_form_url: 'קובץ ביקורת',
    periodic_inspection_json: 'נתוני ביקורת תקופתית',
    employee_number: 'מספר עובד',
    work_start_date: 'תאריך תחילת עבודה',
    note1: 'הערה 1',
    note2: 'הערה 2',
    rating: 'דירוג',
    division: 'חטיבה',
    eligibility: 'זכאות',
    area: 'אזור',
    group_code: 'קוד קבוצה',
    birth_date: 'תאריך לידה',
    family_permit_date: 'תאריך היתר משפחה',
    driving_permit: 'היתר נהיגה',
    is_field_person: 'עובד שטח',
    practical_driving_test_date: 'תאריך מבחן נהיגה מעשי',
    [COMPLIANCE_COLUMN_SEND_STATUS]: 'סטטוס שליחה',
  };
  if (dict[key]) return dict[key];
  return key.replace(/_/g, ' ');
}

/** סטטוס נהג/מסמך במערכת — תווית בעברית (ולא snake_case מה-DB) */
function driverSystemStatusLabelHe(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return '—';
  const map: Record<string, string> = {
    pending_approval: 'ממתין לאישור מנהל',
    active: 'פעיל',
    inactive: 'לא פעיל',
    expired: 'פג תוקף',
    valid: 'בתוקף',
  };
  const low = s.toLowerCase();
  return map[low] ?? s;
}

/** ערך חסר בטבלת ציות — מאפשר קישור לטופס השלמה */
function complianceRawMissing(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  return s === '' || s.toLowerCase() === 'null';
}

/** מזהה אלמנט ל־hash בלי # — לפי React Router */
function vehicleDueFieldHash(dueField: string): string {
  const map: Record<string, string> = {
    test_expiry: 'test_expiry',
    insurance_expiry: 'insurance_expiry',
    next_maintenance_date: 'next_maintenance_date',
    next_inspection_date: 'next_inspection_date',
  };
  const id = map[dueField];
  return id ?? 'test_expiry';
}

function driverDueFieldHash(dueField: string): string {
  const map: Record<string, string> = {
    license_expiry: 'license_expiry',
    health_declaration_date: 'health_declaration_date',
    regulation_585b_date: 'regulation_585b_date',
  };
  const id = map[dueField];
  return id ?? 'license_expiry';
}

function columnFieldHash(rowSource: ComplianceSource, col: string): string | null {
  if (rowSource === 'vehicle') {
    const allowed = new Set(['plate_number', 'manufacturer', 'model']);
    return allowed.has(col) ? col : null;
  }
  const allowed = new Set(['full_name', 'id_number', 'phone', 'email']);
  return allowed.has(col) ? col : null;
}

function complianceEditLinkProps(
  rowSource: ComplianceSource,
  dueField: string,
  row: Record<string, unknown>,
  returnUrl: string,
  mode: 'due' | 'column',
  col?: string,
): { to: { pathname: string; hash?: string }; state: { complianceReturnTo: string } } | null {
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const state = { complianceReturnTo: returnUrl };
  if (mode === 'due') {
    if (rowSource === 'vehicle') {
      return { to: { pathname: `/vehicles/${id}/edit`, hash: vehicleDueFieldHash(dueField) }, state };
    }
    return { to: { pathname: `/drivers/${id}/edit`, hash: driverDueFieldHash(dueField) }, state };
  }
  if (!col) return null;
  const h = columnFieldHash(rowSource, col);
  if (!h) return null;
  const pathname = rowSource === 'vehicle' ? `/vehicles/${id}/edit` : `/drivers/${id}/edit`;
  return { to: { pathname, hash: h }, state };
}

function renderValue(raw: unknown, col?: string): string {
  if (col === 'status') return driverSystemStatusLabelHe(raw);
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'כן' : 'לא';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw.toLocaleString('he-IL') : '—';
  if (typeof raw === 'string') {
    const d = parseIsoDate(raw);
    if (d && /^\d{4}-\d{2}-\d{2}/.test(raw)) return d.toLocaleDateString('he-IL');
    return raw;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function SearchableColumnPicker({
  allKeys,
  fixedItems,
  selected,
  onSaveSession,
  onSaveDefault,
  onRestoreDefault,
  triggerLabel,
}: {
  allKeys: string[];
  fixedItems: Array<{ key: string; label: string }>;
  selected: string[];
  onSaveSession: (next: string[]) => void;
  onSaveDefault: (next: string[]) => void;
  /** מחזיר את רשימת העמודות אחרי שחזור — לסנכרון טיוטת הבורר (לפני עדכון React ל-props) */
  onRestoreDefault: () => string[];
  /** טקסט כפתור — כולל ספירה שמתאימה לטבלה (עמודות קבועות + שדות מהבורר) */
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);
  const fixedKeySet = useMemo(() => new Set(fixedItems.map((x) => x.key)), [fixedItems]);

  useEffect(() => {
    if (!open) setDraftSelected(selected);
  }, [selected, open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fixed = fixedItems.filter((it) => {
      if (!q) return true;
      return it.key.toLowerCase().includes(q) || it.label.toLowerCase().includes(q);
    });
    const rest = allKeys.filter((k) => !fixedKeySet.has(k)).filter((k) => {
      if (!q) return true;
      return k.toLowerCase().includes(q) || prettifyKey(k).toLowerCase().includes(q);
    });
    return { fixed, rest };
  }, [allKeys, fixedItems, fixedKeySet, query]);

  const toggle = (key: string) => {
    if (fixedKeySet.has(key)) return;
    if (draftSelected.includes(key)) {
      setDraftSelected(draftSelected.filter((x) => x !== key));
      return;
    }
    setDraftSelected([...draftSelected, key]);
  };

  const selectableKeys = useMemo(() => allKeys.filter((k) => !fixedKeySet.has(k)), [allKeys, fixedKeySet]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setDraftSelected(selected);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-2 max-w-[min(100%,22rem)]">
          <Columns3 className="h-4 w-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-3" dir="rtl">
        <div className="space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש שדה..."
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraftSelected([...selectableKeys])}>בחר הכל</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraftSelected([])}>נקה הכל</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const restored = onRestoreDefault();
                setDraftSelected(restored);
              }}
            >
              שחזר ברירת מחדל
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSaveDefault(draftSelected)}
            >
              שמור ברירת מחדל
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onSaveSession(draftSelected);
                setOpen(false);
              }}
            >
              רק שמור
            </Button>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border p-2">
            {shown.fixed.map((it) => (
              <label
                key={it.key}
                className="flex cursor-not-allowed items-center gap-2 rounded px-2 py-1 opacity-80"
                title="עמודה קבועה בטבלה"
              >
                <Checkbox checked disabled />
                <span className="text-sm">{it.label}</span>
              </label>
            ))}
            {shown.fixed.length > 0 && shown.rest.length > 0 ? <div className="my-2 border-t" /> : null}
            {shown.rest.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <Checkbox checked={draftSelected.includes(key)} onCheckedChange={() => toggle(key)} />
                <span className="text-sm">{prettifyKey(key)}</span>
              </label>
            ))}
            {shown.fixed.length === 0 && shown.rest.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">לא נמצאו עמודות</p>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type TabTableProps<T extends Record<string, unknown>> = {
  rows: T[];
  columns: string[];
  dueField: string;
  tabKey: ComplianceTabKey;
  /** רכבים או נהגים — לקישור עמודת שם מלא */
  rowSource: ComplianceSource;
  /** חזרה ממסכי עריכה אחרי השלמת שדות חסרים */
  complianceReturnUrl: string;
  emptyLabel: string;
  onSendRequest: (row: T) => void;
  requestDisabledReason: (row: T) => string | null;
  /** כשחסר אימייל — קישור לעריכת נהג למילוי אימייל */
  driverEmailFixHref?: (row: T) => To | null;
  onApproveLicense: (row: T) => void;
  getApproveDateValue: (row: T) => string;
  setApproveDateValue: (row: T, next: string) => void;
  isApprovingRow: (row: T) => boolean;
  sendingRowKey: string | null;
  /** בחירה מרוכזת לשליחה */
  bulkSendSelectionIds: ReadonlySet<string>;
  bulkSending: boolean;
  onBulkToggleRow: (entityId: string, checked: boolean) => void;
  onBulkHeaderToggle: (eligibleIdsOnScreen: string[], checked: boolean) => void;
  /** זרימת ליסינג — רישוי שנתי / ביטוח */
  getPendingVehicleRenewal?: (vehicleId: string) => {
    requestId: string;
    previewUrl: string;
    proposedExpiry: string;
  } | null;
  onApproveVehicleRenewal?: (requestId: string) => void;
  approvingVehicleRenewalId?: string | null;
  /** כשמציגים פעולות ממתינות ברשימה נפרדת — מסתיר צפייה/אישור בשורה */
  hideLeasingPendingInlineActions?: boolean;
  /** הדגשה מקישור מרכז ציות (?focus=entityId) */
  focusHighlightId?: string;
  /** עמודת מעקב שליחת בקשות / התראות — ניתן להסתיר מבורר העמודות */
  showSendStatusColumn?: boolean;
};

function ComplianceTable<T extends Record<string, unknown>>({
  rows,
  columns,
  dueField,
  tabKey,
  rowSource,
  complianceReturnUrl,
  emptyLabel,
  onSendRequest,
  requestDisabledReason,
  driverEmailFixHref,
  onApproveLicense,
  getApproveDateValue,
  setApproveDateValue,
  isApprovingRow,
  sendingRowKey,
  bulkSendSelectionIds,
  bulkSending,
  onBulkToggleRow,
  onBulkHeaderToggle,
  getPendingVehicleRenewal,
  onApproveVehicleRenewal,
  approvingVehicleRenewalId,
  hideLeasingPendingInlineActions,
  focusHighlightId,
  showSendStatusColumn = true,
}: TabTableProps<T>) {
  /** עמודת «סטטוס» ייעודית קיימת — לא לשכפל את שדה status מהרכב בעמודות הנתונים */
  const baseCols = columns.length > 0 ? columns : [dueField];
  const filteredCols = baseCols.filter((c) => !(rowSource === 'vehicle' && c === 'status'));
  /** תאריך היעד של הטאב מוצג תמיד בעמודה נפרדת — לא לשכפל את אותו שדה בעמודות הנתונים (למשל שני כותרות «תקנה 585») */
  const safeColumns = filteredCols.filter((c) => c !== dueField);

  const eligibilityByRow = rows.map((row) => {
    const dueDays = daysUntil(complianceDueRawForRow(tabKey, dueField, row as Record<string, unknown>));
    const id = String(row.id ?? '').trim();
    const pendingRen =
      rowSource === 'vehicle' && (tabKey === 'annual_licensing' || tabKey === 'insurance') && id
        ? getPendingVehicleRenewal?.(id) ?? null
        : null;
    let sendBarrierMerged = complianceRequestSendBarrier(
      { key: tabKey, dueField },
      row as Record<string, unknown>,
      (r) => requestDisabledReason(r as T),
    );
    if (pendingRen) {
      sendBarrierMerged = 'יש הגשה הממתינה לאישור מנהל — השתמש ב«אישור והחלה»';
    }
    const pendingMgrDriverQueue =
      tabKey === 'driver_license' && String(row.status ?? '').trim().toLowerCase() === 'pending_approval';
    return {
      id,
      dueDays,
      sendBarrierMerged,
      pendingRen,
      canSelectBulk:
        Boolean(id) && !sendBarrierMerged && !bulkSending && !pendingMgrDriverQueue,
    };
  });

  const eligibleBulkIdsOnScreen = eligibilityByRow.filter((x) => x.canSelectBulk).map((x) => x.id);
  const bulkHeaderFullyChecked =
    eligibleBulkIdsOnScreen.length > 0 &&
    eligibleBulkIdsOnScreen.every((kid) => bulkSendSelectionIds.has(kid));
  const bulkHeaderIndeterminate =
    eligibleBulkIdsOnScreen.some((kid) => bulkSendSelectionIds.has(kid)) && !bulkHeaderFullyChecked;

  return (
    <div className="overflow-x-auto rounded-lg border">
      {/* dir=rtl: עמודת נתונים ראשונה (ימין) → … → צ׳קבוקס משמאל */}
      <Table dir="rtl">
        <TableHeader>
          <TableRow>
            {safeColumns.map((col) => (
              <TableHead key={col} className="text-right">{prettifyKey(col)}</TableHead>
            ))}
            <TableHead className="text-right whitespace-nowrap">{prettifyKey(dueField)}</TableHead>
            <TableHead className="text-right whitespace-nowrap">ימים נותרו</TableHead>
            <TableHead className="text-right whitespace-nowrap">סטטוס</TableHead>
            {showSendStatusColumn ? (
              <TableHead className="text-right min-w-[11rem] whitespace-nowrap">
                {prettifyKey(COMPLIANCE_COLUMN_SEND_STATUS)}
              </TableHead>
            ) : null}
            <TableHead className="text-right whitespace-nowrap">פעולות</TableHead>
            <TableHead className="w-10 px-2 text-center" aria-label="בחר הכל לשליחה מרוכזת">
              <Checkbox
                disabled={eligibleBulkIdsOnScreen.length === 0 || bulkSending}
                checked={bulkHeaderFullyChecked ? true : bulkHeaderIndeterminate ? 'indeterminate' : false}
                onCheckedChange={(v) => {
                  const on = v === true;
                  onBulkHeaderToggle(eligibleBulkIdsOnScreen, on);
                }}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-right text-muted-foreground"
                colSpan={safeColumns.length + 5 + (showSendStatusColumn ? 1 : 0)}
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => {
              const gate = eligibilityByRow[idx]!;
              const dueDays = gate.dueDays;
              const sendBarrierMerged = gate.sendBarrierMerged;
              const pendingVehicleRen = gate.pendingRen;
              const isExpired = dueDays != null && dueDays < 0;
              const band = complianceDueBand(dueDays);
              const rowUrgent = band === 'red';
              const awaitingEmp =
                tabKey === 'health_declaration' &&
                Boolean((row as { __awaitingEmployeeSignature?: boolean }).__awaitingEmployeeSignature);
              const driverLicPending =
                tabKey === 'driver_license' &&
                String(row.status ?? '').trim().toLowerCase() === 'pending_approval';
              const rowEntityId = String(row.id ?? '').trim();
              const effectiveDueRaw = complianceDueRawForRow(tabKey, dueField, row as Record<string, unknown>);
              return (
                <TableRow
                  key={String(row.id ?? idx)}
                  id={rowEntityId ? `compliance-focus-${rowEntityId}` : undefined}
                  className={cn(
                    rowUrgent
                      ? 'bg-red-500/10 transition-colors hover:bg-red-500/15'
                      : 'transition-colors hover:bg-red-500/12',
                    focusHighlightId && rowEntityId === focusHighlightId && 'ring-2 ring-inset ring-primary/60',
                  )}
                >
                  {safeColumns.map((col) => (
                    <TableCell key={`${String(row.id ?? idx)}-${col}`} className="text-right">
                      {rowSource === 'vehicle' && col === 'plate_number' && rowEntityId ? (
                        <Link
                          to={`/vehicles/${rowEntityId}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          title="כרטיס רכב"
                        >
                          {renderValue(row[col], col)}
                        </Link>
                      ) : rowSource === 'driver' && col === 'full_name' && String(row.id ?? '').trim() ? (
                        complianceRawMissing(row[col]) ? (
                          (() => {
                            const lp = complianceEditLinkProps(rowSource, dueField, row, complianceReturnUrl, 'column', 'full_name');
                            return lp ? (
                              <Link {...lp} className="font-medium text-primary underline-offset-4 hover:underline" title="השלמת שם מלא בעריכת נהג">
                                {renderValue(row[col], col)}
                              </Link>
                            ) : (
                              renderValue(row[col], col)
                            );
                          })()
                        ) : (
                          <Link
                            to={{ pathname: `/drivers/${String(row.id ?? '').trim()}/edit` }}
                            state={{ complianceReturnTo: complianceReturnUrl }}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            title="עריכת פרטי נהג"
                          >
                            {renderValue(row[col], col)}
                          </Link>
                        )
                      ) : complianceRawMissing(row[col]) &&
                        columnFieldHash(rowSource, col) &&
                        String(row.id ?? '').trim() ? (
                        (() => {
                          const lp = complianceEditLinkProps(rowSource, dueField, row, complianceReturnUrl, 'column', col);
                          return lp ? (
                            <Link {...lp} className="font-medium text-primary underline-offset-4 hover:underline" title="מעבר לעריכה להשלמת השדה">
                              {renderValue(row[col], col)}
                            </Link>
                          ) : (
                            renderValue(row[col], col)
                          );
                        })()
                      ) : (
                        renderValue(row[col], col)
                      )}
                    </TableCell>
                  ))}
                  <TableCell
                    className={`text-right ${
                      rowUrgent ? 'text-red-400 font-semibold' : band === 'yellow' ? 'text-amber-200/95' : band === 'green' ? 'text-emerald-200/90' : ''
                    }`}
                  >
                    {(() => {
                      if (complianceRawMissing(effectiveDueRaw)) {
                        const lp = complianceEditLinkProps(rowSource, dueField, row, complianceReturnUrl, 'due');
                        return lp ? (
                          <Link
                            {...lp}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            title="מעבר לעריכה להשלמת תאריך התוקף"
                          >
                            {formatDate(effectiveDueRaw)}
                          </Link>
                        ) : (
                          formatDate(effectiveDueRaw)
                        );
                      }
                      return formatDate(effectiveDueRaw);
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {dueDays == null ? (
                      '—'
                    ) : isExpired ? (
                      <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                        פג תוקף — עברו {Math.abs(dueDays)} ימים
                      </span>
                    ) : band === 'red' ? (
                      <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                        נותרו {dueDays} ימים
                      </span>
                    ) : band === 'yellow' ? (
                      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                        נותרו {dueDays} ימים
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-600/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                        נותרו {dueDays} ימים
                      </span>
                    )}
                  </TableCell>
                  {/** עמודת «סטטוס»: ללא שכפול דחיפות/פג תוקף — רואים ב«ימים נותרו» */}
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  {showSendStatusColumn ? (
                    <TableCell className="text-right align-top">
                      {(() => {
                        const sentMeta = (row as Record<string, unknown>).__complianceSentMeta as
                          | {
                              sentAt?: string;
                              status?: string;
                              notifySequence?: number;
                              updatedAt?: string;
                            }
                          | null
                          | undefined;
                        const showSentBadge =
                          Boolean(sentMeta?.sentAt) && !(tabKey === 'health_declaration' && awaitingEmp);
                        if (showSentBadge) {
                          const st = String(sentMeta?.status ?? 'sent');
                          const sa = String(sentMeta?.sentAt ?? '').trim();
                          const seq = sentMeta?.notifySequence;
                          const isLeaseTab = tabKey === 'annual_licensing' || tabKey === 'insurance';
                          if (isComplianceRichSentTab(tabKey) && sa) {
                            const isPendingReview = st === 'pending_admin_review';
                            const title = isPendingReview
                              ? 'הוגש מסמך — ממתין לאישור מנהל'
                              : st === 'opened'
                                ? isLeaseTab
                                  ? 'הקישור לנציג נפתח'
                                  : 'הקישור לנהג נפתח'
                                : isLeaseTab
                                  ? 'ממתין לתגובת נציג'
                                  : 'ממתין לתגובת הנהג';
                            const badgeClass = isPendingReview
                              ? 'inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200'
                              : 'inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-200';
                            return (
                              <div className="flex max-w-[16rem] flex-col items-end gap-0.5 text-right">
                                <span className={badgeClass}>{title}</span>
                                {seq != null && seq > 0 ? (
                                  <span className="text-[10px] font-medium leading-snug text-muted-foreground">
                                    התראה מספר {seq}
                                  </span>
                                ) : null}
                                <span className="text-[10px] leading-snug text-muted-foreground tabular-nums">
                                  {isPendingReview
                                    ? `${isLeaseTab ? 'נשלח לנציג' : 'נשלח לנהג'}: ${formatComplianceSentAt(sa)}`
                                    : `נשלח: ${formatComplianceSentAt(sa)}`}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-200">
                              נשלחה בקשה
                            </span>
                          );
                        }
                        if (tabKey === 'health_declaration') {
                          if (awaitingEmp) {
                            return (
                              <div className="flex flex-col items-end gap-0.5 text-right">
                                <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-200">
                                  {(() => {
                                    const meta = (row as Record<string, unknown>).__compliancePendingMeta as
                                      | { sentAt?: string; status?: string }
                                      | null
                                      | undefined;
                                    return meta?.status === 'opened'
                                      ? 'ממתין לחתימת העובד (הקישור נפתח)'
                                      : 'ממתין לחתימת העובד';
                                  })()}
                                </span>
                                {(() => {
                                  const meta = (row as Record<string, unknown>).__compliancePendingMeta as
                                    | { sentAt?: string }
                                    | null
                                    | undefined;
                                  const sa = meta?.sentAt?.trim();
                                  return sa ? (
                                    <span className="max-w-[14rem] text-[10px] leading-snug text-muted-foreground tabular-nums">
                                      נשלח {formatComplianceSentAt(sa)}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            );
                          }
                          if (dueDays == null) {
                            return (
                              <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-700/40 px-2 py-0.5 text-xs font-semibold text-slate-200">
                                ממתין לשליחה
                              </span>
                            );
                          }
                        }
                        if (driverLicPending) {
                          return (
                            <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                              ממתין לאישור מנהל (רישיון הוגש)
                            </span>
                          );
                        }
                        return <span className="text-sm text-muted-foreground">—</span>;
                      })()}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!driverLicPending ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              Boolean(sendBarrierMerged) ||
                              sendingRowKey === String(row.id ?? idx) ||
                              bulkSending
                            }
                            onClick={() => {
                              if (sendBarrierMerged) {
                                toast.error(`לא ניתן לשלוח בקשה: ${sendBarrierMerged}`);
                                return;
                              }
                              onSendRequest(row);
                            }}
                            title={sendBarrierMerged ?? 'שליחת בקשה במייל'}
                          >
                            {sendingRowKey === String(row.id ?? idx) ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                שולח...
                              </span>
                            ) : (
                              'שלח בקשה'
                            )}
                          </Button>
                          {(() => {
                            const reason = requestDisabledReason(row);
                            if (!reason) return null;
                            const fixHref = driverEmailFixHref?.(row) ?? null;
                            const emailRelated =
                              reason.includes('אימייל') || reason.includes('מייל') || reason.includes('email');
                            if (fixHref && emailRelated) {
                              return (
                                <Link
                                  to={fixHref}
                                  className="block max-w-[14rem] text-right text-[11px] font-medium text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
                                >
                                  {reason}
                                </Link>
                              );
                            }
                            return <span className="text-[11px] text-amber-300/90">{reason}</span>;
                          })()}
                        </>
                      ) : null}

                      {tabKey === 'driver_license' && String(row.status ?? '').trim().toLowerCase() === 'pending_approval' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const url = String(row.license_front_url ?? '').trim();
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            disabled={!String(row.license_front_url ?? '').trim()}
                          >
                            לצפיה
                          </Button>
                          <div className="flex min-w-[10rem] flex-col items-end gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">תוקף</span>
                            <FleetDatePicker
                              id={rowEntityId ? `approve-license-inline-${rowEntityId}` : undefined}
                              value={getApproveDateValue(row)}
                              onChange={(next) => setApproveDateValue(row, next)}
                              slashDisplay="compact"
                              className="[&_input]:h-10 [&_input]:w-full [&_input]:min-w-[10.5rem] sm:[&_input]:w-44"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onApproveLicense(row)}
                            disabled={!getApproveDateValue(row).trim() || isApprovingRow(row)}
                          >
                            {isApprovingRow(row) ? 'מאשר…' : 'אישור'}
                          </Button>
                        </>
                      ) : null}
                      {pendingVehicleRen && onApproveVehicleRenewal && !hideLeasingPendingInlineActions ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(pendingVehicleRen.previewUrl, '_blank', 'noopener,noreferrer')}
                            disabled={!String(pendingVehicleRen.previewUrl ?? '').trim()}
                          >
                            צפייה במסמך
                          </Button>
                          <span className="max-w-[10rem] text-right text-[10px] text-amber-200/95">
                            ממתין לאישור · תוקף מוצע {pendingVehicleRen.proposedExpiry}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onApproveVehicleRenewal(pendingVehicleRen.requestId)}
                            disabled={approvingVehicleRenewalId === pendingVehicleRen.requestId}
                          >
                            {approvingVehicleRenewalId === pendingVehicleRen.requestId ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                מאשר…
                              </span>
                            ) : (
                              'אישור והחלה'
                            )}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 align-middle text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={Boolean(rowEntityId && bulkSendSelectionIds.has(rowEntityId))}
                        disabled={!gate.canSelectBulk || bulkSending || sendingRowKey === rowEntityId}
                        onCheckedChange={(v) => {
                          if (!rowEntityId) return;
                          onBulkToggleRow(rowEntityId, v === true);
                        }}
                        aria-label="בחר שורה לשליחה מרוכזת"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminCompliancePage() {
  const { isAdmin, activeOrgId, profile, user, hasPermission } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionEmailCompliance = resolveSessionEmail(profile, user);
  const platformOwnerCompliance = isPlatformSuperOwnerEmail(sessionEmailCompliance);
  /** מקור אמת לסקופ צי; לבעל פלטפורמה — לא להסתמך על profile.org_id כשהמתג עדיין לא אתחל (ארגון שגוי). */
  const orgId = (
    platformOwnerCompliance
      ? ((activeOrgId ?? '').trim() || effectiveOrgId)
      : (effectiveOrgId ?? activeOrgId ?? profile?.org_id ?? null)
  ) as string | null;

  const canAccessAdminComplianceCenter = Boolean(
    hasPermission('compliance') ||
      hasPermission('admin_access') ||
      isAdmin ||
      profile?.is_system_admin === true ||
      isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user)) ||
      isFleetOrgAdminFallbackEmail(resolveSessionEmail(profile, user)),
  );
  const [leasingOpen, setLeasingOpen] = useState(false);
  const [leasingContext, setLeasingContext] = useState<{
    row: Record<string, unknown>;
    tab: (typeof TAB_DEFS)[number];
  } | null>(null);
  const [leasingEmail, setLeasingEmail] = useState('');
  const [leasingSending, setLeasingSending] = useState(false);
  const [leasingApprovalsOpen, setLeasingApprovalsOpen] = useState(false);
  const [resendLeasingDialog, setResendLeasingDialog] = useState<{ requestId: string } | null>(null);
  const [resendNote, setResendNote] = useState('');
  const [resendSending, setResendSending] = useState(false);
  const [resendDriverLicenseDialog, setResendDriverLicenseDialog] = useState<string | null>(null);
  const [resendDriverNote, setResendDriverNote] = useState('');
  const [resendDriverSending, setResendDriverSending] = useState(false);
  const [approvingRenewalId, setApprovingRenewalId] = useState<string | null>(null);
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: drivers = [], isLoading: driversLoading, refetch: refetchDrivers } = useQuery({
    queryKey: ['admin-compliance-drivers', orgId],
    enabled: canAccessAdminComplianceCenter && orgId != null,
    staleTime: 0,
    queryFn: async () => {
      if (!orgId) return [] as Driver[];
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('org_id', orgId)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  });

  const authUserId = String(user?.id ?? '').trim() || 'anon';
  useEffect(() => {
    // ניקוי מיידי של רמזים עתיקים (לפי משתמש) גם אם לא נפתחו טבלאות עדיין
    pruneExpiredTowerHintsPersisted(authUserId);
  }, [authUserId]);

  type OpenComplianceRow = {
    driver_id: string | null;
    entity_type: string | null;
    entity_id: string | null;
    task_key: string | null;
    status: string;
    sent_at: string;
    metadata: unknown;
    updated_at: string | null;
    created_at: string | null;
  };
  const {
    data: openComplianceRequests = [],
    error: openComplianceRequestsError,
    isError: openComplianceRequestsIsError,
  } = useQuery({
    queryKey: ['admin-compliance-open-requests', orgId],
    enabled: Boolean(canAccessAdminComplianceCenter && orgId),
    staleTime: 0,
    retry: 2,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<OpenComplianceRow[]> => {
      if (!orgId) return [];
      /** RPC מעקף RLS שמסנן SELECT ריק למרות שורות קיימות — מיגרציה 20260514100000 */
      const rpc = await supabase.rpc('compliance_open_requests_for_org', { p_org_id: orgId });
      if (!rpc.error && rpc.data != null) {
        return (rpc.data ?? []) as OpenComplianceRow[];
      }
      const rpcMsg = String(rpc.error?.message ?? '');
      if (
        rpc.error &&
        !/does not exist|could not find|schema cache|42883|PGRST202/i.test(rpcMsg)
      ) {
        throw rpc.error;
      }
      const { data, error } = await supabase
        .from('compliance_requests')
        .select('driver_id, entity_type, entity_id, task_key, status, sent_at, metadata, updated_at, created_at')
        .eq('org_id', orgId)
        .in('status', ['sent', 'opened', 'pending_admin_review']);
      if (error) throw error;
      return (data ?? []) as OpenComplianceRow[];
    },
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  });

  type PendingVehicleRenewalRow = {
    id: string;
    entity_id: string;
    task_key: string;
    task_label: string | null;
    proposed_expiry_date: string | null;
    submitted_document_url: string | null;
    external_recipient_email: string | null;
    request_url: string | null;
  };
  /** שורות מהשרת שגוף ה-404/409 מזהה במזהה — RPC מעקף RLS כשנדרש */
  const [injectedVehiclePendingRenewals, setInjectedVehiclePendingRenewals] = useState<
    PendingVehicleRenewalRow[]
  >([]);
  const {
    data: pendingVehicleRenewalsRaw = [],
    refetch: refetchPendingVehicleRenewals,
    error: pendingVehicleRenewalsError,
    isError: pendingVehicleRenewalsIsError,
  } = useQuery({
    queryKey: ['admin-pending-vehicle-renewals', orgId],
    enabled: Boolean(canAccessAdminComplianceCenter && orgId),
    staleTime: 0,
    retry: 1,
    queryFn: async (): Promise<PendingVehicleRenewalRow[]> => {
      if (!orgId) return [];
      /** RPC כדי לעקוף RLS צר על SELECT ישיר; מיגרציה 20260512100000 */
      const { data, error } = await supabase.rpc('compliance_pending_vehicle_renewals_for_org', {
        p_org_id: orgId,
      });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows
        .map((raw) => ({
          id: String(raw.id ?? '').trim(),
          entity_id: String(raw.entity_id ?? '').trim(),
          task_key: String(raw.task_key ?? '').trim(),
          task_label: raw.task_label != null ? String(raw.task_label) : null,
          proposed_expiry_date:
            raw.proposed_expiry_date != null ? String(raw.proposed_expiry_date).slice(0, 10) : null,
          submitted_document_url:
            raw.submitted_document_url != null ? String(raw.submitted_document_url) : null,
          external_recipient_email:
            raw.external_recipient_email != null ? String(raw.external_recipient_email) : null,
          request_url: raw.request_url != null ? String(raw.request_url) : null,
        }))
        .filter((r) => r.id.length > 0);
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  const pendingRenewalsLoadErrShown = useRef(false);
  useEffect(() => {
    if (pendingVehicleRenewalsIsError && pendingVehicleRenewalsError) {
      if (!pendingRenewalsLoadErrShown.current) {
        pendingRenewalsLoadErrShown.current = true;
        toast.error(
          `לא נטענו הגשות ליסינג ממתינות (הרץ מיגרציה 20260512100000 אם חסר RPC): ${pendingVehicleRenewalsError.message}`,
          { duration: 14_000 },
        );
      }
    } else {
      pendingRenewalsLoadErrShown.current = false;
    }
  }, [pendingVehicleRenewalsIsError, pendingVehicleRenewalsError]);

  useEffect(() => {
    const rawIds = new Set(pendingVehicleRenewalsRaw.map((r) => String(r.id)));
    setInjectedVehiclePendingRenewals((prev) =>
      prev.filter((r) => !rawIds.has(String(r.id))),
    );
  }, [pendingVehicleRenewalsRaw]);

  const pendingVehicleRenewalsMerged = useMemo(() => {
    const byId = new Map<string, PendingVehicleRenewalRow>();
    for (const r of pendingVehicleRenewalsRaw) byId.set(String(r.id), r);
    for (const r of injectedVehiclePendingRenewals) {
      const id = String(r.id);
      if (!byId.has(id)) byId.set(id, r);
    }
    return [...byId.values()];
  }, [pendingVehicleRenewalsRaw, injectedVehiclePendingRenewals]);

  const pendingRenewalByVehicleTask = useMemo(() => {
    const m = new Map<string, { requestId: string; previewUrl: string; proposedExpiry: string }>();
    for (const r of pendingVehicleRenewalsMerged) {
      const vid = String(r.entity_id ?? '').trim();
      const tk = String(r.task_key ?? '').trim();
      if (!vid || !tk) continue;
      m.set(`${vid}::${tk}`, {
        requestId: r.id,
        previewUrl: String(r.submitted_document_url ?? '').trim(),
        proposedExpiry: String(r.proposed_expiry_date ?? '').slice(0, 10),
      });
    }
    return m;
  }, [pendingVehicleRenewalsMerged]);

  const pendingRenewalsDialogRows = useMemo(() => {
    const plateById = new Map(vehicles.map((v) => [String(v.id), String(v.plate_number ?? '')]));
    return pendingVehicleRenewalsMerged.map((r) => ({
      ...r,
      plate: plateById.get(String(r.entity_id ?? '').trim()) ?? '—',
    }));
  }, [pendingVehicleRenewalsMerged, vehicles]);

  /** תואם תג «ממתין לאישור מנהל» בטבלאות נהגים — לא רק הגשות טסט/ביטוח מליסינג */
  const driversPendingManagerApproval = useMemo(
    () => drivers.filter((d) => String(d.status ?? '').trim().toLowerCase() === 'pending_approval'),
    [drivers],
  );

  const pendingManagerApprovalTotal =
    pendingVehicleRenewalsMerged.length + driversPendingManagerApproval.length;

  /** מוצג מיד אחרי «שלח בקשה» עד שהשרת מחזיר שורה ב־compliance_requests (מונע תחושה ש«כלום לא קרה») */
  const [optimisticCompliancePending, setOptimisticCompliancePending] = useState<
    Record<string, { sentAt: string; notifySequence?: number }>
  >({});
  const [optimisticVehicleCompliancePending, setOptimisticVehicleCompliancePending] = useState<
    Record<string, { sentAt: string; notifySequence?: number }>
  >({});

  const openComplianceLoadErrShown = useRef(false);
  useEffect(() => {
    if (openComplianceRequestsIsError && openComplianceRequestsError) {
      if (!openComplianceLoadErrShown.current) {
        openComplianceLoadErrShown.current = true;
        toast.error(
          `לא נטענו בקשות ציות מהמסד (סטטוס «ממתין» עלול לא להופיע): ${openComplianceRequestsError.message}`,
          { duration: 14_000 },
        );
      }
    } else {
      openComplianceLoadErrShown.current = false;
    }
  }, [openComplianceRequestsIsError, openComplianceRequestsError]);

  /** כשהשרת מחזיר שורת בקשה פתוחה — הרמז ב-sessionStorage מיותר */
  useEffect(() => {
    const oid = String(orgId ?? '').trim();
    if (!oid) return;
    const all = readTowerSentHints(authUserId);
    let changed = false;
    const next = { ...all };
    for (const r of openComplianceRequests) {
      const t = String(r.task_key ?? '').trim();
      if (!t) continue;
      const ids = new Set<string>();
      const eid = String(r.entity_id ?? '').trim();
      const did = String(r.driver_id ?? '').trim();
      if (eid) ids.add(eid);
      if (did) ids.add(did);
      for (const id of ids) {
        const sk = towerHintStorageKey(oid, id, t);
        if (next[sk]) {
          delete next[sk];
          changed = true;
        }
      }
    }
    if (changed) writeTowerSentHints(authUserId, next);
  }, [openComplianceRequests, orgId, authUserId]);

  useEffect(() => {
    setOptimisticCompliancePending((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const r of openComplianceRequests) {
        const t = String(r.task_key ?? '').trim();
        if (!t) continue;
        const d = String(r.driver_id ?? '').trim();
        const et = String(r.entity_type ?? '').trim();
        const eid = String(r.entity_id ?? '').trim();
        if (d) delete next[`${d}::${t}`];
        if (et === 'driver' && eid) delete next[`${eid}::${t}`];
      }
      return next;
    });
    setOptimisticVehicleCompliancePending((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const r of openComplianceRequests) {
        const t = String(r.task_key ?? '').trim();
        const et = String(r.entity_type ?? '').trim();
        const eid = String(r.entity_id ?? '').trim();
        if (et === 'vehicle' && eid && t) delete next[`${eid}::${t}`];
      }
      return next;
    });
  }, [openComplianceRequests]);

  /** עדכון מיידי כשעובד חותם בטופס ציבורי — בלי רענון ידני */
  useEffect(() => {
    if (!canAccessAdminComplianceCenter || !orgId) return;

    const invalidateTower = () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-compliance-drivers', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-pending-vehicle-renewals', orgId] });
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });
      void queryClient.invalidateQueries({ queryKey: ['driver'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    };

    const channel = supabase
      .channel(`admin-compliance-realtime-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drivers',
          filter: `org_id=eq.${orgId}`,
        },
        invalidateTower,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'compliance_requests',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          invalidateTower();
          const oid = String(orgId ?? '').trim();
          if (!oid) return;
          type Rowish = { entity_id?: unknown; driver_id?: unknown; task_key?: unknown; status?: unknown };
          if (payload.eventType === 'DELETE') {
            const oldRow = (payload.old ?? {}) as Rowish;
            const tk = String(oldRow.task_key ?? '').trim();
            if (!tk) return;
            const eid = String(oldRow.entity_id ?? '').trim();
            const did = String(oldRow.driver_id ?? '').trim();
            if (eid) removeTowerSentHint(authUserId, oid, eid, tk);
            if (did && did !== eid) removeTowerSentHint(authUserId, oid, did, tk);
            return;
          }
          const row = payload.new as Rowish | null;
          if (!row) return;
          const st = String(row.status ?? '').trim().toLowerCase();
          if (st === 'completed' || st === 'expired') {
            const tk = String(row.task_key ?? '').trim();
            if (!tk) return;
            const eid = String(row.entity_id ?? '').trim();
            const did = String(row.driver_id ?? '').trim();
            if (eid) removeTowerSentHint(authUserId, oid, eid, tk);
            if (did && did !== eid) removeTowerSentHint(authUserId, oid, did, tk);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canAccessAdminComplianceCenter, orgId, queryClient, authUserId]);

  /** בקשות שלא נסגרו (כולל ממתין לאישור מנהל אחרי הגשת נציג) — כדי שהסטטוס לא ייעלם ברענון */
  const openComplianceByEntityTask = useMemo(() => {
    type SentMeta = { sentAt: string; status: string; notifySequence?: number; updatedAt?: string };
    const m = new Map<string, SentMeta>();
    const statusRank: Record<string, number> = { pending_admin_review: 3, opened: 2, sent: 1 };
    const sorted = [...openComplianceRequests].sort((a, b) => {
      const ra = statusRank[String(a.status)] ?? 0;
      const rb = statusRank[String(b.status)] ?? 0;
      if (rb !== ra) return rb - ra;
      const ts = (x: OpenComplianceRow) =>
        Date.parse(String(x.sent_at ?? '').trim()) ||
        Date.parse(String(x.created_at ?? '').trim()) ||
        Date.parse(String(x.updated_at ?? '').trim()) ||
        0;
      return ts(b) - ts(a);
    });
    const seen = new Set<string>();
    const push = (key: string, r: OpenComplianceRow) => {
      if (seen.has(key)) return;
      seen.add(key);
      const seq = parseComplianceNotifySequence(r.metadata);
      const rawSent = String(r.sent_at ?? '').trim();
      const rawCreated = String(r.created_at ?? '').trim();
      const rawUpd = String(r.updated_at ?? '').trim();
      const sentAtEffective = rawSent || rawCreated || rawUpd;
      const entry: SentMeta = {
        sentAt: sentAtEffective,
        status: String(r.status ?? '').trim() || 'sent',
      };
      if (seq != null) entry.notifySequence = seq;
      const ua = r.updated_at != null ? String(r.updated_at).trim() : '';
      if (ua) entry.updatedAt = ua;
      m.set(key, entry);
    };
    for (const r of sorted) {
      const t = String(r.task_key ?? '').trim();
      if (!t) continue;
      const et = String(r.entity_type ?? '').trim();
      const eid = String(r.entity_id ?? '').trim();
      if (et === 'vehicle' && eid) {
        push(`${eid}::${t}`, r);
        continue;
      }
      /** רישיון נהיגה וכו' — השורה בטבלה היא לפי entity_id (נהג); לא הסתמכות בלבד על driver_id שניתן שיימש עם null במסד ישן */
      if (et === 'driver' && eid) {
        push(`${eid}::${t}`, r);
        continue;
      }
      const d = String(r.driver_id ?? '').trim();
      if (d) push(`${d}::${t}`, r);
    }
    for (const [k, v] of Object.entries(optimisticCompliancePending)) {
      if (!m.has(k) && v?.sentAt) {
        const entry: SentMeta = { sentAt: v.sentAt, status: 'sent' };
        if (v.notifySequence != null) entry.notifySequence = v.notifySequence;
        m.set(k, entry);
      }
    }
    for (const [k, v] of Object.entries(optimisticVehicleCompliancePending)) {
      if (!m.has(k) && v?.sentAt) {
        const entry: SentMeta = { sentAt: v.sentAt, status: 'sent' };
        if (v.notifySequence != null) entry.notifySequence = v.notifySequence;
        m.set(k, entry);
      }
    }
    const oid = String(orgId ?? '').trim();
    if (oid) {
      const now = Date.now();
      const hints = readTowerSentHints(authUserId);
      for (const [storageKey, hint] of Object.entries(hints)) {
        const parsed = parseTowerHintStorageKey(storageKey);
        if (!parsed || parsed.orgId !== oid) continue;
        const sent = Date.parse(hint.sentAt);
        if (!Number.isFinite(sent) || now - sent > TOWER_HINT_MAX_AGE_MS) continue;
        const mapKey = mapKeyFromEntityTask(parsed.entityId, parsed.taskKey);
        if (!m.has(mapKey)) {
          const entry: SentMeta = { sentAt: hint.sentAt, status: 'sent' };
          if (hint.notifySequence != null) entry.notifySequence = hint.notifySequence;
          m.set(mapKey, entry);
        }
      }
    }
    return m;
  }, [openComplianceRequests, optimisticCompliancePending, optimisticVehicleCompliancePending, orgId, authUserId]);

  const [viewFilter, setViewFilter] = useState<TowerViewFilter>('urgent');
  const [customRangeFromDays, setCustomRangeFromDays] = useState(-30);
  const [customRangeToDays, setCustomRangeToDays] = useState(30);
  const [sendingRowKey, setSendingRowKey] = useState<string | null>(null);
  const [approvingRowKey, setApprovingRowKey] = useState<string | null>(null);
  const [approveExpiryByDriverId, setApproveExpiryByDriverId] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ComplianceTabKey>('annual_licensing');
  const complianceReturnUrl = useMemo(
    () => `/admin/compliance?tab=${encodeURIComponent(activeTab)}`,
    [activeTab],
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TAB_DEFS.some((x) => x.key === t)) {
      setActiveTab(t as ComplianceTabKey);
    }
  }, [searchParams]);

  const handleComplianceTabChange = (v: string) => {
    const key = v as ComplianceTabKey;
    setActiveTab(key);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );
  };

  const [bulkSendSelectionIds, setBulkSendSelectionIds] = useState<Set<string>>(() => new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [visibleByTab, setVisibleByTab] = useState<Record<ComplianceTabKey, string[]>>({
    annual_licensing: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    insurance: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    periodic_inspection: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    maintenance: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    driver_license: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
    health_declaration: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
    regulation_585: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
  });
  const [defaultVisibleByTab, setDefaultVisibleByTab] = useState<Record<ComplianceTabKey, string[]>>({
    annual_licensing: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    insurance: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    periodic_inspection: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    maintenance: appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
    driver_license: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
    health_declaration: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
    regulation_585: appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
  });

  const todayIso = useMemo(() => isoYmdTodayLocal(), []);
  const customFromIso = useMemo(() => addDaysToIsoYmd(todayIso, customRangeFromDays), [todayIso, customRangeFromDays]);
  const customToIso = useMemo(() => addDaysToIsoYmd(todayIso, customRangeToDays), [todayIso, customRangeToDays]);
  const customMinIso = customFromIso <= customToIso ? customFromIso : customToIso;
  const customMaxIso = customFromIso <= customToIso ? customToIso : customFromIso;

  useEffect(() => {
    setBulkSendSelectionIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (vehiclesLoading || driversLoading) return;
    if (!import.meta.env.DEV) return;
    const vehiclePreview = (vehicles as Array<Record<string, unknown>>).slice(0, 5).map((v) => ({
      id: v.id,
      plate_number: v.plate_number,
      test_expiry: v.test_expiry,
      insurance_expiry: v.insurance_expiry,
      next_inspection_date: v.next_inspection_date,
      next_maintenance_date: v.next_maintenance_date,
      org_id: v.org_id,
    }));
    const driverPreview = (drivers as Array<Record<string, unknown>>).slice(0, 5).map((d) => ({
      id: d.id,
      full_name: d.full_name,
      license_expiry: d.license_expiry,
      health_declaration_date: d.health_declaration_date,
      regulation_585b_date: d.regulation_585b_date,
      org_id: d.org_id,
    }));

    console.debug('[AdminCompliancePage] Raw Supabase rows before filtering', {
      orgId,
      range: { todayIso },
      viewFilter,
      customRange: {
        fromDays: customRangeFromDays,
        toDays: customRangeToDays,
        minIso: customMinIso,
        maxIso: customMaxIso,
      },
      vehiclesCount: vehicles.length,
      driversCount: drivers.length,
      vehiclePreview,
      driverPreview,
    });

    if (!orgId) {
      console.warn('[AdminCompliancePage] Missing orgId - this may prevent org-scoped rows from appearing.');
    }
    if (vehicles.length === 0 || drivers.length === 0) {
      console.warn('[AdminCompliancePage] One or more sources are empty; check RLS policies and table data.', {
        vehiclesCount: vehicles.length,
        driversCount: drivers.length,
      });
    }
  }, [
    vehiclesLoading,
    driversLoading,
    vehicles,
    drivers,
    orgId,
    todayIso,
    viewFilter,
    customRangeFromDays,
    customRangeToDays,
    customMinIso,
    customMaxIso,
  ]);

  const tabData = useMemo(() => {
    const out = {} as Record<ComplianceTabKey, Array<Record<string, unknown>>>;
    for (const tab of TAB_DEFS) {
      const sourceRows = tab.source === 'vehicle' ? (vehicles as Array<Record<string, unknown>>) : (drivers as Array<Record<string, unknown>>);
      let rows = sourceRows
        .filter((row) => {
          const dueRaw = complianceDueRawForRow(tab.key, tab.dueField, row);
          const dueIso = dueIsoFromRaw(dueRaw);
          if (!dueIso) return false;
          const d = daysUntil(dueRaw);
          if (viewFilter === 'all') return true;
          if (viewFilter === 'urgent') {
            return d != null && complianceDueBand(d) === 'red';
          }
          if (viewFilter === 'expiring_soon') {
            return d != null && complianceDueBand(d) === 'yellow';
          }
          return dueIso >= customMinIso && dueIso <= customMaxIso;
        })
        .sort((a, b) => {
          const aIso = dueIsoFromRaw(complianceDueRawForRow(tab.key, tab.dueField, a)) ?? '9999-12-31';
          const bIso = dueIsoFromRaw(complianceDueRawForRow(tab.key, tab.dueField, b)) ?? '9999-12-31';
          return aIso.localeCompare(bIso);
        });

      if (tab.key === 'health_declaration') {
        rows = rows.map((row) => {
          const id = String(row.id ?? '').trim();
          const pendingMeta = id ? openComplianceByEntityTask.get(`${id}::health_declaration`) : undefined;
          const dueDaysHealth = daysUntil(row.health_declaration_date);
          const hasHealthUrl = Boolean(
            String((row as Record<string, unknown>).health_declaration_url ?? '').trim(),
          );
          /** נחשב «הושלם מבחינת נהג» כשיש תאריך תקף וקישור — גם אם בקשת ציות נשארה stat=sent בגלל כשל סגירה בשרת או בקשה כפולה */
          const healthLooksComplete =
            hasHealthUrl && dueDaysHealth != null && dueDaysHealth >= 0;
          const awaiting = Boolean(id && pendingMeta && !healthLooksComplete);
          return {
            ...row,
            __awaitingEmployeeSignature: awaiting,
            __compliancePendingMeta: awaiting ? (pendingMeta ?? null) : null,
          };
        });
      }

      rows = rows.map((row) => {
        const id = String(row.id ?? '').trim();
        const meta = id ? openComplianceByEntityTask.get(`${id}::${tab.key}`) : undefined;
        return {
          ...row,
          __complianceSentMeta: meta ?? null,
        };
      });

      out[tab.key] = rows;
    }
    return out;
  }, [
    drivers,
    vehicles,
    todayIso,
    viewFilter,
    customMinIso,
    customMaxIso,
    openComplianceByEntityTask,
  ]);

  const loading = vehiclesLoading || driversLoading;
  const focusHighlightId = searchParams.get('focus')?.trim() || undefined;

  useEffect(() => {
    if (!focusHighlightId || loading) return;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      document.getElementById(`compliance-focus-${focusHighlightId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    };
    const t1 = window.setTimeout(tryScroll, 200);
    const t2 = window.setTimeout(tryScroll, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focusHighlightId, loading, activeTab]);

  const activeDef = TAB_DEFS.find((t) => t.key === activeTab) ?? TAB_DEFS[0];
  const availableVehicleKeys = useMemo(
    () => availableKeysFromRows(vehicles as Array<Record<string, unknown>>),
    [vehicles],
  );
  const availableDriverKeys = useMemo(
    () => availableKeysFromRows(drivers as Array<Record<string, unknown>>),
    [drivers],
  );
  const filteredVehicleColumns = useMemo(
    () => filterKeysByAvailable(VEHICLE_KEYS, availableVehicleKeys),
    [availableVehicleKeys],
  );
  const filteredDriverColumns = useMemo(
    () => filterKeysByAvailable(DRIVER_KEYS, availableDriverKeys),
    [availableDriverKeys],
  );
  const currentAllColumns = useMemo(() => {
    const base = activeDef.source === 'vehicle' ? filteredVehicleColumns : filteredDriverColumns;
    return [...base, COMPLIANCE_COLUMN_SEND_STATUS];
  }, [activeDef.source, filteredVehicleColumns, filteredDriverColumns]);
  const columnPickerTriggerLabel = useMemo(() => {
    const sel = visibleByTab[activeTab] ?? [];
    const dataKeys = sel.filter((k) => k !== COMPLIANCE_COLUMN_SEND_STATUS).length;
    const sendOn = sel.includes(COMPLIANCE_COLUMN_SEND_STATUS);
    /** שדות מהבורר + תאריך יעד לטאב + ימים + סטטוס + [סטטוס שליחה] + פעולות + צ׳קבוקס */
    const totalInTable = dataKeys + 5 + (sendOn ? 1 : 0);
    const parts: string[] = [];
    if (dataKeys > 0) parts.push(`${dataKeys} שדות מהרשימה`);
    if (sendOn) parts.push('סטטוס שליחה');
    const selText =
      parts.length > 0 ? parts.join(' · ') : 'ללא שדות נתונים נוספים מהרשימה';
    return `בחירת עמודות · בטבלה ${totalInTable} (${selText})`;
  }, [visibleByTab, activeTab]);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(COMPLIANCE_COLUMNS_DEFAULTS_KEY);
      if (!raw) {
        const legacyRaw = localStorage.getItem(COMPLIANCE_COLUMNS_DEFAULTS_LEGACY_KEY);
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw) as Partial<Record<ComplianceTabKey, string[]>>;
          const migrated: Record<ComplianceTabKey, string[]> = {
            annual_licensing: appendSendStatusColumnKey(
              legacyParsed.annual_licensing?.length ? [...legacyParsed.annual_licensing] : [...VEHICLE_DEFAULT_COLUMNS],
            ),
            insurance: appendSendStatusColumnKey(
              legacyParsed.insurance?.length ? [...legacyParsed.insurance] : [...VEHICLE_DEFAULT_COLUMNS],
            ),
            periodic_inspection: appendSendStatusColumnKey(
              legacyParsed.periodic_inspection?.length ? [...legacyParsed.periodic_inspection] : [...VEHICLE_DEFAULT_COLUMNS],
            ),
            maintenance: appendSendStatusColumnKey(
              legacyParsed.maintenance?.length ? [...legacyParsed.maintenance] : [...VEHICLE_DEFAULT_COLUMNS],
            ),
            driver_license: appendSendStatusColumnKey(
              legacyParsed.driver_license?.length ? [...legacyParsed.driver_license] : [...DRIVER_DEFAULT_COLUMNS],
            ),
            health_declaration: appendSendStatusColumnKey(
              legacyParsed.health_declaration?.length ? [...legacyParsed.health_declaration] : [...DRIVER_DEFAULT_COLUMNS],
            ),
            regulation_585: appendSendStatusColumnKey(
              legacyParsed.regulation_585?.length ? [...legacyParsed.regulation_585] : [...DRIVER_DEFAULT_COLUMNS],
            ),
          };
          localStorage.setItem(COMPLIANCE_COLUMNS_DEFAULTS_KEY, JSON.stringify(migrated));
          localStorage.removeItem(COMPLIANCE_COLUMNS_DEFAULTS_LEGACY_KEY);
          raw = JSON.stringify(migrated);
        }
      }
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ComplianceTabKey, string[]>>;
      const merged = {
        annual_licensing:
          parsed.annual_licensing != null && parsed.annual_licensing.length > 0
            ? parsed.annual_licensing
            : appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
        insurance:
          parsed.insurance != null && parsed.insurance.length > 0
            ? parsed.insurance
            : appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
        periodic_inspection:
          parsed.periodic_inspection != null && parsed.periodic_inspection.length > 0
            ? parsed.periodic_inspection
            : appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
        maintenance:
          parsed.maintenance != null && parsed.maintenance.length > 0
            ? parsed.maintenance
            : appendSendStatusColumnKey([...VEHICLE_DEFAULT_COLUMNS]),
        driver_license:
          parsed.driver_license != null && parsed.driver_license.length > 0
            ? parsed.driver_license
            : appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
        health_declaration:
          parsed.health_declaration != null && parsed.health_declaration.length > 0
            ? parsed.health_declaration
            : appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
        regulation_585:
          parsed.regulation_585 != null && parsed.regulation_585.length > 0
            ? parsed.regulation_585
            : appendSendStatusColumnKey([...DRIVER_DEFAULT_COLUMNS]),
      } as Record<ComplianceTabKey, string[]>;
      setDefaultVisibleByTab((prev) => ({
        annual_licensing: merged.annual_licensing ?? prev.annual_licensing,
        insurance: merged.insurance ?? prev.insurance,
        periodic_inspection: merged.periodic_inspection ?? prev.periodic_inspection,
        maintenance: merged.maintenance ?? prev.maintenance,
        driver_license: merged.driver_license ?? prev.driver_license,
        health_declaration: merged.health_declaration ?? prev.health_declaration,
        regulation_585: merged.regulation_585 ?? prev.regulation_585,
      }));
      setVisibleByTab(merged);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const missingVehicle = VEHICLE_KEYS.filter((k) => !availableVehicleKeys.has(k));
    const missingDriver = DRIVER_KEYS.filter((k) => !availableDriverKeys.has(k));
    if (missingVehicle.length > 0) {
      console.debug(
        '[AdminCompliancePage] Vehicle field keys not present on loaded rows (older DB schema or omitted columns):',
        missingVehicle,
      );
    }
    if (missingDriver.length > 0) {
      console.debug(
        '[AdminCompliancePage] Driver field keys not present on loaded rows (older DB schema or omitted columns):',
        missingDriver,
      );
    }
  }, [availableVehicleKeys, availableDriverKeys]);

  useEffect(() => {
    if (vehiclesLoading || driversLoading) return;
    setVisibleByTab((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const tab of TAB_DEFS) {
        const avail = tab.source === 'vehicle' ? availableVehicleKeys : availableDriverKeys;
        const norm = normalizeComplianceTabColumns(tab, prev[tab.key], avail);
        if (prev[tab.key].join('|') !== norm.join('|')) {
          next[tab.key] = norm;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availableVehicleKeys, availableDriverKeys, vehiclesLoading, driversLoading]);

  const requestDisabledReason = (
    tab: { source: ComplianceSource; key: ComplianceTabKey },
    row: Record<string, unknown>,
  ): string | null => {
    if (tab.source === 'driver') {
      const directEmail = String(row.email ?? '').trim();
      const fallbackById = drivers.find((x) => String(x.id) === String(row.id ?? '').trim());
      const fallbackByIdentity = drivers.find(
        (x) =>
          String(x.full_name ?? '').trim() === String(row.full_name ?? '').trim() &&
          String(x.id_number ?? '').trim() === String(row.id_number ?? '').trim(),
      );
      const email = directEmail || String(fallbackById?.email ?? '').trim() || String(fallbackByIdentity?.email ?? '').trim();
      return email ? null : 'אין אימייל לנהג';
    }
    if (tab.key === 'annual_licensing' || tab.key === 'insurance') {
      return null;
    }
    const assignedDriverId = String(row.assigned_driver_id ?? '').trim();
    if (!assignedDriverId) return 'לרכב אין נהג משויך';
    const d = drivers.find((x) => String(x.id) === assignedDriverId);
    const email = String(d?.email ?? '').trim();
    if (!email) return 'לנהג המשויך אין אימייל';
    return null;
  };

  const submitComplianceRequest = async (
    tab: { key: ComplianceTabKey; label: string; source: ComplianceSource; dueField: string },
    row: Record<string, unknown>,
    options?: { silent?: boolean; admin_note?: string },
  ): Promise<boolean> => {
    const quiet = options?.silent === true;
    const adminNote = typeof options?.admin_note === 'string' ? options.admin_note.trim() : '';
    if (tab.key === 'annual_licensing' || tab.key === 'insurance') {
      if (!quiet) {
        toast.error('רישוי שנתי וביטוח נשלחים דרך נציג ליסינג: לחצו «שלח בקשה», הזינו מייל בחלון ואשרו.');
      }
      return false;
    }
    const orgIdRequired = String(orgId ?? '').trim();
    if (!orgIdRequired) {
      if (!quiet) toast.error('לא ניתן לשלוח בקשה: חסר org_id.');
      return false;
    }

    const rowKey = String(row.id ?? '');
    if (!rowKey) {
      if (!quiet) toast.error('לא ניתן לשלוח בקשה: רשומה ללא מזהה.');
      return false;
    }

    let driverEmail = '';
    let driverId = '';
    let driverName = '';
    const entityType = tab.source;

    if (entityType === 'driver') {
      driverId = String(row.id ?? '');
      driverEmail = String(row.email ?? '').trim().toLowerCase();
      driverName = String(row.full_name ?? '').trim();
    } else {
      const assignedDriverId = String(row.assigned_driver_id ?? '').trim();
      if (!assignedDriverId) {
        if (!quiet) toast.error('לרכב אין נהג משויך ולכן לא ניתן לשלוח בקשה.');
        return false;
      }
      const d = drivers.find((x) => String(x.id) === assignedDriverId);
      driverId = assignedDriverId;
      driverEmail = String(d?.email ?? '').trim().toLowerCase();
      driverName = String(d?.full_name ?? '').trim();
    }

    if (!driverEmail || !driverEmail.includes('@')) {
      if (!quiet) toast.error('לא נמצא אימייל תקין לנהג עבור שליחת בקשה.');
      return false;
    }

    if (!quiet) setSendingRowKey(rowKey);
    try {
      const dueIso = dueIsoFromRaw(row[tab.dueField]);
      const { data, error } = await invokeSupabaseEdgeFunction('send-compliance-request', {
        org_id: orgIdRequired,
        entity_type: entityType,
        entity_id: rowKey,
        task_key: tab.key,
        task_label: tab.label,
        tab_label: tab.label,
        due_field: tab.dueField,
        due_date: dueIso,
        driver_id: driverId,
        driver_email: driverEmail,
        driver_name: driverName,
        cta_text: REQUEST_CTA_BY_TAB[tab.key],
        ...(adminNote ? { admin_note: adminNote } : {}),
      });

      const earlyPayload = normalizeInvokePayload(data);
      if (!error && earlyPayload) {
        const earlyErr =
          typeof earlyPayload.error === 'string' && earlyPayload.error.trim().length > 0
            ? earlyPayload.error.trim()
            : null;
        if (earlyErr && earlyPayload.success !== true) {
          throw new Error(earlyErr);
        }
      }

      if (error) {
        let detailed = error.message ?? 'שגיאה בשליחת הבקשה';
        const context = (error as unknown as { context?: Response }).context;
        if (context) {
          try {
            const body = (await context.json()) as { error?: string; message?: string };
            detailed = body.error || body.message || detailed;
          } catch {
            try {
              const txt = await context.text();
              if (txt?.trim()) detailed = txt;
            } catch {
              // noop
            }
          }
        }
        throw new Error(detailed);
      }

      const payload = normalizeInvokePayload(data);
      if (!payload) {
        throw new Error('תשובת שרת ריקה או לא תקינה לשליחת מייל.');
      }
      const bodyErr =
        typeof payload.error === 'string' && payload.error.trim().length > 0 ? payload.error.trim() : null;
      if (bodyErr) {
        throw new Error(bodyErr);
      }
      const sendLooksOk =
        payload.success === true ||
        Boolean(payload.sent_to) ||
        (typeof payload.token === 'string' && payload.token.length > 0);
      if (!sendLooksOk) {
        throw new Error(
          'תשובת שרת לא תקינה לשליחת מייל. ודא ש־Edge Function send-compliance-request מעודכנת.',
        );
      }

      const sentTo = String(payload.sent_to ?? driverEmail).trim().toLowerCase();
      if (!sentTo.includes('@')) {
        throw new Error('השרת לא החזיר כתובת נמען תקינה.');
      }

      /** רק אם השרת מחזיר במפורש false — אין שמירת בקשה במסד */
      const persistedExplicitFalse = payload?.persisted_token === false;
      /** תואם entity_id ב־compliance_requests: נהג/רכב — תמיד מזהה השורה בטבלה */
      const pendingKey = `${rowKey}::${tab.key}`;
      const rawSeq = payload?.notify_sequence;
      const notifySeq =
        typeof rawSeq === 'number'
          ? rawSeq
          : typeof rawSeq === 'string' && rawSeq.trim()
            ? Number(rawSeq)
            : NaN;
      if (!persistedExplicitFalse) {
        const optimisticPayload = {
          sentAt: new Date().toISOString(),
          ...(Number.isFinite(notifySeq) && notifySeq > 0 ? { notifySequence: notifySeq } : {}),
        };
        setTowerSentHint(authUserId, orgIdRequired, rowKey, tab.key, optimisticPayload);
        if (entityType === 'vehicle') {
          setOptimisticVehicleCompliancePending((prev) => ({
            ...prev,
            [pendingKey]: optimisticPayload,
          }));
        } else {
          setOptimisticCompliancePending((prev) => ({
            ...prev,
            [pendingKey]: optimisticPayload,
          }));
        }
      }
      if (persistedExplicitFalse) {
        toast.warning(
          'המייל נשלח, אך הבקשה לא נשמרה במסד — הסטטוס במרכז הציות לא יתעדכן עד שמיגרציית compliance_requests תופעל.',
          { duration: 12_000 },
        );
      } else if (!quiet) {
        toast.success('המייל נשלח בהצלחה');
      }

      await queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
      await queryClient.invalidateQueries({ queryKey: ['admin-compliance-drivers', orgIdRequired] });
      await queryClient.refetchQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
      await queryClient.refetchQueries({ queryKey: ['admin-compliance-drivers', orgIdRequired] });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!quiet) {
        toast.error(`שליחת הבקשה נכשלה: ${msg}`);
      }
      return false;
    } finally {
      if (!quiet) setSendingRowKey(null);
    }
  };

  const onBulkToggleRow = useCallback((entityId: string, checked: boolean) => {
    setBulkSendSelectionIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(entityId);
      else next.delete(entityId);
      return next;
    });
  }, []);

  const onBulkHeaderToggle = useCallback((eligibleIdsOnScreen: string[], checked: boolean) => {
    setBulkSendSelectionIds((prev) => {
      const next = new Set(prev);
      if (checked) eligibleIdsOnScreen.forEach((id) => next.add(id));
      else eligibleIdsOnScreen.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const runBulkComplianceSendForTab = useCallback(
    async (tab: (typeof TAB_DEFS)[number]) => {
      const orgIdRequired = String(orgId ?? '').trim();
      if (!orgIdRequired) {
        toast.error('לא ניתן לשלוח בקשה: חסר org_id.');
        return;
      }

      const rowsToSend = tabData[tab.key].filter((r) => bulkSendSelectionIds.has(String(r.id ?? '').trim()));
      if (rowsToSend.length === 0) return;

      setBulkSending(true);
      let ok = 0;
      let skipped = 0;
      try {
        for (const row of rowsToSend) {
          const barrier = complianceRequestSendBarrier(tab, row, (rrow) => requestDisabledReason(tab, rrow));
          if (barrier) {
            skipped += 1;
            continue;
          }
          const success = await submitComplianceRequest(tab, row, { silent: true });
          if (success) ok += 1;
        }

        await queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
        await queryClient.invalidateQueries({ queryKey: ['admin-compliance-drivers', orgIdRequired] });
        setBulkSendSelectionIds(new Set());

        const failCount = rowsToSend.length - ok - skipped;
        if (ok > 0 && skipped === 0 && failCount === 0) {
          toast.success(`נשלחו ${ok} בקשות בהצלחה`);
        } else if (ok > 0) {
          const parts = [`נשלחו בהצלחה: ${ok}`];
          if (skipped > 0) parts.push(`דילוג (לא זכאי): ${skipped}`);
          if (failCount > 0) parts.push(`נכשלו: ${failCount}`);
          toast.message(parts.join(' · '));
        } else if (skipped > 0 && failCount === 0) {
          toast.warning('לא נשלחה בקשה — כל הנבחרים חסומים לשליחה (ממתין לחתימה / חלון תאריכים וכו׳)');
        } else if (skipped === 0 && failCount > 0) {
          toast.error('שליחה מרוכזת נכשלה (בדוק חיבור או הגדרות)');
        }
      } finally {
        setBulkSending(false);
      }
    },
    [bulkSendSelectionIds, orgId, queryClient, requestDisabledReason, submitComplianceRequest, tabData],
  );

  const saveColumnsDefaults = (next: string[]) => {
    const avail = activeDef.source === 'vehicle' ? availableVehicleKeys : availableDriverKeys;
    const normalized = normalizeComplianceTabColumns(activeDef, next, avail);
    const nextDefaults = { ...defaultVisibleByTab, [activeTab]: normalized };
    setDefaultVisibleByTab(nextDefaults);
    try {
      localStorage.setItem(COMPLIANCE_COLUMNS_DEFAULTS_KEY, JSON.stringify(nextDefaults));
      toast.success('ברירת המחדל נשמרה');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שמירת ברירת מחדל נכשלה: ${msg}`);
    }
  };

  const saveColumnsSessionOnly = (next: string[]) => {
    const avail = activeDef.source === 'vehicle' ? availableVehicleKeys : availableDriverKeys;
    const normalized = normalizeComplianceTabColumns(activeDef, next, avail);
    setVisibleByTab((prev) => ({ ...prev, [activeTab]: normalized }));
    toast.success('התצוגה נשמרה לסשן הנוכחי');
  };

  const restoreDefaultForActiveTab = (): string[] => {
    const fallback = appendSendStatusColumnKey([activeDef.dueField]);
    const raw = defaultVisibleByTab[activeTab];
    const candidate = raw != null && raw.length > 0 ? raw : fallback;
    const avail = activeDef.source === 'vehicle' ? availableVehicleKeys : availableDriverKeys;
    const normalized = normalizeComplianceTabColumns(activeDef, candidate, avail);
    setVisibleByTab((prev) => ({ ...prev, [activeTab]: normalized }));
    toast.success('שוחזרה ברירת מחדל');
    return normalized;
  };

  const saveColumnsPrefs = () => {
    try {
      localStorage.setItem(COMPLIANCE_COLUMNS_DEFAULTS_KEY, JSON.stringify(defaultVisibleByTab));
      toast.success('ברירות המחדל נשמרו');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שמירת תצוגה נכשלה: ${msg}`);
    }
  };

  const approveDateForRow = (row: Record<string, unknown>): string => {
    const id = String(row.id ?? '').trim();
    if (!id) return '';
    if (approveExpiryByDriverId[id]) return approveExpiryByDriverId[id];
    const pending = String((row as { pending_license_expiry?: string | null }).pending_license_expiry ?? '').trim();
    if (pending.length >= 10) return pending.slice(0, 10);
    const existing = String(row.license_expiry ?? '').trim();
    return existing.length >= 10 ? existing.slice(0, 10) : existing;
  };

  const setApproveDateForRow = (row: Record<string, unknown>, next: string) => {
    const id = String(row.id ?? '').trim();
    if (!id) return;
    setApproveExpiryByDriverId((prev) => ({ ...prev, [id]: next }));
  };

  const approveVehicleRenewalForRequest = async (requestId: string) => {
    const orgIdRequired = String(orgId ?? '').trim();
    setApprovingRenewalId(requestId);
    try {
      const { data, error } = await invokeSupabaseEdgeFunction('approve-vehicle-renewal', {
        request_id: requestId,
      });
      const earlyPayload = normalizeInvokePayload(data);
      if (!error && earlyPayload) {
        const earlyErr =
          typeof earlyPayload.error === 'string' && earlyPayload.error.trim().length > 0
            ? earlyPayload.error.trim()
            : null;
        if (earlyErr && earlyPayload.success !== true) throw new Error(earlyErr);
      }
      if (error) {
        let detailed = error.message ?? 'שגיאה';
        const context = (error as unknown as { context?: Response }).context;
        if (context) {
          try {
            const body = (await context.json()) as { error?: string };
            if (body.error) detailed = body.error;
          } catch {
            /* ignore */
          }
        }
        throw new Error(detailed);
      }
      const payload = normalizeInvokePayload(data);
      if (payload?.error) throw new Error(String(payload.error));
      if (payload?.success !== true) throw new Error('תשובת שרת לא תקינה');

      const vid = typeof payload?.vehicle_id === 'string' ? payload.vehicle_id.trim() : '';
      if (vid) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle', vid] });
        await queryClient.invalidateQueries({ queryKey: ['vehicle-documents', vid] });
      }

      const de = payload?.driver_email as
        | {
            attempted?: boolean;
            recipient?: string | null;
            resolved_driver_id?: string | null;
            outcome?: { sent?: boolean; reason?: string; resend_detail?: string };
          }
        | undefined;
      const sent = de?.outcome?.sent === true;
      const reason = typeof de?.outcome?.reason === 'string' ? de.outcome.reason : '';
      if (sent && de?.recipient) {
        toast.success(`הרכב עודכן והמסמך נרשם. המייל נשלח לנהג (${de.recipient}).`);
      } else if (!de?.attempted && reason === 'no_driver_linked_to_vehicle') {
        toast.warning('הרכב עודכן והמסמך נרשם, אך לא נמצא נהג מקושר לרכב — המייל לנהג לא נשלח.', {
          description: 'הגדר שיוך ברכב או שיוך פעיל, או שהיתה מסירה שנרשמה לנהג.',
        });
      } else if (!sent && reason === 'driver_has_no_email') {
        toast.warning('הרכב עודכן והמסמך נרשם; לנהג המשוייך אין מייל בכרטיס — לא ניתן לשלוח.', {
          description: `נהג בתיק: ${String(de?.resolved_driver_id ?? '—')}`,
        });
      } else if (!sent && reason.startsWith('resend_error:')) {
        toast.warning('הרכב עודכן אך שליחת המייל דרך Resend נכשלה.', {
          description: reason.replace(/^resend_error:/, '').slice(0, 240),
          duration: 14_000,
        });
      } else {
        toast.success('הרכב עודכן והמסמך נרשם בכרטיס הרכב.', {
          description: sent ? '' : reason || 'לא נשלח מייל לנהג.',
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-pending-vehicle-renewals', orgIdRequired] });
      await queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
      void refetchPendingVehicleRenewals();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`אישור נכשל: ${msg}`);
    } finally {
      setApprovingRenewalId(null);
    }
  };

  const submitLeasingRenewalFromModal = async () => {
    if (!leasingContext || !orgId) return;
    const email = leasingEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      toast.error('נא להזין כתובת מייל תקינה לנציג הליסינג');
      return;
    }
    const { row, tab } = leasingContext;
    const vid = String(row.id ?? '').trim();
    if (!vid) return;
    setLeasingSending(true);
    try {
      const dueIso = dueIsoFromRaw(row[tab.dueField]);
      const { data, error } = await invokeSupabaseEdgeFunction('send-external-vehicle-renewal', {
        org_id: orgId,
        vehicle_id: vid,
        task_key: tab.key,
        task_label: tab.label,
        due_field: tab.dueField,
        due_date: dueIso,
        external_recipient_email: email,
      });
      const earlyPayload = normalizeInvokePayload(data);
      if (!error && earlyPayload) {
        const earlyErr =
          typeof earlyPayload.error === 'string' && earlyPayload.error.trim().length > 0
            ? earlyPayload.error.trim()
            : null;
        if (earlyErr && earlyPayload.success !== true) throw new Error(earlyErr);
      }
      if (error) {
        const { message: detailed, existing_request_id } = await readEdgeFunctionInvokeErrorPayload(error);
        if (existing_request_id) {
          await queryClient.invalidateQueries({ queryKey: ['admin-pending-vehicle-renewals', orgId] });
          await queryClient.refetchQueries({ queryKey: ['admin-pending-vehicle-renewals', orgId] });
          void refetchPendingVehicleRenewals();

          let loadedFromRpc = false;
          try {
            const { data: rpcRows, error: rpcErr } = await supabase.rpc(
              'compliance_pending_vehicle_renewal_for_viewer',
              { p_request_id: existing_request_id },
            );
            if (!rpcErr && rpcRows != null) {
              const arr = Array.isArray(rpcRows) ? rpcRows : [rpcRows];
              const raw = arr[0] as Record<string, unknown> | undefined;
              if (raw && typeof raw.id === 'string' && raw.id.trim()) {
                const loaded: PendingVehicleRenewalRow = {
                  id: String(raw.id).trim(),
                  entity_id: String(raw.entity_id ?? '').trim(),
                  task_key: String(raw.task_key ?? '').trim(),
                  task_label: raw.task_label != null ? String(raw.task_label) : null,
                  proposed_expiry_date:
                    raw.proposed_expiry_date != null
                      ? String(raw.proposed_expiry_date).slice(0, 10)
                      : null,
                  submitted_document_url:
                    raw.submitted_document_url != null ? String(raw.submitted_document_url) : null,
                  external_recipient_email:
                    raw.external_recipient_email != null ? String(raw.external_recipient_email) : null,
                  request_url: raw.request_url != null ? String(raw.request_url) : null,
                };
                setInjectedVehiclePendingRenewals((prev) =>
                  prev.some((p) => p.id === loaded.id) ? prev : [...prev, loaded],
                );
                loadedFromRpc = true;
              }
            } else if (rpcErr) {
              console.warn('[AdminCompliance] RPC compliance_pending_vehicle_renewal_for_viewer', rpcErr);
            }
          } catch (e) {
            console.warn('[AdminCompliance] RPC compliance_pending_vehicle_renewal_for_viewer failed', e);
          }

          setLeasingOpen(false);
          setLeasingContext(null);
          setLeasingEmail('');
          setLeasingApprovalsOpen(true);
          toast.message(detailed, {
            description: loadedFromRpc
              ? 'ההגשה הוצגה ברשימת «ממתין לאישור מנהל».'
              : 'נפתח החלון — אם הרשימה עדיין ריקה, הרץ מיגרציה (RPC) או בדוק ארגון והרשאות.',
          });
          return;
        }
        throw new Error(detailed);
      }
      const payload = normalizeInvokePayload(data);
      if (payload?.error) throw new Error(String(payload.error));
      if (payload?.success !== true) throw new Error('תשובת שרת לא תקינה');
      toast.success('המייל נשלח לנציג הליסינג');
      const rawSeq = payload?.notify_sequence;
      const notifySeq =
        typeof rawSeq === 'number'
          ? rawSeq
          : typeof rawSeq === 'string' && rawSeq.trim()
            ? Number(rawSeq)
            : NaN;
      const leasingOptimistic = {
        sentAt: new Date().toISOString(),
        ...(Number.isFinite(notifySeq) && notifySeq > 0 ? { notifySequence: notifySeq } : {}),
      };
      setTowerSentHint(authUserId, orgId, vid, leasingContext.tab.key, leasingOptimistic);
      setOptimisticVehicleCompliancePending((prev) => ({
        ...prev,
        [`${vid}::${leasingContext.tab.key}`]: leasingOptimistic,
      }));
      setLeasingOpen(false);
      setLeasingContext(null);
      setLeasingEmail('');
      await queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgId] });
      void refetchPendingVehicleRenewals();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שליחה נכשלה: ${msg}`);
    } finally {
      setLeasingSending(false);
    }
  };

  const submitResendLeasingEmail = async () => {
    const rid = String(resendLeasingDialog?.requestId ?? '').trim();
    const orgIdRequired = String(orgId ?? '').trim();
    if (!rid || !orgIdRequired) return;
    setResendSending(true);
    try {
      const { data, error } = await invokeSupabaseEdgeFunction('resend-external-vehicle-renewal-email', {
        org_id: orgIdRequired,
        request_id: rid,
        admin_note: resendNote.trim(),
      });
      const earlyPayload = normalizeInvokePayload(data);
      if (!error && earlyPayload) {
        const earlyErr =
          typeof earlyPayload.error === 'string' && earlyPayload.error.trim().length > 0
            ? earlyPayload.error.trim()
            : null;
        if (earlyErr && earlyPayload.success !== true) throw new Error(earlyErr);
      }
      if (error) {
        let detailed = error.message ?? 'שגיאה';
        const context = (error as unknown as { context?: Response }).context;
        if (context) {
          try {
            const body = (await context.json()) as { error?: string };
            if (body.error) detailed = body.error;
          } catch {
            /* ignore */
          }
        }
        throw new Error(detailed);
      }
      const payload = normalizeInvokePayload(data);
      if (payload?.error) throw new Error(String(payload.error));
      if (payload?.success !== true) throw new Error('תשובת שרת לא תקינה');
      toast.success('המייל נשלח. הבקשה הוסרה מרשימת הממתינים; אפשר שוב «שלח בקשה» בטבלה עד הגשה חדשה.');
      setResendLeasingDialog(null);
      setResendNote('');
      await queryClient.invalidateQueries({ queryKey: ['admin-pending-vehicle-renewals', orgIdRequired] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
      void refetchPendingVehicleRenewals();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שליחה נכשלה: ${msg}`);
    } finally {
      setResendSending(false);
    }
  };

  const submitResendDriverLicenseEmail = async () => {
    const driverId = String(resendDriverLicenseDialog ?? '').trim();
    const orgIdRequired = String(orgId ?? '').trim();
    if (!driverId || !orgIdRequired) return;
    const row = drivers.find((x) => String(x.id) === driverId);
    const tab = TAB_DEFS.find((t) => t.key === 'driver_license');
    if (!row || !tab) {
      toast.error('נהג לא נמצא');
      return;
    }
    setResendDriverSending(true);
    try {
      const ok = await submitComplianceRequest(tab, row as Record<string, unknown>, {
        admin_note: resendDriverNote.trim(),
      });
      if (ok) {
        setResendDriverLicenseDialog(null);
        setResendDriverNote('');
      }
    } finally {
      setResendDriverSending(false);
    }
  };

  const approveLicenseForRow = async (row: Record<string, unknown>) => {
    const driverId = String(row.id ?? '').trim();
    const orgIdRequired = String(orgId ?? '').trim();
    const nextExpiry = approveDateForRow(row).trim();
    if (!driverId || !orgIdRequired) {
      toast.error('לא ניתן לאשר ללא מזהי נהג/ארגון');
      return;
    }
    if (!nextExpiry) {
      toast.error('יש לבחור תאריך תוקף רישיון חדש לפני אישור');
      return;
    }

    setApprovingRowKey(driverId);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          license_expiry: nextExpiry,
          status: 'active',
          pending_license_expiry: null,
        })
        .eq('id', driverId)
        .eq('org_id', orgIdRequired);
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['admin-compliance-open-requests', orgIdRequired] });
      void refetchDrivers();
      toast.success('הרישיון אושר ותוקף הרישיון עודכן');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`אישור נכשל: ${msg}`);
    } finally {
      setApprovingRowKey(null);
    }
  };

  if (!canAccessAdminComplianceCenter) {
    return <Navigate to="/" replace />;
  }

  return (
    <FleetHudPageShell
      title="מרכז ציות"
      subtitle="מרכז בקרה לתאריכי תוקף: רישוי רכב, ביטוח, טיפולים, ביקורות ותוקפי נהגים"
    >
      <div className="mx-auto max-w-[1400px] space-y-4 pb-8" dir="rtl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>הגדרות תצוגה</CardTitle>
            <CardDescription>הנתונים בטבלאות מתעדכנים לפי סינון התצוגה והטאב הנבחר</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-2">
              <Label>סינון תצוגה</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={viewFilter === 'all' ? 'default' : 'outline'} onClick={() => setViewFilter('all')}>
                  הכל
                </Button>
                <Button type="button" variant={viewFilter === 'custom_range' ? 'default' : 'outline'} onClick={() => setViewFilter('custom_range')}>
                  טווח מותאם אישית
                </Button>
                <Button type="button" variant={viewFilter === 'expiring_soon' ? 'default' : 'outline'} onClick={() => setViewFilter('expiring_soon')}>
                  קרובים לפקיעה
                </Button>
                <Button type="button" variant={viewFilter === 'urgent' ? 'default' : 'outline'} onClick={() => setViewFilter('urgent')}>
                  טיפול דחוף
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                צבעי שורות: אדום — פג תוקף עד {COMPLIANCE_RED_MAX_DAYS_REMAINING} ימים נותרים; צהוב —{' '}
                {COMPLIANCE_RED_MAX_DAYS_REMAINING + 1}–{COMPLIANCE_YELLOW_MAX_DAYS_REMAINING} ימים; ירוק — מעל{' '}
                {COMPLIANCE_YELLOW_MAX_DAYS_REMAINING} ימים.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setLeasingApprovalsOpen(true)}>
                  ממתין לאישור מנהל ({pendingManagerApprovalTotal})
                </Button>
              </div>
            </div>
            {viewFilter === 'custom_range' && (
              <>
                <div className="w-48 space-y-1">
                  <Label htmlFor="custom-range-from">מיום (ימים מהיום)</Label>
                  <Input
                    id="custom-range-from"
                    type="number"
                    value={customRangeFromDays}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCustomRangeFromDays(Number.isFinite(next) ? next : -30);
                    }}
                  />
                </div>
                <div className="w-48 space-y-1">
                  <Label htmlFor="custom-range-to">עד יום (ימים מהיום)</Label>
                  <Input
                    id="custom-range-to"
                    type="number"
                    value={customRangeToDays}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCustomRangeToDays(Number.isFinite(next) ? next : 30);
                    }}
                  />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1">
              <SearchableColumnPicker
                key={activeTab}
                allKeys={currentAllColumns}
                fixedItems={[
                  { key: FIXED_PICKER_KEYS.due, label: `תאריך יעד (${prettifyKey(activeDef.dueField)})` },
                  { key: FIXED_PICKER_KEYS.days, label: 'ימים נותרו' },
                  { key: FIXED_PICKER_KEYS.status, label: 'סטטוס' },
                  { key: FIXED_PICKER_KEYS.actions, label: 'פעולות' },
                  { key: FIXED_PICKER_KEYS.bulk, label: 'בחירה (צ׳קבוקס)' },
                ]}
                selected={visibleByTab[activeTab]}
                onSaveSession={saveColumnsSessionOnly}
                onSaveDefault={saveColumnsDefaults}
                onRestoreDefault={restoreDefaultForActiveTab}
                triggerLabel={columnPickerTriggerLabel}
              />
              <p className="max-w-xl text-xs text-muted-foreground leading-snug">
                הרשימה מגדירה רק עמודות שדות נתונים. לכל טבלה נוספות תמיד: תאריך יעד לטאב, ימים נותרו, סטטוס, פעולות
                וצ׳קבוקס; אם «סטטוס שליחה» מסומן — נוספת עמודה נפרדת לפני «פעולות».
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={handleComplianceTabChange}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {TAB_DEFS.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm shadow-sm transition-all data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:opacity-75 hover:data-[state=inactive]:opacity-100"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="mt-3 w-full rounded-lg border border-primary/35 bg-primary/10 px-3 py-2.5 text-right text-sm">
            <span className="text-muted-foreground">מציג כעת: </span>
            <span className="font-semibold text-foreground">{activeDef.label}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {activeDef.source === 'vehicle' ? 'נתוני רכבים' : 'נתוני נהגים'}
            </span>
          </div>

          {TAB_DEFS.map((tab) => {
            const selectedCountForTab = tabData[tab.key].filter((r) =>
              bulkSendSelectionIds.has(String(r.id ?? '').trim()),
            ).length;
            return (
              <TabsContent key={tab.key} value={tab.key}>
                {loading ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">טוען נתונים...</CardContent>
                  </Card>
                ) : (
                  <>
                    {selectedCountForTab > 0 && tab.key !== 'annual_licensing' && tab.key !== 'insurance' ? (
                      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={bulkSending}
                          onClick={() => setBulkSendSelectionIds(new Set())}
                        >
                          נקה בחירה
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={bulkSending}
                          onClick={() => void runBulkComplianceSendForTab(tab)}
                        >
                          {bulkSending ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              שולח...
                            </span>
                          ) : (
                            <>שלח בקשה ל־{selectedCountForTab} נבחרים</>
                          )}
                        </Button>
                      </div>
                    ) : null}
                    <ComplianceTable
                      rows={tabData[tab.key]}
                      columns={visibleByTab[tab.key].filter((c) => c !== COMPLIANCE_COLUMN_SEND_STATUS)}
                      showSendStatusColumn={visibleByTab[tab.key].includes(COMPLIANCE_COLUMN_SEND_STATUS)}
                      dueField={tab.dueField}
                      tabKey={tab.key}
                      rowSource={tab.source}
                      complianceReturnUrl={complianceReturnUrl}
                      onSendRequest={(row) => {
                        if (tab.key === 'annual_licensing' || tab.key === 'insurance') {
                          setLeasingContext({ row: row as Record<string, unknown>, tab });
                          setLeasingEmail('');
                          setLeasingOpen(true);
                          return;
                        }
                        void submitComplianceRequest(tab, row);
                      }}
                      requestDisabledReason={(row) => requestDisabledReason(tab, row)}
                      driverEmailFixHref={(row) => {
                        const state = { complianceReturnTo: complianceReturnUrl };
                        if (tab.source === 'driver') {
                          const id = String(row.id ?? '').trim();
                          return id ? { pathname: `/drivers/${id}/edit`, state } : null;
                        }
                        const aid = String(row.assigned_driver_id ?? '').trim();
                        return aid ? { pathname: `/drivers/${aid}/edit`, state } : null;
                      }}
                      onApproveLicense={(row) => void approveLicenseForRow(row)}
                      getApproveDateValue={(row) => approveDateForRow(row)}
                      setApproveDateValue={(row, next) => setApproveDateForRow(row, next)}
                      isApprovingRow={(row) => approvingRowKey === String(row.id ?? '')}
                      sendingRowKey={sendingRowKey}
                      bulkSendSelectionIds={bulkSendSelectionIds}
                      bulkSending={bulkSending}
                      onBulkToggleRow={onBulkToggleRow}
                      onBulkHeaderToggle={onBulkHeaderToggle}
                      getPendingVehicleRenewal={(vehicleId) =>
                        pendingRenewalByVehicleTask.get(`${vehicleId}::${tab.key}`) ?? null
                      }
                      onApproveVehicleRenewal={(rid) => void approveVehicleRenewalForRequest(rid)}
                      approvingVehicleRenewalId={approvingRenewalId}
                      hideLeasingPendingInlineActions={tab.key === 'annual_licensing' || tab.key === 'insurance'}
                      focusHighlightId={focusHighlightId}
                      emptyLabel={
                        viewFilter === 'all'
                          ? `לא נמצאו רשומות עם ${prettifyKey(tab.dueField)}`
                          : viewFilter === 'urgent'
                            ? `לא נמצאו רשומות בטווח טיפול דחוף עבור ${prettifyKey(tab.dueField)}`
                            : viewFilter === 'expiring_soon'
                              ? `לא נמצאו רשומות בטווח «קרוב לפקיעה» (${COMPLIANCE_RED_MAX_DAYS_REMAINING + 1}–${COMPLIANCE_YELLOW_MAX_DAYS_REMAINING} ימים נותרים) עבור ${prettifyKey(tab.dueField)}`
                              : `לא נמצאו רשומות עם ${prettifyKey(tab.dueField)} בטווח המותאם (${customRangeFromDays} עד ${customRangeToDays} ימים מהיום)`
                      }
                    />
                  </>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      <Dialog
        open={leasingOpen}
        onOpenChange={(o) => {
          setLeasingOpen(o);
          if (!o) setLeasingContext(null);
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>שליחה לנציג ליסינג</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            לאחר השליחה הנציג יקבל קישור להעלאת צילום מסמך ולציון תאריך תוקף חדש. התוצאה תחזור למרכז הציות לאישורך;
            לאחר האישור המסמך יישמר בכרטיס הרכב (טסט / ביטוח) ויישלח מייל לנהג המשויך.
          </p>
          {leasingContext ? (
            <p className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              רכב:{' '}
              <span className="font-medium text-foreground">{String(leasingContext.row.plate_number ?? '')}</span> ·{' '}
              {leasingContext.tab.label}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="leasing-email">מייל נציג ליסינג</Label>
            <Input
              id="leasing-email"
              type="email"
              dir="ltr"
              value={leasingEmail}
              onChange={(e) => setLeasingEmail(e.target.value)}
              placeholder="rep@leasing.example"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLeasingOpen(false);
                setLeasingContext(null);
              }}
              disabled={leasingSending}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void submitLeasingRenewalFromModal()} disabled={leasingSending}>
              {leasingSending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח…
                </span>
              ) : (
                'שלח מייל'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leasingApprovalsOpen} onOpenChange={setLeasingApprovalsOpen}>
        <DialogContent
          dir="rtl"
          className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <div className="shrink-0 space-y-1 border-b border-border/70 px-4 py-3 pr-12 sm:px-5 sm:pr-14">
            <DialogHeader className="space-y-0 text-right">
              <DialogTitle className="text-base sm:text-lg">ממתין לאישור מנהל</DialogTitle>
            </DialogHeader>
            <p className="text-xs leading-snug text-muted-foreground sm:text-sm">
              טסט וביטוח שהגיעו מנציג חיצוני לפני עדכון כרטיס הרכב, ונהגים בסטטוס «ממתין לאישור מנהל» (למשל אחרי העלאת רישיון).
            </p>
          </div>
          {pendingRenewalsDialogRows.length === 0 && driversPendingManagerApproval.length === 0 ? (
            <p className="shrink-0 py-8 text-center text-sm text-muted-foreground">אין פריטים ממתינים לאישור מנהל.</p>
          ) : (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
              {pendingRenewalsDialogRows.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">טסט וביטוח — הגשות מנציג</p>
                  <div className="overflow-x-auto rounded-md border">
                    <Table dir="rtl">
                      <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">לוחית</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">נושא</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">תוקף מוצע</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">נציג (מייל)</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">פעולות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRenewalsDialogRows.map((row) => {
                          const docUrl = String(row.submitted_document_url ?? '').trim();
                          const rep = String(row.external_recipient_email ?? '').trim();
                          return (
                            <TableRow key={row.id} className="align-middle">
                              <TableCell className="py-2 text-right text-xs font-medium">{row.plate}</TableCell>
                              <TableCell className="py-2 text-right text-xs">{row.task_label ?? '—'}</TableCell>
                              <TableCell className="py-2 tabular-nums text-xs" dir="ltr">
                                {row.proposed_expiry_date
                                  ? formatIsoYmdAsDmySlash(row.proposed_expiry_date)
                                  : '—'}
                              </TableCell>
                              <TableCell
                                className="max-w-[7rem] py-2 text-right text-[11px] leading-tight break-all sm:max-w-[10rem]"
                                dir="ltr"
                              >
                                {rep || '—'}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex max-w-[220px] flex-wrap justify-end gap-1 sm:max-w-none">
                                  {docUrl ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => window.open(docUrl, '_blank', 'noopener,noreferrer')}
                                    >
                                      צפייה
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => {
                                      setResendLeasingDialog({ requestId: row.id });
                                      setResendNote('');
                                    }}
                                  >
                                    מייל חזרה
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => void approveVehicleRenewalForRequest(row.id)}
                                    disabled={approvingRenewalId === row.id}
                                  >
                                    {approvingRenewalId === row.id ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        מאשר…
                                      </span>
                                    ) : (
                                      'אישור'
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
              {driversPendingManagerApproval.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    רישיון נהיגה — ממתינים לאישור במערכת
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <Table dir="rtl">
                      <TableHeader className="bg-card">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">שם</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">נושא</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">תוקף במערכת</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">תוקף מוצע (מהנהג)</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">מייל נהג</TableHead>
                          <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">פעולות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {driversPendingManagerApproval.map((d) => {
                          const id = String(d.id ?? '').trim();
                          const docUrl = String(d.license_front_url ?? '').trim();
                          const asRow = d as unknown as Record<string, unknown>;
                          const pendingYmd = String(
                            (d as { pending_license_expiry?: string | null }).pending_license_expiry ?? '',
                          ).trim();
                          return (
                            <TableRow key={id} className="align-middle">
                              <TableCell className="py-2 text-right text-xs font-medium">
                                {d.full_name?.trim() || '—'}
                              </TableCell>
                              <TableCell className="py-2 text-right text-xs">רישיון נהיגה</TableCell>
                              <TableCell className="py-2 tabular-nums text-xs" dir="ltr">
                                {d.license_expiry ? formatIsoYmdAsDmySlash(d.license_expiry) : '—'}
                              </TableCell>
                              <TableCell className="py-2 tabular-nums text-xs" dir="ltr">
                                {pendingYmd.length >= 10 ? formatIsoYmdAsDmySlash(pendingYmd) : '—'}
                              </TableCell>
                              <TableCell
                                className="max-w-[7rem] py-2 text-right text-[11px] leading-tight break-all sm:max-w-[10rem]"
                                dir="ltr"
                              >
                                {d.email?.trim() || '—'}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex max-w-[240px] flex-wrap justify-end gap-1 sm:max-w-none">
                                  {docUrl ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => window.open(docUrl, '_blank', 'noopener,noreferrer')}
                                    >
                                      צפייה
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => {
                                      setResendDriverLicenseDialog(id);
                                      setResendDriverNote('');
                                    }}
                                  >
                                    מייל חזרה
                                  </Button>
                                  <FleetDatePicker
                                    id={`pending-approve-dialog-${id}`}
                                    value={approveDateForRow(asRow)}
                                    onChange={(next) => setApproveDateForRow(asRow, next)}
                                    slashDisplay="compact"
                                    className="[&_input]:h-7 [&_input]:min-w-[9rem] [&_input]:w-[9.75rem] [&_input]:text-[11px] [&_button]:h-6 [&_button]:w-6 [&_button]:end-0.5"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => void approveLicenseForRow(asRow)}
                                    disabled={
                                      !approveDateForRow(asRow).trim() || approvingRowKey === id
                                    }
                                  >
                                    {approvingRowKey === id ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        מאשר…
                                      </span>
                                    ) : (
                                      'אישור'
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={resendLeasingDialog != null}
        onOpenChange={(o) => {
          if (!o) {
            setResendLeasingDialog(null);
            setResendNote('');
          }
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>מייל חזרה לנציג ליסינג</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            יישלח <strong>אותו מייל כמו בשליחה הראשונית</strong> (עיצוב וניסוח), עם בלוק «הערת מנהל» אם מילאת. לאחר השליחה
            הבקשה תוסר מממתינים והנציג יוכל להגיש מחדש מהקישור.
          </p>
          <div className="space-y-2">
            <Label htmlFor="resend-note">הערה לנציג (אופציונלי)</Label>
            <Textarea
              id="resend-note"
              dir="rtl"
              rows={4}
              value={resendNote}
              onChange={(e) => setResendNote(e.target.value)}
              placeholder="לדוגמה: הצילום חשוך — נא לצלם מחדש את שני צדי הרישיון."
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResendLeasingDialog(null);
                setResendNote('');
              }}
              disabled={resendSending}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void submitResendLeasingEmail()} disabled={resendSending}>
              {resendSending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח…
                </span>
              ) : (
                'שלח מייל'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resendDriverLicenseDialog != null}
        onOpenChange={(o) => {
          if (!o) {
            setResendDriverLicenseDialog(null);
            setResendDriverNote('');
          }
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>מייל חזרה לנהג</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            יישלח לנהג <strong>אותו מייל כמו «שלח בקשה»</strong> במרכז הציות (עם קישור לעדכון רישיון נהיגה), כולל בלוק
            «הערת מנהל» אם מילאת להלן.
          </p>
          <div className="space-y-2">
            <Label htmlFor="resend-driver-note">הערה לנהג (אופציונלי)</Label>
            <Textarea
              id="resend-driver-note"
              dir="rtl"
              rows={4}
              value={resendDriverNote}
              onChange={(e) => setResendDriverNote(e.target.value)}
              placeholder="לדוגמה: התמונה מטושטשת — נא לצלם מחדש את תאריך התוקף בבירור."
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResendDriverLicenseDialog(null);
                setResendDriverNote('');
              }}
              disabled={resendDriverSending}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void submitResendDriverLicenseEmail()} disabled={resendDriverSending}>
              {resendDriverSending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח…
                </span>
              ) : (
                'שלח מייל'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FleetHudPageShell>
  );
}
