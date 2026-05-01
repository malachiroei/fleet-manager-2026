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
import { useVehicles } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import type { Driver, Vehicle } from '@/types/fleet';
import { Columns3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
const COMPLIANCE_COLUMNS_DEFAULTS_KEY = 'admin_compliance_default_columns_v1';

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
  'health_declaration_date', 'safety_training_date', 'license_front_url', 'license_back_url',
  'health_declaration_url', 'status', 'created_at', 'updated_at', 'address', 'job_title', 'department',
  'license_number', 'regulation_585b_date', 'driver_code', 'is_active', 'employee_number', 'work_start_date', 'city',
  'note1', 'note2', 'rating', 'division', 'eligibility', 'area', 'group_name', 'group_code', 'safety_officer',
  'birth_date', 'family_permit_date', 'driving_permit', 'is_field_person', 'practical_driving_test_date',
];

/** ללא status — סטטוס ציות מוצג בעמודה אחת לפי תאריך התוקף (לא שדה status מה-DB שלעיתים לא מסונכרן) */
const VEHICLE_DEFAULT_COLUMNS = ['plate_number', 'manufacturer', 'model'];
/** ללא status — תצוגת סטטוס מרוכזת בעמודה הייעודית «סטטוס» (עברית) */
const DRIVER_DEFAULT_COLUMNS = ['full_name', 'id_number', 'phone', 'email'];

const TAB_DEFS: Array<{ key: ComplianceTabKey; label: string; source: 'vehicle' | 'driver'; dueField: string }> = [
  { key: 'annual_licensing', label: 'רישוי שנתי', source: 'vehicle', dueField: 'test_expiry' },
  { key: 'insurance', label: 'ביטוח', source: 'vehicle', dueField: 'insurance_expiry' },
  { key: 'periodic_inspection', label: 'ביקורת תקופתית (6 חודשים)', source: 'vehicle', dueField: 'next_inspection_date' },
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

function availableKeysFromRows(rows: Array<Record<string, unknown>>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) out.add(k);
  }
  return out;
}

function filterKeysByAvailable(keys: string[], available: Set<string>): string[] {
  return keys.filter((k) => available.has(k));
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
  const dueDays = daysUntil(row[tab.dueField]);
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

/** תאריך ושעת שליחת בקשת ציות (ISO מהשרת) */
function formatComplianceSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
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

/** סטטוס תצוגה לפי תאריך התוקף של הטאב — לא רק `status` מה-DB (שלעיתים לא מסונכרן) */
function complianceTableStatusNode(dueField: string, row: Record<string, unknown>) {
  if (String(row.status ?? '').trim().toLowerCase() === 'pending_approval') {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
        ממתין לאישור מנהל
      </span>
    );
  }
  const dueDays = daysUntil(row[dueField]);
  const db = String(row.status ?? '—').trim() || '—';
  if (dueDays != null && dueDays < 0) {
    return (
      <span className="text-xs font-semibold text-red-300" title={`סטטוס במערכת: ${db}`}>
        פג תוקף
      </span>
    );
  }
  if (dueDays != null && dueDays <= 30 && dueDays >= 0 && db.toLowerCase() === 'valid') {
    return (
      <span className="text-xs font-medium text-amber-200" title={`סטטוס במערכת: ${db}`}>
        לטיפול
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" title={`ערך גולמי במערכת: ${db}`}>
      {driverSystemStatusLabelHe(row.status)}
    </span>
  );
}

function SearchableColumnPicker({
  allKeys,
  selected,
  onSaveSession,
  onSaveDefault,
  onRestoreDefault,
  selectedCount,
}: {
  allKeys: string[];
  selected: string[];
  onSaveSession: (next: string[]) => void;
  onSaveDefault: (next: string[]) => void;
  onRestoreDefault: () => void;
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) setDraftSelected(selected);
  }, [selected, open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter((k) => k.toLowerCase().includes(q) || prettifyKey(k).toLowerCase().includes(q));
  }, [allKeys, query]);

  const toggle = (key: string) => {
    if (draftSelected.includes(key)) {
      setDraftSelected(draftSelected.filter((x) => x !== key));
      return;
    }
    setDraftSelected([...draftSelected, key]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-2">
          <Columns3 className="h-4 w-4" />
          עמודות ({selectedCount})
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
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraftSelected([...allKeys])}>בחר הכל</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraftSelected([])}>נקה הכל</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onRestoreDefault();
                setDraftSelected(selected);
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
            {shown.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <Checkbox checked={draftSelected.includes(key)} onCheckedChange={() => toggle(key)} />
                <span className="text-sm">{prettifyKey(key)}</span>
              </label>
            ))}
            {shown.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">לא נמצאו עמודות</p> : null}
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
}: TabTableProps<T>) {
  /** עמודת «סטטוס» ייעודית קיימת — לא לשכפל את שדה status מהרכב בעמודות הנתונים */
  const baseCols = columns.length > 0 ? columns : [dueField];
  const filteredCols = baseCols.filter((c) => !(rowSource === 'vehicle' && c === 'status'));
  const safeColumns = filteredCols.length > 0 ? filteredCols : [dueField];

  const eligibilityByRow = rows.map((row) => {
    const dueDays = daysUntil(row[dueField]);
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
      sendBarrierMerged = 'יש הגשה מליסינג הממתינה לאישור — השתמש ב«אישור והחלה»';
    }
    return {
      id,
      dueDays,
      sendBarrierMerged,
      pendingRen,
      canSelectBulk: Boolean(id) && !sendBarrierMerged && !bulkSending,
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
      {/* עם dir=rtl: עמודה ראשונה בדא״ף = קצה ימין — בחירה ליד ההקשר הנכון בעברית */}
      <Table dir="rtl">
        <TableHeader>
          <TableRow>
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
            <TableHead className="text-right">ימים נותרו</TableHead>
            <TableHead className="text-right">{prettifyKey(dueField)}</TableHead>
            {safeColumns.map((col) => (
              <TableHead key={col} className="text-right">{prettifyKey(col)}</TableHead>
            ))}
            <TableHead className="text-right">סטטוס</TableHead>
            <TableHead className="text-right">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="text-right text-muted-foreground" colSpan={safeColumns.length + 5}>
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
              return (
                <TableRow
                  key={String(row.id ?? idx)}
                  className={
                    rowUrgent
                      ? 'bg-red-500/10 transition-colors hover:bg-red-500/15'
                      : 'transition-colors hover:bg-red-500/12'
                  }
                >
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
                  <TableCell
                    className={`text-right ${
                      rowUrgent ? 'text-red-400 font-semibold' : band === 'yellow' ? 'text-amber-200/95' : band === 'green' ? 'text-emerald-200/90' : ''
                    }`}
                  >
                    {(() => {
                      const dueRaw = row[dueField];
                      if (complianceRawMissing(dueRaw)) {
                        const lp = complianceEditLinkProps(rowSource, dueField, row, complianceReturnUrl, 'due');
                        return lp ? (
                          <Link
                            {...lp}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            title="מעבר לעריכה להשלמת תאריך התוקף"
                          >
                            {formatDate(dueRaw)}
                          </Link>
                        ) : (
                          formatDate(dueRaw)
                        );
                      }
                      return formatDate(dueRaw);
                    })()}
                  </TableCell>
                  {safeColumns.map((col) => (
                    <TableCell key={`${String(row.id ?? idx)}-${col}`} className="text-right">
                      {rowSource === 'driver' && col === 'full_name' && String(row.id ?? '').trim() ? (
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
                  <TableCell className="text-right">
                    {tabKey === 'health_declaration' ? (
                      awaitingEmp ? (
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
                      ) : dueDays == null ? (
                        <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-700/40 px-2 py-0.5 text-xs font-semibold text-slate-200">
                          ממתין לשליחה
                        </span>
                      ) : complianceDueBand(dueDays) === 'red' ? (
                        <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                          {dueDays < 0 ? 'פג תוקף' : 'דחוף'}
                        </span>
                      ) : complianceDueBand(dueDays) === 'yellow' ? (
                        <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                          קרוב לפקיעה
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-600/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                          תקין
                        </span>
                      )
                    ) : driverLicPending ? (
                      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                        ממתין לאישור מנהל
                      </span>
                    ) : (
                      complianceTableStatusNode(dueField, row as Record<string, unknown>)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
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
                            <Input
                              type="date"
                              className="h-10 w-full min-w-[10.5rem] sm:w-44"
                              value={getApproveDateValue(row)}
                              onChange={(e) => setApproveDateValue(row, e.target.value)}
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
  const { isAdmin, activeOrgId, profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = activeOrgId ?? profile?.org_id ?? null;
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
  const [approvingRenewalId, setApprovingRenewalId] = useState<string | null>(null);
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: drivers = [], isLoading: driversLoading, refetch: refetchDrivers } = useQuery({
    queryKey: ['admin-compliance-drivers', orgId],
    enabled: isAdmin && orgId != null,
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

  type OpenComplianceRow = {
    driver_id: string | null;
    task_key: string | null;
    status: string;
    sent_at: string;
  };
  const {
    data: openComplianceRequests = [],
    error: openComplianceRequestsError,
    isError: openComplianceRequestsIsError,
  } = useQuery({
    queryKey: ['admin-compliance-open-requests', orgId],
    enabled: Boolean(isAdmin && orgId),
    staleTime: 0,
    retry: 2,
    queryFn: async (): Promise<OpenComplianceRow[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('compliance_requests')
        .select('driver_id, task_key, status, sent_at')
        .eq('org_id', orgId)
        .in('status', ['sent', 'opened']);
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
  const {
    data: pendingVehicleRenewalsRaw = [],
    refetch: refetchPendingVehicleRenewals,
  } = useQuery({
    queryKey: ['admin-pending-vehicle-renewals', orgId],
    enabled: Boolean(isAdmin && orgId),
    staleTime: 0,
    retry: 1,
    queryFn: async (): Promise<PendingVehicleRenewalRow[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('compliance_requests')
        .select(
          'id, entity_id, task_key, task_label, proposed_expiry_date, submitted_document_url, external_recipient_email, request_url',
        )
        .eq('org_id', orgId)
        .eq('entity_type', 'vehicle')
        .eq('status', 'pending_admin_review')
        .in('task_key', ['annual_licensing', 'insurance']);
      if (error) throw error;
      return (data ?? []) as PendingVehicleRenewalRow[];
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  const pendingRenewalByVehicleTask = useMemo(() => {
    const m = new Map<string, { requestId: string; previewUrl: string; proposedExpiry: string }>();
    for (const r of pendingVehicleRenewalsRaw) {
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
  }, [pendingVehicleRenewalsRaw]);

  const pendingRenewalsDialogRows = useMemo(() => {
    const plateById = new Map(vehicles.map((v) => [String(v.id), String(v.plate_number ?? '')]));
    return pendingVehicleRenewalsRaw.map((r) => ({
      ...r,
      plate: plateById.get(String(r.entity_id ?? '').trim()) ?? '—',
    }));
  }, [pendingVehicleRenewalsRaw, vehicles]);

  /** מוצג מיד אחרי «שלח בקשה» עד שהשרת מחזיר שורה ב־compliance_requests (מונע תחושה ש«כלום לא קרה») */
  const [optimisticCompliancePending, setOptimisticCompliancePending] = useState<
    Record<string, { sentAt: string }>
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

  useEffect(() => {
    setOptimisticCompliancePending((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const r of openComplianceRequests) {
        const d = String(r.driver_id ?? '').trim();
        const t = String(r.task_key ?? '').trim();
        if (d && t) delete next[`${d}::${t}`];
      }
      return next;
    });
  }, [openComplianceRequests]);

  /** עדכון מיידי כשעובד חותם בטופס ציבורי — בלי רענון ידני */
  useEffect(() => {
    if (!isAdmin || !orgId) return;

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
        invalidateTower,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, orgId, queryClient]);

  /** בקשות פתוחות לפי נהג+משימה — לתצוגת «ממתין לחתימה» ותאריך שליחה */
  const pendingComplianceByDriverTask = useMemo(() => {
    const m = new Map<string, { sentAt: string; status: string }>();
    for (const r of openComplianceRequests) {
      const d = String(r.driver_id ?? '').trim();
      const t = String(r.task_key ?? '').trim();
      if (!d || !t) continue;
      m.set(`${d}::${t}`, {
        sentAt: String(r.sent_at ?? ''),
        status: String(r.status ?? '').trim() || 'sent',
      });
    }
    for (const [k, v] of Object.entries(optimisticCompliancePending)) {
      if (!m.has(k) && v?.sentAt) {
        m.set(k, { sentAt: v.sentAt, status: 'sent' });
      }
    }
    return m;
  }, [openComplianceRequests, optimisticCompliancePending]);

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
    annual_licensing: [...VEHICLE_DEFAULT_COLUMNS],
    insurance: [...VEHICLE_DEFAULT_COLUMNS],
    periodic_inspection: [...VEHICLE_DEFAULT_COLUMNS],
    maintenance: [...VEHICLE_DEFAULT_COLUMNS],
    driver_license: [...DRIVER_DEFAULT_COLUMNS],
    health_declaration: [...DRIVER_DEFAULT_COLUMNS],
    regulation_585: [...DRIVER_DEFAULT_COLUMNS],
  });
  const [defaultVisibleByTab, setDefaultVisibleByTab] = useState<Record<ComplianceTabKey, string[]>>({
    annual_licensing: [...VEHICLE_DEFAULT_COLUMNS],
    insurance: [...VEHICLE_DEFAULT_COLUMNS],
    periodic_inspection: [...VEHICLE_DEFAULT_COLUMNS],
    maintenance: [...VEHICLE_DEFAULT_COLUMNS],
    driver_license: [...DRIVER_DEFAULT_COLUMNS],
    health_declaration: [...DRIVER_DEFAULT_COLUMNS],
    regulation_585: [...DRIVER_DEFAULT_COLUMNS],
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
          const dueIso = dueIsoFromRaw(row[tab.dueField]);
          if (!dueIso) return false;
          const d = daysUntil(row[tab.dueField]);
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
          const aIso = dueIsoFromRaw(a[tab.dueField]) ?? '9999-12-31';
          const bIso = dueIsoFromRaw(b[tab.dueField]) ?? '9999-12-31';
          return aIso.localeCompare(bIso);
        });

      if (tab.key === 'health_declaration') {
        rows = rows.map((row) => {
          const id = String(row.id ?? '').trim();
          const pendingMeta = id ? pendingComplianceByDriverTask.get(`${id}::health_declaration`) : undefined;
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
    pendingComplianceByDriverTask,
  ]);

  const loading = vehiclesLoading || driversLoading;
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
  const currentAllColumns = activeDef.source === 'vehicle' ? filteredVehicleColumns : filteredDriverColumns;
  const currentSelectedForTab = visibleByTab[activeTab] ?? [];
  const effectiveSelectedCount = currentSelectedForTab.length > 0 ? currentSelectedForTab.length : 1;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMPLIANCE_COLUMNS_DEFAULTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ComplianceTabKey, string[]>>;
      const merged = {
        annual_licensing: parsed.annual_licensing ?? VEHICLE_DEFAULT_COLUMNS,
        insurance: parsed.insurance ?? VEHICLE_DEFAULT_COLUMNS,
        periodic_inspection: parsed.periodic_inspection ?? VEHICLE_DEFAULT_COLUMNS,
        maintenance: parsed.maintenance ?? VEHICLE_DEFAULT_COLUMNS,
        driver_license: parsed.driver_license ?? DRIVER_DEFAULT_COLUMNS,
        health_declaration: parsed.health_declaration ?? DRIVER_DEFAULT_COLUMNS,
        regulation_585: parsed.regulation_585 ?? DRIVER_DEFAULT_COLUMNS,
      } as Record<ComplianceTabKey, string[]>;
      setDefaultVisibleByTab((prev) => ({
        annual_licensing: parsed.annual_licensing ?? prev.annual_licensing,
        insurance: parsed.insurance ?? prev.insurance,
        periodic_inspection: parsed.periodic_inspection ?? prev.periodic_inspection,
        maintenance: parsed.maintenance ?? prev.maintenance,
        driver_license: parsed.driver_license ?? prev.driver_license,
        health_declaration: parsed.health_declaration ?? prev.health_declaration,
        regulation_585: parsed.regulation_585 ?? prev.regulation_585,
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
    setVisibleByTab((prev) => ({
      ...prev,
      annual_licensing: filterKeysByAvailable(prev.annual_licensing, availableVehicleKeys),
      insurance: filterKeysByAvailable(prev.insurance, availableVehicleKeys),
      periodic_inspection: filterKeysByAvailable(prev.periodic_inspection, availableVehicleKeys),
      maintenance: filterKeysByAvailable(prev.maintenance, availableVehicleKeys),
      driver_license: filterKeysByAvailable(prev.driver_license, availableDriverKeys),
      health_declaration: filterKeysByAvailable(prev.health_declaration, availableDriverKeys),
      regulation_585: filterKeysByAvailable(prev.regulation_585, availableDriverKeys),
    }));
  }, [availableVehicleKeys, availableDriverKeys]);

  useEffect(() => {
    setVisibleByTab((prev) => {
      const next = { ...prev };
      if (next.annual_licensing.length === 0) next.annual_licensing = filterKeysByAvailable(VEHICLE_DEFAULT_COLUMNS, availableVehicleKeys);
      if (next.insurance.length === 0) next.insurance = filterKeysByAvailable(VEHICLE_DEFAULT_COLUMNS, availableVehicleKeys);
      if (next.periodic_inspection.length === 0) next.periodic_inspection = filterKeysByAvailable(VEHICLE_DEFAULT_COLUMNS, availableVehicleKeys);
      if (next.maintenance.length === 0) next.maintenance = filterKeysByAvailable(VEHICLE_DEFAULT_COLUMNS, availableVehicleKeys);
      if (next.driver_license.length === 0) next.driver_license = filterKeysByAvailable(DRIVER_DEFAULT_COLUMNS, availableDriverKeys);
      if (next.health_declaration.length === 0) next.health_declaration = filterKeysByAvailable(DRIVER_DEFAULT_COLUMNS, availableDriverKeys);
      if (next.regulation_585.length === 0) next.regulation_585 = filterKeysByAvailable(DRIVER_DEFAULT_COLUMNS, availableDriverKeys);
      return next;
    });
  }, [availableVehicleKeys, availableDriverKeys]);

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
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    const quiet = options?.silent === true;
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
      const pendingKey = `${driverId}::${tab.key}`;
      if (!persistedExplicitFalse) {
        setOptimisticCompliancePending((prev) => ({
          ...prev,
          [pendingKey]: { sentAt: new Date().toISOString() },
        }));
      }
      if (persistedExplicitFalse) {
        toast.warning(
          'המייל נשלח, אך הבקשה לא נשמרה במסד — הסטטוס במגדל הציות לא יתעדכן עד שמיגרציית compliance_requests תופעל.',
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
    const normalized = next.length > 0 ? next : [activeDef.dueField];
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
    const normalized = next.length > 0 ? next : [activeDef.dueField];
    setVisibleByTab((prev) => ({ ...prev, [activeTab]: normalized }));
    toast.success('התצוגה נשמרה לסשן הנוכחי');
  };

  const restoreDefaultForActiveTab = () => {
    const fallback = [activeDef.dueField];
    const restored = (defaultVisibleByTab[activeTab] ?? fallback).length > 0 ? defaultVisibleByTab[activeTab] : fallback;
    setVisibleByTab((prev) => ({ ...prev, [activeTab]: restored }));
    toast.success('שוחזרה ברירת המחדל');
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
      toast.success('הרכב עודכן; המסמך נרשם בכרטיס הרכב; נשלח מייל לנהג (אם מוגדר).');
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
      toast.success('המייל נשלח לנציג הליסינג');
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

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <FleetHudPageShell
      title="מגדל ציות"
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
                  ממתינים לאישור ליסינג ({pendingVehicleRenewalsRaw.length})
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
            <SearchableColumnPicker
              allKeys={currentAllColumns}
              selected={visibleByTab[activeTab]}
              onSaveSession={saveColumnsSessionOnly}
              onSaveDefault={saveColumnsDefaults}
              onRestoreDefault={restoreDefaultForActiveTab}
              selectedCount={effectiveSelectedCount}
            />
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
                      columns={visibleByTab[tab.key]}
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
            לאחר השליחה הנציג יקבל קישור להעלאת צילום מסמך ולציון תאריך תוקף חדש. התוצאה תחזור למגדל הציות לאישורך;
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
              <DialogTitle className="text-base sm:text-lg">ממתינים לאישור — נציג ליסינג</DialogTitle>
            </DialogHeader>
            <p className="text-xs leading-snug text-muted-foreground sm:text-sm">
              רישוי שנתי וביטוח: הגשות לפני עדכון כרטיס הרכב. גלילה לרשימות ארוכות.
            </p>
          </div>
          {pendingRenewalsDialogRows.length === 0 ? (
            <p className="shrink-0 py-8 text-center text-sm text-muted-foreground">אין בקשות ממתינות כרגע.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
              <div className="overflow-x-auto rounded-md border">
                <Table dir="rtl">
                  <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">פעולות</TableHead>
                      <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">נציג (מייל)</TableHead>
                      <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">תוקף מוצע</TableHead>
                      <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">נושא</TableHead>
                      <TableHead className="h-9 py-1.5 text-right text-xs font-semibold">לוחית</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRenewalsDialogRows.map((row) => {
                      const docUrl = String(row.submitted_document_url ?? '').trim();
                      const rep = String(row.external_recipient_email ?? '').trim();
                      return (
                        <TableRow key={row.id} className="align-middle">
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
                          <TableCell
                            className="max-w-[7rem] py-2 text-right text-[11px] leading-tight break-all sm:max-w-[10rem]"
                            dir="ltr"
                          >
                            {rep || '—'}
                          </TableCell>
                          <TableCell className="py-2 tabular-nums text-xs" dir="ltr">
                            {row.proposed_expiry_date
                              ? String(row.proposed_expiry_date).slice(0, 10)
                              : '—'}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs">{row.task_label ?? '—'}</TableCell>
                          <TableCell className="py-2 text-right text-xs font-medium">{row.plate}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
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
    </FleetHudPageShell>
  );
}
