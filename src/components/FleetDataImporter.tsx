import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Car, Users, Loader2 } from 'lucide-react';
import { canonicalOwnershipType } from '@/lib/vehicleOwnership';
import { normalizePlateNumber } from '@/lib/plateNumber';
import { formatSupabaseError } from '@/lib/supabaseError';
import { useAuth } from '@/hooks/useAuth';
import {
  FLEET_EXCEL_IMPORT_EVENT,
  persistFleetExcelImportTimestamp,
} from '@/lib/fleetExcelImportStorage';

// ─── helpers ───

const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(value).trim();
  // Try M/D/YY or M/D/YYYY
  const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (parts) {
    let year = parseInt(parts[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(parseInt(parts[1])).padStart(2, '0')}-${String(parseInt(parts[2])).padStart(2, '0')}`;
  }
  return str || null;
};

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '' || v === '.') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
};

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
};

const bool = (v: any): boolean => {
  if (v === true || v === 1 || v === '1' || v === 'כן') return true;
  return false;
};

// ─── Normalize row keys ───
// Strip extra whitespace, normalize apostrophes, and trim
const normalizeKey = (key: string): string =>
  key.replace(/[\u2018\u2019\u05F3'`׳]/g, "'").replace(/\s+/g, ' ').trim();

const normalizeRow = (row: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[normalizeKey(key)] = value;
  }
  return result;
};

// ─── Vehicle row mapper ───

const mapVehicleRow = (rawRow: Record<string, any>) => {
  const row = normalizeRow(rawRow);
  return {
  plate_number: normalizePlateNumber(str(row["מס' רשוי"]) || str(row['מס רשוי']) || ''),
  manufacturer: str(row['שם יצרן']) || '',
  model: str(row['דגם']) || '',
  year: num(row['שנת ייצור']) || new Date().getFullYear(),
  current_odometer: num(row['ספידו אחרון']) || 0,
  last_odometer_date: parseExcelDate(row['תאריך ספידומטר']),
  next_maintenance_date: parseExcelDate(row['תאריך טיפול הבא']),
  next_maintenance_km: num(row['התראה235']),
  test_expiry: parseExcelDate(row['ת.רישוי']) || new Date().toISOString().slice(0, 10),
  insurance_expiry: parseExcelDate(row['ת.רישוי']) || new Date().toISOString().slice(0, 10),
  manufacturer_code: str(row['סמל יצרן']) || str(row['קוד יצרן']),
  model_code: str(row['סמל דגם']),
  ownership_type: canonicalOwnershipType(str(row['בעלות'])) || null,
  engine_volume: str(row['נפח']),
  is_active: str(row['סטטוס']) === 'פעיל' || bool(row['פעיל']),
  adjusted_price: num(row['מחיר מתואם']),
  tax_value_price: num(row['שווי שימוש לינארי']),
  vehicle_type_code: str(row['ק.סוג רכב']),
  chassis_number: str(row['מיספר חן']),
  monthly_total_cost: num(row['סכום חודשי כולל']),
  pickup_date: parseExcelDate(row['תאריך קניה']),
  sale_date: parseExcelDate(row['תאריך מכירה']),
  group_name: str(row['קבוצה']),
  internal_number: str(row['פנימי']) || str(row["מס' פנימי"]),
  vehicle_budget: num(row['תקציב רכב']),
  upgrade_addition: num(row['תוספת שדרוג']),
  vehicle_type_name: str(row['סוג רכב']),
  base_index: num(row['מדד בסיס']),
  driver_code: str(row['קוד נהג']),
  pascal: str(row['פסקל']),
  next_alert_km: num(row['התראה235']) ? Number(num(row['התראה235'])) : null,
  mandatory_end_date: parseExcelDate(row['תאריך סיום חובה']),
  odometer_diff_maintenance: num(row['הפרש ספידו מטיפול']),
  leasing_company_name: str(row['בעלות']),
  color: null as string | null,
  ignition_code: null as string | null,
  assigned_driver_id: null as string | null,
  };
};

// ─── Driver field aliases: each DB field → array of accepted Hebrew column names ───

const DRIVER_COLUMN_ALIASES: Record<string, string[]> = {
  full_name: ['שם נהג', 'שם מלא', 'שם'],
  id_number: ["מספר ת.ז", "ת.ז", "תעודת זהות", "ת.ז.", "מס' ת.ז", "מס' עובד", 'מספר עובד', 'קוד נהג'],
  phone: ['טלפון', 'נייד', 'נייד נהג', 'מספר טלפון', 'פלאפון'],
  email: ['מייל', 'אימייל', 'דוא"ל', 'email'],
  license_expiry: ['תוקף רישיון', 'תוקף רשיון', "ת.חידוש רשיון", 'תאריך חידוש רשיון', 'תאריך בדיקת רישיון', 'רישיון עד'],
  safety_training_date: ['תאריך השתלמות', 'השתלמות אחרונה', 'הדרכת בטיחות'],
  department: ['מחלקה'],
  address: ['כתובת', 'כתובת1', 'רחוב'],
  driver_code: ['קוד נהג'],
  is_active: ['פעיל=1 לא פעיל=0', 'פעיל', 'סטטוס'],
  employee_number: ["מס' עובד", 'מספר עובד'],
  work_start_date: ['תאריך התחלת עבודה', 'תאריך תחילת עבודה'],
  city: ['עיר'],
  note1: ['הערה 1'],
  note2: ['הערה 2'],
  rating: ['דירוג'],
  division: ['אגף', 'מחוז'],
  eligibility: ['זכאות', 'כשירות'],
  area: ['שטח', 'אזור'],
  group_name: ['קבוצה'],
  group_code: ['קוד קבוצה'],
  job_title: ['תפקיד'],
  license_number: ['מספר רשיון', 'מספר רישיון', 'רישוי'],
};

const DRIVER_REQUIRED_FIELDS = ['full_name', 'id_number'] as const;

const DRIVER_EXPECTED_COLUMNS_DISPLAY: Record<string, string> = {
  full_name: 'שם נהג',
  id_number: 'מספר ת.ז / ת.ז / מספר עובד',
  phone: 'טלפון / נייד',
  email: 'מייל / אימייל',
  license_expiry: 'תוקף רישיון / ת.חידוש רשיון',
};

/** Resolve a DB field from a row using all known aliases */
const resolveField = (row: Record<string, any>, aliases: string[]): any => {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null) return row[alias];
  }
  return undefined;
};

const mapDriverRow = (rawRow: Record<string, any>) => {
  const row = normalizeRow(rawRow);
  return {
  full_name: str(resolveField(row, DRIVER_COLUMN_ALIASES.full_name)) || '',
  id_number: str(resolveField(row, DRIVER_COLUMN_ALIASES.id_number)) || '',
  phone: str(resolveField(row, DRIVER_COLUMN_ALIASES.phone)),
  email: str(resolveField(row, DRIVER_COLUMN_ALIASES.email)),
  license_expiry: parseExcelDate(resolveField(row, DRIVER_COLUMN_ALIASES.license_expiry)) || new Date().toISOString().slice(0, 10),
  safety_training_date: parseExcelDate(resolveField(row, DRIVER_COLUMN_ALIASES.safety_training_date)),
  department: str(resolveField(row, DRIVER_COLUMN_ALIASES.department)),
  address: str(resolveField(row, DRIVER_COLUMN_ALIASES.address)),
  driver_code: str(resolveField(row, DRIVER_COLUMN_ALIASES.driver_code)),
  is_active: bool(resolveField(row, DRIVER_COLUMN_ALIASES.is_active)),
  employee_number: str(resolveField(row, DRIVER_COLUMN_ALIASES.employee_number)),
  work_start_date: parseExcelDate(resolveField(row, DRIVER_COLUMN_ALIASES.work_start_date)),
  city: str(resolveField(row, DRIVER_COLUMN_ALIASES.city)),
  note1: str(resolveField(row, DRIVER_COLUMN_ALIASES.note1)),
  note2: str(resolveField(row, DRIVER_COLUMN_ALIASES.note2)),
  rating: str(resolveField(row, DRIVER_COLUMN_ALIASES.rating)),
  division: str(resolveField(row, DRIVER_COLUMN_ALIASES.division)),
  eligibility: str(resolveField(row, DRIVER_COLUMN_ALIASES.eligibility)),
  area: str(resolveField(row, DRIVER_COLUMN_ALIASES.area)),
  group_name: str(resolveField(row, DRIVER_COLUMN_ALIASES.group_name)),
  group_code: str(resolveField(row, DRIVER_COLUMN_ALIASES.group_code)),
  job_title: str(resolveField(row, DRIVER_COLUMN_ALIASES.job_title)),
  license_number: str(resolveField(row, DRIVER_COLUMN_ALIASES.license_number)),
  };
};

/** Validate that the Excel has the required columns mapped correctly */
const validateDriverColumns = (
  sampleRow: Record<string, any>,
): { ok: true } | { ok: false; missing: string[]; found: string[] } => {
  const row = normalizeRow(sampleRow);
  const excelColumns = Object.keys(row);
  const missing: string[] = [];

  for (const reqField of DRIVER_REQUIRED_FIELDS) {
    const aliases = DRIVER_COLUMN_ALIASES[reqField];
    const matched = aliases.some((alias) => excelColumns.includes(alias));
    if (!matched) missing.push(DRIVER_EXPECTED_COLUMNS_DISPLAY[reqField] || reqField);
  }

  if (missing.length > 0) return { ok: false, missing, found: excelColumns };
  return { ok: true };
};

// ─── Component ───

export default function FleetDataImporter() {
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const vehicleInputRef = useRef<HTMLInputElement>(null);
  const driverInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { profile, activeOrgId } = useAuth();
  const effectiveOrgId = (activeOrgId ?? profile?.org_id ?? '').trim() || null;

  const readExcel = (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
          resolve(rows as Record<string, any>[]);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleVehicleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingVehicles(true);

    try {
      const rows = await readExcel(file);
      const mapped = rows
        .map(mapVehicleRow)
        .filter((v) => v.plate_number);

      if (mapped.length === 0) {
        toast({ title: 'לא נמצאו רכבים בקובץ', variant: 'destructive' });
        return;
      }

      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < mapped.length; i += chunkSize) {
        const slice = mapped.slice(i, i + chunkSize);
        const chunk = effectiveOrgId ? slice.map((row) => ({ ...row, org_id: effectiveOrgId })) : slice;
        const { error } = await supabase.from('vehicles').upsert(chunk as any, { onConflict: 'plate_number' });
        if (error) throw error;
        inserted += chunk.length;
      }

      // עדכון localStorage כדי שהדשבורד יתעדכן אוטומטית
      localStorage.setItem('vehicles_data', JSON.stringify(mapped));
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      const vehicleIso = persistFleetExcelImportTimestamp('vehicle', effectiveOrgId);
      try {
        window.dispatchEvent(
          new CustomEvent(FLEET_EXCEL_IMPORT_EVENT, {
            detail: { kind: 'vehicle', iso: vehicleIso },
          }),
        );
      } catch {
        // ignore
      }
      toast({ title: `נטענו ${inserted} רכבים בהצלחה` });
      window.location.reload();
    } catch (err: any) {
      toast({
        title: 'שגיאה בטעינת רכבים',
        description: formatSupabaseError(err),
        variant: 'destructive',
      });
    } finally {
      setLoadingVehicles(false);
      if (vehicleInputRef.current) vehicleInputRef.current.value = '';
    }
  };

  const handleDriverImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingDrivers(true);

    try {
      const rows = await readExcel(file);

      if (rows.length === 0) {
        toast({ title: 'הקובץ ריק — לא נמצאו שורות', variant: 'destructive' });
        return;
      }

      const validation = validateDriverColumns(rows[0]);
      if (!validation.ok) {
        const foundStr = validation.found.join(', ');
        const missingStr = validation.missing.join('\n');
        toast({
          title: 'עמודות חובה חסרות בקובץ',
          description:
            `העמודות הבאות חסרות או לא זוהו:\n${missingStr}\n\n` +
            `עמודות שזוהו בקובץ: ${foundStr}\n\n` +
            `שמות עמודות נתמכים:\n` +
            Object.entries(DRIVER_EXPECTED_COLUMNS_DISPLAY)
              .map(([, label]) => `• ${label}`)
              .join('\n'),
          variant: 'destructive',
        });
        return;
      }

      const mapped = rows
        .map(mapDriverRow)
        .filter((d) => d.full_name && d.id_number);

      if (mapped.length === 0) {
        toast({
          title: 'לא נמצאו נהגים תקינים בקובץ',
          description: 'כל שורה חייבת לכלול שם נהג ומספר ת.ז.',
          variant: 'destructive',
        });
        return;
      }

      const skipped = rows.length - mapped.length;

      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < mapped.length; i += chunkSize) {
        const slice = mapped.slice(i, i + chunkSize);
        const chunk = effectiveOrgId ? slice.map((row) => ({ ...row, org_id: effectiveOrgId })) : slice;
        const { error } = await supabase.from('drivers').upsert(chunk as any, {
          onConflict: effectiveOrgId ? 'id_number,org_id' : 'id_number',
        });
        if (error) throw error;
        inserted += chunk.length;
      }

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      const driverIso = persistFleetExcelImportTimestamp('driver', effectiveOrgId);
      try {
        window.dispatchEvent(
          new CustomEvent(FLEET_EXCEL_IMPORT_EVENT, {
            detail: { kind: 'driver', iso: driverIso },
          }),
        );
      } catch {
        // ignore
      }
      const skippedNote = skipped > 0 ? ` (${skipped} שורות דולגו — חסר שם או ת.ז)` : '';
      toast({ title: `נטענו ${inserted} נהגים בהצלחה${skippedNote}` });
    } catch (err: any) {
      const rawMsg = err?.message || '';
      const hebrewHint = /ON CONFLICT/i.test(rawMsg)
        ? 'שגיאת מסד נתונים: חסר אילוץ ייחודי (unique constraint). יש להריץ את מיגרציית drivers_unique_id_number_org_id.'
        : /not-null/i.test(rawMsg)
          ? 'שדה חובה חסר (שם נהג או מספר ת.ז ריק).'
          : rawMsg;
      toast({
        title: 'שגיאה בטעינת נהגים',
        description: hebrewHint,
        variant: 'destructive',
      });
    } finally {
      setLoadingDrivers(false);
      if (driverInputRef.current) driverInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Vehicle Import */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>טעינת טבלת רכבים</CardTitle>
              <CardDescription>העלה קובץ Excel עם נתוני רכבים ליצירה אוטומטית</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <input
            ref={vehicleInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleVehicleImport}
          />
          <Button
            onClick={() => vehicleInputRef.current?.click()}
            disabled={loadingVehicles}
            className="w-full"
          >
            {loadingVehicles ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                טוען רכבים...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 ml-2" />
                בחר קובץ רכבים
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Driver Import */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle>טעינת טבלת נהגים</CardTitle>
              <CardDescription>העלה קובץ Excel עם נתוני נהגים ליצירה אוטומטית</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={driverInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleDriverImport}
          />
          <Button
            onClick={() => driverInputRef.current?.click()}
            disabled={loadingDrivers}
            variant="secondary"
            className="w-full"
          >
            {loadingDrivers ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                טוען נהגים...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 ml-2" />
                בחר קובץ נהגים
              </>
            )}
          </Button>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              שמות עמודות נתמכים (לחץ להרחבה)
            </summary>
            <div className="mt-2 space-y-1 bg-card/60 border border-border rounded-md p-3">
              <p className="font-medium text-foreground/80 mb-1">
                עמודות חובה מסומנות בכוכבית *
              </p>
              {Object.entries(DRIVER_COLUMN_ALIASES).map(([field, aliases]) => {
                const isRequired = (DRIVER_REQUIRED_FIELDS as readonly string[]).includes(field);
                return (
                  <div key={field} className="flex flex-wrap items-baseline gap-1">
                    <span className={isRequired ? 'font-semibold text-primary' : ''}>
                      {DRIVER_EXPECTED_COLUMNS_DISPLAY[field] || aliases[0]}
                      {isRequired && ' *'}:
                    </span>
                    <span dir="rtl" className="text-muted-foreground">
                      {aliases.join(' / ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
