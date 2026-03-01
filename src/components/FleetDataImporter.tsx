import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Car, Users, Loader2 } from 'lucide-react';

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
  plate_number: str(row["מס' רשוי"]) || str(row['מס רשוי']) || '',
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
  ownership_type: str(row['בעלות']),
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

const mapDriverRow = (rawRow: Record<string, any>) => {
  const row = normalizeRow(rawRow);
  return {
  full_name: str(row['שם נהג']) || '',
  id_number: str(row["מס' עובד"]) || str(row['מספר עובד']) || str(row['קוד נהג']) || '',
  phone: str(row['נייד']),
  email: str(row['מייל']),
  license_expiry: parseExcelDate(row['ת.חידוש רשיון']) || parseExcelDate(row['תאריך חידוש רשיון']) || parseExcelDate(row['תאריך בדיקת רישיון']) || new Date().toISOString().slice(0, 10),
  safety_training_date: parseExcelDate(row['תאריך השתלמות']) || parseExcelDate(row['השתלמות אחרונה']),
  department: str(row['מחלקה']),
  address: str(row['כתובת1']),
  driver_code: str(row['קוד נהג']),
  is_active: bool(row['פעיל=1 לא פעיל=0']) || bool(row['פעיל']),
  employee_number: str(row['מס\' עובד']) || str(row['מספר עובד']),
  work_start_date: parseExcelDate(row['תאריך התחלת עבודה']) || parseExcelDate(row['תאריך תחילת עבודה']),
  city: str(row['עיר']),
  note1: str(row['הערה 1']),
  note2: str(row['הערה 2']),
  rating: str(row['דירוג']),
  division: str(row['אגף']),
  eligibility: str(row['זכאות']),
  area: str(row['שטח']),
  group_name: str(row['קבוצה']),
  group_code: str(row['קוד קבוצה']),
  job_title: str(row['הערה 1']),
  license_number: str(row['מספר רשיון']) || str(row['רישוי']),
  };
};

// ─── Component ───

export default function FleetDataImporter() {
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const vehicleInputRef = useRef<HTMLInputElement>(null);
  const driverInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
        const chunk = mapped.slice(i, i + chunkSize);
        const { error } = await supabase.from('vehicles').upsert(chunk as any, { onConflict: 'plate_number' });
        if (error) throw error;
        inserted += chunk.length;
      }

      // עדכון localStorage כדי שהדשבורד יתעדכן אוטומטית
      localStorage.setItem('vehicles_data', JSON.stringify(mapped));
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      localStorage.setItem('last_vehicle_upload', new Date().toISOString());
      toast({ title: `נטענו ${inserted} רכבים בהצלחה` });
      window.location.reload();
    } catch (err: any) {
      toast({ title: 'שגיאה בטעינת רכבים', description: err.message, variant: 'destructive' });
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
      const mapped = rows
        .map(mapDriverRow)
        .filter((d) => d.full_name);

      if (mapped.length === 0) {
        toast({ title: 'לא נמצאו נהגים בקובץ', variant: 'destructive' });
        return;
      }

      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < mapped.length; i += chunkSize) {
        const chunk = mapped.slice(i, i + chunkSize);
        const { error } = await supabase.from('drivers').upsert(chunk as any, { onConflict: 'id_number' });
        if (error) throw error;
        inserted += chunk.length;
      }

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      localStorage.setItem('last_driver_upload', new Date().toISOString());
      toast({ title: `נטענו ${inserted} נהגים בהצלחה` });
    } catch (err: any) {
      toast({ title: 'שגיאה בטעינת נהגים', description: err.message, variant: 'destructive' });
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
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
