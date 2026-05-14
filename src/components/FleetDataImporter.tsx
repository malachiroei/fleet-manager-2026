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

// ─── Vehicle field definitions for the mapping wizard ───

interface FieldDef {
  dbField: string;
  label: string;
  aliases: string[];
  required: boolean;
  type: 'text' | 'date' | 'boolean' | 'number';
}

const VEHICLE_FIELDS: FieldDef[] = [
  { dbField: 'plate_number', label: 'מספר רישוי', aliases: ["מס' רשוי", 'מס רשוי', 'לוחית רישוי', 'מספר רכב', 'רישוי'], required: true, type: 'text' },
  { dbField: 'manufacturer', label: 'יצרן', aliases: ['שם יצרן', 'יצרן', 'חברה'], required: false, type: 'text' },
  { dbField: 'model', label: 'דגם', aliases: ['דגם', 'שם דגם'], required: false, type: 'text' },
  { dbField: 'year', label: 'שנת ייצור', aliases: ['שנת ייצור', 'שנה', 'שנת רישום'], required: false, type: 'number' },
  { dbField: 'current_odometer', label: 'ספידומטר', aliases: ['ספידו אחרון', 'ספידומטר', 'ק"מ', 'קילומטראז'], required: false, type: 'number' },
  { dbField: 'color', label: 'צבע', aliases: ['צבע', 'צבע רכב'], required: false, type: 'text' },
  { dbField: 'fuel_type', label: 'סוג דלק / הנעה', aliases: ['קוד הנעה', 'סוג דלק', 'הנעה', 'דלק'], required: false, type: 'text' },
  { dbField: 'test_expiry', label: 'תוקף רישוי (טסט)', aliases: ['ת.רישוי', 'תוקף טסט', 'תוקף רישוי'], required: false, type: 'date' },
  { dbField: 'ownership_type', label: 'בעלות', aliases: ['בעלות', 'סוג בעלות'], required: false, type: 'text' },
  { dbField: 'leasing_company_name', label: 'חברת ליסינג', aliases: ['חברת ליסינג', 'ליסינג', 'עלות ליסינג'], required: false, type: 'text' },
  { dbField: 'engine_volume', label: 'נפח מנוע', aliases: ['נפח', 'נפח מנוע'], required: false, type: 'text' },
  { dbField: 'vehicle_type_name', label: 'סוג רכב', aliases: ['סוג רכב', 'קטגוריה'], required: false, type: 'text' },
  { dbField: 'group_name', label: 'קבוצה', aliases: ['קבוצה'], required: false, type: 'text' },
  { dbField: 'internal_number', label: 'מספר פנימי', aliases: ['פנימי', "מס' פנימי", 'מספר פנימי'], required: false, type: 'text' },
  { dbField: 'driver_code', label: 'קוד נהג', aliases: ['קוד נהג'], required: false, type: 'text' },
  { dbField: 'chassis_number', label: 'מספר שלדה', aliases: ['מיספר חן', 'מספר שלדה', 'שלדה'], required: false, type: 'text' },
  { dbField: 'model_code', label: 'סמל דגם', aliases: ['סמל דגם', 'סכל דגם', 'קוד דגם'], required: false, type: 'text' },
  { dbField: 'manufacturer_code', label: 'סמל יצרן', aliases: ['סמל יצרן', 'קוד יצרן'], required: false, type: 'text' },
  { dbField: 'next_maintenance_km', label: 'טיפול הבא (ק"מ)', aliases: ['התראה235', 'טיפול הבא ק"מ'], required: false, type: 'number' },
  { dbField: 'next_maintenance_date', label: 'תאריך טיפול הבא', aliases: ['תאריך טיפול הבא'], required: false, type: 'date' },
  { dbField: 'pickup_date', label: 'תאריך קנייה', aliases: ['תאריך קניה', 'תאריך קנייה', 'תאריך רכישה'], required: false, type: 'date' },
  { dbField: 'sale_date', label: 'תאריך מכירה', aliases: ['תאריך מכירה'], required: false, type: 'date' },
  { dbField: 'mandatory_end_date', label: 'תאריך סיום חובה', aliases: ['תאריך סיום חובה'], required: false, type: 'date' },
  { dbField: 'adjusted_price', label: 'מחיר מתואם', aliases: ['מחיר מתואם'], required: false, type: 'number' },
  { dbField: 'monthly_total_cost', label: 'עלות חודשית', aliases: ['סכום חודשי כולל', 'עלות חודשית'], required: false, type: 'number' },
  { dbField: 'vehicle_budget', label: 'תקציב רכב', aliases: ['תקציב רכב'], required: false, type: 'number' },
  { dbField: 'tax_value_price', label: 'שווי שימוש', aliases: ['שווי שימוש לינארי', 'שווי שימוש'], required: false, type: 'number' },
  // Virtual field for driver name matching
  { dbField: '_driver_name', label: 'שם נהג (לשיוך)', aliases: ['שם נהג', 'נהג', 'שם הנהג'], required: false, type: 'text' },
];

/** Map vehicle row dynamically from user-confirmed mapping */
function mapVehicleRowWithMapping(rawRow: Record<string, any>, mapping: ColumnMapping) {
  const row = normalizeRow(rawRow);

  const getVal = (dbField: string): any => {
    const excelCol = mapping[dbField];
    if (!excelCol) return undefined;
    const normalized = normalizeKey(excelCol);
    return row[normalized] ?? undefined;
  };

  const result: Record<string, any> = {
    plate_number: normalizePlateNumber(str(getVal('plate_number')) || ''),
    manufacturer: str(getVal('manufacturer')) || '',
    model: str(getVal('model')) || '',
    year: num(getVal('year')) || new Date().getFullYear(),
    current_odometer: num(getVal('current_odometer')) || 0,
    is_active: getVal('is_active') !== undefined ? bool(getVal('is_active')) : true,
  };

  for (const field of VEHICLE_FIELDS) {
    if (['plate_number', '_driver_name'].includes(field.dbField)) continue;
    if (result[field.dbField] !== undefined) continue;
    if (!mapping[field.dbField]) continue;

    const raw = getVal(field.dbField);
    if (raw === undefined || raw === null) continue;

    if (field.type === 'date') {
      const parsed = parseExcelDate(raw);
      if (parsed) result[field.dbField] = parsed;
    } else if (field.type === 'number') {
      const n = num(raw);
      if (n !== null) result[field.dbField] = n;
    } else {
      const val = str(raw);
      if (val) result[field.dbField] = val;
    }
  }

  // Handle ownership type canonicalization
  if (result.ownership_type) {
    result.ownership_type = canonicalOwnershipType(result.ownership_type) || result.ownership_type;
  }

  return result;
}

/** Auto-match vehicle Excel columns */
function autoMatchVehicleColumns(excelColumns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedCols = excelColumns.map(normalizeKey);

  for (const field of VEHICLE_FIELDS) {
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

  // Columns already used by other fields
  const usedColumns = new Set(Object.values(mapping));

  const availableColumnsFor = (currentDbField: string) => {
    const currentVal = mapping[currentDbField];
    return excelColumns.filter((col) => col === currentVal || !usedColumns.has(col));
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
                      {availableColumnsFor(field.dbField).map((col) => (
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
                          {availableColumnsFor(field.dbField).map((col) => (
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

// ─── Vehicle Mapping Wizard ───

interface VehicleMappingWizardProps {
  open: boolean;
  onClose: () => void;
  excelColumns: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
  onConfirm: (mapping: ColumnMapping) => void;
}

function VehicleMappingWizard({
  open, onClose, excelColumns, sampleRows, totalRows, onConfirm,
}: VehicleMappingWizardProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMatchVehicleColumns(excelColumns));

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

  const usedColumns = new Set(Object.values(mapping));

  const availableColumnsFor = (currentDbField: string) => {
    const currentVal = mapping[currentDbField];
    return excelColumns.filter((col) => col === currentVal || !usedColumns.has(col));
  };

  const requiredMissing = VEHICLE_FIELDS
    .filter((f) => f.required && !mapping[f.dbField])
    .map((f) => f.label);
  const canConfirm = requiredMissing.length === 0;

  // Re-run auto-match when columns change
  useState(() => { setMapping(autoMatchVehicleColumns(excelColumns)); });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            אשף מיפוי עמודות רכבים
          </DialogTitle>
          <DialogDescription>
            מצאנו {excelColumns.length} עמודות ו-{totalRows} שורות. מפו כל עמודה לשדה המתאים.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {VEHICLE_FIELDS.map((field) => {
            const matched = mapping[field.dbField];
            return (
              <div
                key={field.dbField}
                className={`flex items-center gap-3 p-2 rounded-md border ${
                  matched ? 'border-primary/40' : 'border-border/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.required && <span className="text-destructive mr-1">*</span>}
                  {field.dbField === '_driver_name' && (
                    <span className="text-xs text-blue-600 mr-2">(שיוך נהג)</span>
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
                      {availableColumnsFor(field.dbField).map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-5">
                  {matched ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : field.required ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {sampleRows.length > 0 && (
          <div className="mt-4 border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-right font-medium">#</th>
                  {Object.entries(mapping).map(([dbField]) => (
                    <th key={dbField} className="px-2 py-1.5 text-right font-medium">
                      {VEHICLE_FIELDS.find((f) => f.dbField === dbField)?.label || dbField}
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
          <Button onClick={() => onConfirm(mapping)} disabled={!canConfirm}>
            <ArrowLeft className="h-4 w-4 ml-2" />
            המשך — {totalRows} רכבים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Driver Assignment Dialog ───

interface DriverMatch {
  plateNumber: string;
  excelDriverName: string;
  matchedDriverId: string;
  matchedDriverFullName: string;
  approved: boolean;
}

interface DriverAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  matches: DriverMatch[];
  onConfirm: (approvedMatches: DriverMatch[]) => void;
}

function DriverAssignmentDialog({ open, onClose, matches, onConfirm }: DriverAssignmentDialogProps) {
  const [localMatches, setLocalMatches] = useState<DriverMatch[]>(matches);

  const toggleMatch = (idx: number) => {
    setLocalMatches((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, approved: !m.approved } : m))
    );
  };

  const approveAll = () => {
    setLocalMatches((prev) => prev.map((m) => ({ ...m, approved: true })));
  };

  const rejectAll = () => {
    setLocalMatches((prev) => prev.map((m) => ({ ...m, approved: false })));
  };

  // Sync when matches prop changes
  useState(() => { setLocalMatches(matches); });

  const approvedCount = localMatches.filter((m) => m.approved).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            שיוך נהגים לרכבים
          </DialogTitle>
          <DialogDescription>
            נמצאו {matches.length} התאמות בין שמות נהגים בקובץ לנהגים קיימים במערכת.
            אשר או בטל שיוכים לפי הצורך.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={approveAll}>
            <CheckCircle2 className="h-3 w-3 ml-1" />
            אשר הכל ({matches.length})
          </Button>
          <Button size="sm" variant="outline" onClick={rejectAll}>
            בטל הכל
          </Button>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {localMatches.map((match, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                match.approved ? 'border-green-300 bg-green-50' : 'border-border/50'
              }`}
              onClick={() => toggleMatch(idx)}
            >
              <input
                type="checkbox"
                checked={match.approved}
                onChange={() => toggleMatch(idx)}
                className="h-4 w-4 accent-green-600"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  רכב {match.plateNumber}
                </div>
                <div className="text-xs text-muted-foreground">
                  נהג באקסל: <span className="font-medium">{match.excelDriverName}</span>
                  {' ← '}
                  נהג במערכת: <span className="font-medium text-blue-700">{match.matchedDriverFullName}</span>
                </div>
              </div>
              {match.approved && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-4 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול הייבוא</Button>
          <Button onClick={() => onConfirm(localMatches)}>
            <ArrowLeft className="h-4 w-4 ml-2" />
            ייבא רכבים ({approvedCount > 0 ? `עם ${approvedCount} שיוכים` : 'ללא שיוכים'})
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

  // Driver wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardExcelColumns, setWizardExcelColumns] = useState<string[]>([]);
  const [wizardSampleRows, setWizardSampleRows] = useState<Record<string, any>[]>([]);
  const [wizardAllRows, setWizardAllRows] = useState<Record<string, any>[]>([]);

  // Vehicle wizard state
  const [vWizardOpen, setVWizardOpen] = useState(false);
  const [vWizardExcelColumns, setVWizardExcelColumns] = useState<string[]>([]);
  const [vWizardSampleRows, setVWizardSampleRows] = useState<Record<string, any>[]>([]);
  const [vWizardAllRows, setVWizardAllRows] = useState<Record<string, any>[]>([]);
  const [vWizardMapping, setVWizardMapping] = useState<ColumnMapping>({});

  // Driver assignment dialog state
  const [driverAssignOpen, setDriverAssignOpen] = useState(false);
  const [driverMatches, setDriverMatches] = useState<DriverMatch[]>([]);
  const [pendingVehiclePayload, setPendingVehiclePayload] = useState<Record<string, any>[]>([]);

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

  // Step 1: Parse vehicle file and open mapping wizard
  const handleVehicleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await readExcel(file);
      if (rows.length === 0) {
        toast({ title: 'הקובץ ריק', variant: 'destructive' });
        return;
      }
      const columns = Object.keys(rows[0]);
      setVWizardExcelColumns(columns);
      setVWizardSampleRows(rows.slice(0, 5));
      setVWizardAllRows(rows);
      setVWizardOpen(true);
    } catch (err: any) {
      toast({ title: 'שגיאה בקריאת הקובץ', description: err?.message, variant: 'destructive' });
    } finally {
      if (vehicleInputRef.current) vehicleInputRef.current.value = '';
    }
  };

  // Step 2: After mapping confirmed, search for driver matches
  const handleVehicleMappingConfirm = useCallback(async (mapping: ColumnMapping) => {
    setVWizardOpen(false);
    setVWizardMapping(mapping);
    setLoadingVehicles(true);

    try {
      const mapped = vWizardAllRows
        .map((row) => mapVehicleRowWithMapping(row, mapping))
        .filter((v) => v.plate_number);

      if (mapped.length === 0) {
        toast({ title: 'לא נמצאו רכבים בקובץ', variant: 'destructive' });
        return;
      }

      // Check if driver_name is mapped — if so, find matches
      const driverNameCol = mapping['_driver_name'];
      if (driverNameCol) {
        // Extract driver names from Excel
        const driverNamesFromExcel: { plateNumber: string; name: string }[] = [];
        for (let i = 0; i < vWizardAllRows.length; i++) {
          const rawRow = normalizeRow(vWizardAllRows[i]);
          const normalizedCol = normalizeKey(driverNameCol);
          const driverName = str(rawRow[normalizedCol]);
          if (driverName && mapped[i]?.plate_number) {
            driverNamesFromExcel.push({
              plateNumber: mapped[i].plate_number as string,
              name: driverName,
            });
          }
        }

        if (driverNamesFromExcel.length > 0) {
          // Fetch all drivers from this org
          const { data: drivers } = await supabase
            .from('drivers')
            .select('id, full_name')
            .eq('org_id', effectiveOrgId || '');

          if (drivers && drivers.length > 0) {
            const matches: DriverMatch[] = [];

            for (const entry of driverNamesFromExcel) {
              // Normalize and search for name match (case-insensitive, trimmed)
              const searchName = entry.name.trim().toLowerCase();
              const found = drivers.find((d) => {
                const dbName = (d.full_name || '').trim().toLowerCase();
                return dbName === searchName || dbName.includes(searchName) || searchName.includes(dbName);
              });

              if (found) {
                matches.push({
                  plateNumber: entry.plateNumber,
                  excelDriverName: entry.name,
                  matchedDriverId: found.id,
                  matchedDriverFullName: found.full_name || '',
                  approved: true,
                });
              }
            }

            if (matches.length > 0) {
              setPendingVehiclePayload(mapped.map((row) => ({
                ...row,
                ...(effectiveOrgId ? { org_id: effectiveOrgId } : {}),
              })));
              setDriverMatches(matches);
              setDriverAssignOpen(true);
              setLoadingVehicles(false);
              return;
            }
          }
        }
      }

      // No driver matches — import directly
      await executeVehicleImport(
        mapped.map((row) => ({ ...row, ...(effectiveOrgId ? { org_id: effectiveOrgId } : {}) })),
        [],
      );
    } catch (err: any) {
      console.error('[VehicleImport] error:', err);
      toast({
        title: 'שגיאה בטעינת רכבים',
        description: err?.message || formatSupabaseError(err),
        variant: 'destructive',
      });
    } finally {
      setLoadingVehicles(false);
    }
  }, [vWizardAllRows, effectiveOrgId]);

  // Step 3: After driver assignment confirmation, execute import
  const handleDriverAssignConfirm = useCallback(async (approvedMatches: DriverMatch[]) => {
    setDriverAssignOpen(false);
    setLoadingVehicles(true);
    try {
      await executeVehicleImport(pendingVehiclePayload, approvedMatches);
    } finally {
      setLoadingVehicles(false);
    }
  }, [pendingVehiclePayload]);

  // Execute vehicle import with optional driver assignments
  const executeVehicleImport = async (
    vehiclePayload: Record<string, any>[],
    approvedMatches: DriverMatch[],
  ) => {
    const assignmentMap = new Map<string, string>();
    for (const m of approvedMatches.filter((x) => x.approved)) {
      assignmentMap.set(m.plateNumber, m.matchedDriverId);
    }

    // Inject assigned_driver_id where approved
    const finalPayload = vehiclePayload.map((v) => ({
      ...v,
      assigned_driver_id: assignmentMap.get(v.plate_number) || v.assigned_driver_id || null,
    }));

    const chunkSize = 200;
    let inserted = 0;

    for (let i = 0; i < finalPayload.length; i += chunkSize) {
      const chunk = finalPayload.slice(i, i + chunkSize);
      const { error } = await supabase.rpc('bulk_upsert_vehicles', { vehicles: chunk });
      if (error) throw error;
      inserted += chunk.length;
    }

    // Update assigned_vehicle_id on the drivers side (bidirectional)
    for (const [plateNumber, driverId] of assignmentMap.entries()) {
      const vehicle = finalPayload.find((v) => v.plate_number === plateNumber);
      if (vehicle) {
        // Get vehicle id from DB
        const { data: vData } = await supabase
          .from('vehicles')
          .select('id')
          .eq('plate_number', plateNumber)
          .eq('org_id', effectiveOrgId || '')
          .single();
        if (vData?.id) {
          await supabase
            .from('drivers')
            .update({ assigned_vehicle_id: vData.id })
            .eq('id', driverId);
        }
      }
    }

    localStorage.setItem('vehicles_data', JSON.stringify(finalPayload));
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    const vehicleIso = persistFleetExcelImportTimestamp('vehicle', effectiveOrgId);
    try {
      window.dispatchEvent(
        new CustomEvent(FLEET_EXCEL_IMPORT_EVENT, {
          detail: { kind: 'vehicle', iso: vehicleIso },
        }),
      );
    } catch { /* ignore */ }

    const assignCount = assignmentMap.size;
    toast({
      title: `נטענו ${inserted} רכבים בהצלחה` + (assignCount > 0 ? ` (${assignCount} שויכו לנהגים)` : ''),
    });
    window.location.reload();
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
            onChange={handleVehicleFileSelect}
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

      {/* Driver Column Mapping Wizard Dialog */}
      <ColumnMappingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        excelColumns={wizardExcelColumns}
        sampleRows={wizardSampleRows}
        totalRows={wizardAllRows.length}
        onConfirm={executeDriverImport}
      />

      {/* Vehicle Column Mapping Wizard Dialog */}
      <VehicleMappingWizard
        open={vWizardOpen}
        onClose={() => setVWizardOpen(false)}
        excelColumns={vWizardExcelColumns}
        sampleRows={vWizardSampleRows}
        totalRows={vWizardAllRows.length}
        onConfirm={handleVehicleMappingConfirm}
      />

      {/* Driver Assignment Dialog */}
      <DriverAssignmentDialog
        open={driverAssignOpen}
        onClose={() => { setDriverAssignOpen(false); setLoadingVehicles(false); }}
        matches={driverMatches}
        onConfirm={handleDriverAssignConfirm}
      />
    </div>
  );
}
