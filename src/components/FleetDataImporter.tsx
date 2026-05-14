import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Car, Users, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { canonicalOwnershipType } from '@/lib/vehicleOwnership';
import { normalizePlateNumber } from '@/lib/plateNumber';
import { formatSupabaseError } from '@/lib/supabaseError';
import { useAuth } from '@/hooks/useAuth';
import {
  FLEET_EXCEL_IMPORT_EVENT,
  persistFleetExcelImportTimestamp,
} from '@/lib/fleetExcelImportStorage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── helpers ───

const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(value).trim();
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (parts) {
    let year = parseInt(parts[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(parseInt(parts[1])).padStart(2, '0')}-${String(parseInt(parts[2])).padStart(2, '0')}`;
  }
  return s || null;
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

// ─── Driver field definitions for the mapping wizard ───

interface DriverFieldDef {
  dbField: string;
  label: string;
  aliases: string[];
  required: boolean;
  type: 'text' | 'date' | 'boolean';
}

const DRIVER_FIELDS: DriverFieldDef[] = [
  { dbField: 'full_name', label: 'שם מלא', aliases: ['שם נהג', 'שם מלא', 'שם'], required: true, type: 'text' },
  { dbField: 'id_number', label: 'מספר ת.ז / מספר עובד', aliases: ["מספר ת.ז", "ת.ז", "תעודת זהות", "ת.ז.", "מס' ת.ז", "מס' עובד", 'מספר עובד', 'קוד נהג'], required: true, type: 'text' },
  { dbField: 'phone', label: 'טלפון', aliases: ['טלפון', 'נייד', 'נייד נהג', 'מספר טלפון', 'פלאפון'], required: false, type: 'text' },
  { dbField: 'email', label: 'אימייל', aliases: ['מייל', 'אימייל', 'דוא"ל', 'email'], required: false, type: 'text' },
  { dbField: 'license_expiry', label: 'תוקף רישיון נהיגה', aliases: ['תוקף רישיון', 'תוקף רשיון', "ת.חידוש רשיון", 'תאריך חידוש רשיון', 'תאריך בדיקת רישיון', 'רישיון עד'], required: false, type: 'date' },
  { dbField: 'safety_training_date', label: 'תאריך הדרכת בטיחות', aliases: ['תאריך השתלמות', 'השתלמות אחרונה', 'הדרכת בטיחות'], required: false, type: 'date' },
  { dbField: 'department', label: 'מחלקה', aliases: ['מחלקה'], required: false, type: 'text' },
  { dbField: 'address', label: 'כתובת', aliases: ['כתובת', 'כתובת1', 'רחוב'], required: false, type: 'text' },
  { dbField: 'driver_code', label: 'קוד נהג', aliases: ['קוד נהג'], required: false, type: 'text' },
  { dbField: 'is_active', label: 'פעיל', aliases: ['פעיל=1 לא פעיל=0', 'פעיל', 'סטטוס'], required: false, type: 'boolean' },
  { dbField: 'employee_number', label: 'מספר עובד', aliases: ["מס' עובד", 'מספר עובד'], required: false, type: 'text' },
  { dbField: 'work_start_date', label: 'תאריך תחילת עבודה', aliases: ['תאריך התחלת עבודה', 'תאריך תחילת עבודה'], required: false, type: 'date' },
  { dbField: 'city', label: 'עיר', aliases: ['עיר'], required: false, type: 'text' },
  { dbField: 'note1', label: 'הערה 1', aliases: ['הערה 1'], required: false, type: 'text' },
  { dbField: 'note2', label: 'הערה 2', aliases: ['הערה 2'], required: false, type: 'text' },
  { dbField: 'rating', label: 'דירוג', aliases: ['דירוג'], required: false, type: 'text' },
  { dbField: 'division', label: 'אגף / מחוז', aliases: ['אגף', 'מחוז'], required: false, type: 'text' },
  { dbField: 'eligibility', label: 'זכאות', aliases: ['זכאות', 'כשירות'], required: false, type: 'text' },
  { dbField: 'area', label: 'אזור', aliases: ['שטח', 'אזור'], required: false, type: 'text' },
  { dbField: 'group_name', label: 'קבוצה', aliases: ['קבוצה'], required: false, type: 'text' },
  { dbField: 'group_code', label: 'קוד קבוצה', aliases: ['קוד קבוצה'], required: false, type: 'text' },
  { dbField: 'job_title', label: 'תפקיד', aliases: ['תפקיד'], required: false, type: 'text' },
  { dbField: 'license_number', label: 'מספר רישיון', aliases: ['מספר רשיון', 'מספר רישיון', 'רישוי'], required: false, type: 'text' },
  { dbField: 'birth_date', label: 'תאריך לידה', aliases: ['תאריך לידה', 'ת.לידה'], required: false, type: 'date' },
  { dbField: 'driving_permit', label: 'רישיון נהיגה (סוג)', aliases: ['רישיון נהיגה', 'סוג רישיון', 'דרגת רישיון'], required: false, type: 'text' },
  { dbField: 'safety_officer', label: 'קצין בטיחות', aliases: ['קצין בטיחות', 'קב"ט'], required: false, type: 'text' },
];

type ColumnMapping = Record<string, string>; // dbField → excelColumn

/** Auto-match Excel columns to DB fields using known aliases */
function autoMatchColumns(excelColumns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedCols = excelColumns.map(normalizeKey);

  for (const field of DRIVER_FIELDS) {
    for (const alias of field.aliases) {
      const idx = normalizedCols.indexOf(alias);
      if (idx !== -1 && !Object.values(mapping).includes(excelColumns[idx])) {
        mapping[field.dbField] = excelColumns[idx];
        break;
      }
    }
  }
  return mapping;
}

/** Map a raw row to DB fields using user-confirmed column mapping (fully dynamic) */
function mapDriverRowWithMapping(rawRow: Record<string, any>, mapping: ColumnMapping) {
  const row = normalizeRow(rawRow);

  const getVal = (dbField: string): any => {
    const excelCol = mapping[dbField];
    if (!excelCol) return undefined;
    const normalized = normalizeKey(excelCol);
    return row[normalized] ?? undefined;
  };

  const result: Record<string, any> = {
    full_name: str(getVal('full_name')) || '',
    id_number: str(getVal('id_number')) || '',
    license_expiry: parseExcelDate(getVal('license_expiry')) || new Date().toISOString().slice(0, 10),
    status: 'valid',
    is_active: getVal('is_active') !== undefined ? bool(getVal('is_active')) : true,
  };

  for (const field of DRIVER_FIELDS) {
    if (['full_name', 'id_number', 'is_active'].includes(field.dbField)) continue;
    if (!mapping[field.dbField]) continue;

    const raw = getVal(field.dbField);
    if (raw === undefined || raw === null) continue;

    if (field.type === 'date') {
      const parsed = parseExcelDate(raw);
      if (parsed) result[field.dbField] = parsed;
    } else if (field.type === 'boolean') {
      // handled above for is_active
    } else {
      const val = str(raw);
      if (val) result[field.dbField] = val;
    }
  }

  return result;
}

// ─── Mapping Wizard Dialog ───

interface MappingWizardProps {
  open: boolean;
  onClose: () => void;
  excelColumns: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
  onConfirm: (mapping: ColumnMapping) => void;
}

function ColumnMappingWizard({ open, onClose, excelColumns, sampleRows, totalRows, onConfirm }: MappingWizardProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMatchColumns(excelColumns));

  const handleFieldChange = (dbField: string, excelCol: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (excelCol === '__none__') {
        delete next[dbField];
      } else {
        next[dbField] = excelCol;
      }
      return next;
    });
  };

  const requiredMissing = DRIVER_FIELDS
    .filter((f) => f.required && !mapping[f.dbField])
    .map((f) => f.label);

  const canConfirm = requiredMissing.length === 0;

  const formatSample = (col: string) => {
    const val = sampleRows[0]?.[col];
    if (val === null || val === undefined) return '—';
    return String(val).slice(0, 30);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">מיפוי עמודות — טעינת נהגים</DialogTitle>
          <DialogDescription>
            זוהו {excelColumns.length} עמודות ו-{totalRows} שורות בקובץ. בדוק את המיפוי ותקן במידת הצורך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mt-4">
          {DRIVER_FIELDS.filter((f) => f.required || mapping[f.dbField]).map((field) => {
            const matched = mapping[field.dbField];
            return (
              <div key={field.dbField} className="flex items-center gap-3 p-2 rounded-md border border-border/50 bg-card/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {matched ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : field.required ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${field.required ? 'text-primary' : ''}`}>
                      {field.label}
                      {field.required && ' *'}
                    </span>
                  </div>
                  {matched && (
                    <span className="text-xs text-muted-foreground mr-6 block truncate">
                      דוגמה: {formatSample(matched)}
                    </span>
                  )}
                </div>
                <div className="w-48 shrink-0">
                  <Select
                    value={matched || '__none__'}
                    onValueChange={(val) => handleFieldChange(field.dbField, val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="בחר עמודה..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— לא ממופה —</SelectItem>
                      {excelColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}

          {/* Show unmapped optional fields as expandable */}
          {DRIVER_FIELDS.some((f) => !f.required && !mapping[f.dbField]) && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                שדות נוספים לא ממופים ({DRIVER_FIELDS.filter((f) => !f.required && !mapping[f.dbField]).length})
              </summary>
              <div className="space-y-1 mt-2">
                {DRIVER_FIELDS.filter((f) => !f.required && !mapping[f.dbField]).map((field) => (
                  <div key={field.dbField} className="flex items-center gap-3 p-2 rounded-md border border-border/30">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground">{field.label}</span>
                    </div>
                    <div className="w-48 shrink-0">
                      <Select
                        value="__none__"
                        onValueChange={(val) => handleFieldChange(field.dbField, val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="בחר עמודה..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— לא ממופה —</SelectItem>
                          {excelColumns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Preview table */}
        {sampleRows.length > 0 && (
          <div className="mt-4 border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-right font-medium">#</th>
                  {Object.entries(mapping).map(([dbField, excelCol]) => (
                    <th key={dbField} className="px-2 py-1.5 text-right font-medium">
                      {DRIVER_FIELDS.find((f) => f.dbField === dbField)?.label || dbField}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    {Object.entries(mapping).map(([dbField, excelCol]) => (
                      <td key={dbField} className="px-2 py-1 truncate max-w-[120px]">
                        {row[excelCol] != null ? String(row[excelCol]).slice(0, 20) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {requiredMissing.length > 0 && (
          <p className="text-sm text-destructive mt-3">
            שדות חובה לא ממופים: {requiredMissing.join(', ')}
          </p>
        )}

        <div className="flex gap-3 mt-4 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button
            onClick={() => onConfirm(mapping)}
            disabled={!canConfirm}
          >
            <ArrowLeft className="h-4 w-4 ml-2" />
            אישור וטעינת {totalRows} נהגים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

export default function FleetDataImporter() {
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const vehicleInputRef = useRef<HTMLInputElement>(null);
  const driverInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { profile, activeOrgId } = useAuth();
  const effectiveOrgId = (activeOrgId ?? profile?.org_id ?? '').trim() || null;

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardExcelColumns, setWizardExcelColumns] = useState<string[]>([]);
  const [wizardSampleRows, setWizardSampleRows] = useState<Record<string, any>[]>([]);
  const [wizardAllRows, setWizardAllRows] = useState<Record<string, any>[]>([]);

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

      const chunkSize = 200;
      let inserted = 0;

      for (let i = 0; i < mapped.length; i += chunkSize) {
        const slice = mapped.slice(i, i + chunkSize);
        const chunk = slice.map((row) => ({
          ...row,
          ...(effectiveOrgId ? { org_id: effectiveOrgId } : {}),
        }));

        const { error } = await supabase.rpc('bulk_upsert_vehicles', {
          vehicles: chunk,
        });
        if (error) throw error;
        inserted += chunk.length;
      }

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
      console.error('[VehicleImport] error:', err);
      toast({
        title: 'שגיאה בטעינת רכבים',
        description: err?.message || formatSupabaseError(err),
        variant: 'destructive',
      });
    } finally {
      setLoadingVehicles(false);
      if (vehicleInputRef.current) vehicleInputRef.current.value = '';
    }
  };

  // Step 1: Parse file and open mapping wizard
  const handleDriverFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await readExcel(file);
      if (rows.length === 0) {
        toast({ title: 'הקובץ ריק — לא נמצאו שורות', variant: 'destructive' });
        return;
      }

      const columns = Object.keys(rows[0] || {});
      setWizardExcelColumns(columns);
      setWizardSampleRows(rows.slice(0, 5));
      setWizardAllRows(rows);
      setWizardOpen(true);
    } catch (err: any) {
      toast({ title: 'שגיאה בקריאת הקובץ', description: err?.message || '', variant: 'destructive' });
    } finally {
      if (driverInputRef.current) driverInputRef.current.value = '';
    }
  };

  // Step 2: User confirmed the mapping — execute import
  const executeDriverImport = useCallback(async (mapping: ColumnMapping) => {
    setWizardOpen(false);
    setLoadingDrivers(true);

    try {
      const rows = wizardAllRows;

      const mapped = rows
        .map((row) => mapDriverRowWithMapping(row, mapping))
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
      const chunkSize = 200;
      let inserted = 0;

      for (let i = 0; i < mapped.length; i += chunkSize) {
        const slice = mapped.slice(i, i + chunkSize);
        const chunk = slice.map((row) => ({
          ...row,
          ...(effectiveOrgId ? { org_id: effectiveOrgId } : {}),
        }));

        const { error } = await supabase.rpc('bulk_upsert_drivers', {
          drivers: chunk,
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
      const code = err?.code || '';
      let hebrewHint: string;
      if (/ON CONFLICT/i.test(rawMsg)) {
        hebrewHint = 'שגיאת מסד נתונים: חסר אילוץ ייחודי (unique constraint). יש להריץ את מיגרציית drivers_unique_id_number_org_id.';
      } else if (/not-null/i.test(rawMsg) || code === '23502') {
        const colMatch = rawMsg.match(/column\s+"([^"]+)"/);
        const colName = colMatch?.[1] || '';
        hebrewHint = colName
          ? `שדה חובה "${colName}" ריק — לא ניתן לשמור. (${rawMsg})`
          : `שדה חובה חסר במסד הנתונים. (${rawMsg})`;
      } else if (/duplicate key|unique/i.test(rawMsg) || code === '23505') {
        hebrewHint = `שורה כפולה בקובץ או במסד הנתונים. (${rawMsg})`;
      } else {
        hebrewHint = rawMsg;
      }
      console.error('[DriverImport] upsert error:', err);
      toast({
        title: 'שגיאה בטעינת נהגים',
        description: hebrewHint,
        variant: 'destructive',
      });
    } finally {
      setLoadingDrivers(false);
      setWizardAllRows([]);
      setWizardSampleRows([]);
      setWizardExcelColumns([]);
    }
  }, [wizardAllRows, effectiveOrgId, queryClient]);

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
            onChange={handleDriverFileSelect}
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
        </CardContent>
      </Card>

      {/* Column Mapping Wizard Dialog */}
      <ColumnMappingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        excelColumns={wizardExcelColumns}
        sampleRows={wizardSampleRows}
        totalRows={wizardAllRows.length}
        onConfirm={executeDriverImport}
      />
    </div>
  );
}
