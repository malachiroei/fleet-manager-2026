import { useState, useRef, useEffect } from 'react';
import { useUploadPricingData, useSyncVehiclesFromPricing, usePricingRowCount } from '@/hooks/usePricingData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

interface ParsedRow {
  manufacturer_code: string;
  model_code: string;
  usage_value: number | null;
  usage_year: number | null;
  adjusted_price: number | null;
  registration_year: number | null;
  vehicle_type_code: string | null;
  manufacturer_name: string | null;
  model_description: string | null;
  fuel_type: string | null;
  commercial_name: string | null;
  is_automatic: boolean | null;
  drive_type: string | null;
  green_score: number | null;
  pollution_level: number | null;
  engine_volume_cc: number | null;
  weight: number | null;
  list_price: number | null;
  effective_date: string | null;
}

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');

const normalizeCode = (value: string | undefined) => (value || '').trim();

const parseNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/[₪\s]/g, '').replace(/,/g, '').trim();
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseInteger = (value: string | undefined): number | null => {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.round(parsed);
};

// Column name patterns for detection
const COLUMN_PATTERNS: Record<string, string[]> = {
  usage_year: ['שנת מס', 'שנה מס', 'tax_year', 'usage_year', 'usage year'],
  registration_year: ['שנת רישום', 'שנת רשום', 'registration_year'],
  vehicle_type_code: ['קוד סוג רכב', 'סוג רכב', 'vehicle_type_code'],
  manufacturer_code: ['קוד תוצר', 'סמל יצרן', 'מק"ט יצרן', 'manufacturer_code'],
  manufacturer_name: ['תוצר', 'יצרן', 'manufacturer_name', 'manufacturer'],
  model_code: ['קוד דגם', 'סמל דגם', 'מק"ט דגם', 'model_code'],
  model_description: ['תאור דגם', 'תיאור דגם', 'model_description'],
  fuel_type: ['סוג דלק', 'קוד דלק', 'fuel_type'],
  commercial_name: ['כינוי מסחרי', 'שם מסחרי', 'commercial_name'],
  is_automatic: ['אוטומט', 'automatic', 'is_automatic'],
  drive_type: ['סוג הנעה', 'הנעה', 'drive_type'],
  green_score: ['ציון ירוק', 'green_score'],
  pollution_level: ['דרגת זיהום', 'זיהום', 'pollution_level'],
  engine_volume_cc: ['נפח מנוע', 'engine_volume', 'engine_volume_cc', 'נפח'],
  weight: ['משקל', 'weight'],
  effective_date: ['תאריך תחולה', 'effective_date', 'תחולה'],
  list_price: ['מחיר מחירון', 'מחירון', 'list_price'],
  adjusted_price: ['מחיר מתואם', 'מחירון מתואם', 'adjusted_price'],
  usage_value: ['שווי שימוש', 'usage_value', 'שווי'],
};

// Positional column mapping for the standard Israeli pricing CSV
const POSITIONAL_COLUMNS = [
  'usage_year',         // 0
  'registration_year',  // 1
  'vehicle_type_code',  // 2
  'manufacturer_code',  // 3
  'manufacturer_name',  // 4
  'model_code',         // 5
  'model_description',  // 6
  'fuel_type',          // 7
  'commercial_name',    // 8
  'is_automatic',       // 9
  'drive_type',         // 10
  'green_score',        // 11
  'pollution_level',    // 12
  'engine_volume_cc',  // 13
  'weight',             // 14
  'effective_date',     // 15
  'list_price',         // 16
  'adjusted_price',     // 17
  'usage_value',        // 18
];

function detectColumnIndex(headers: string[], field: string): number {
  const patterns = COLUMN_PATTERNS[field];
  if (!patterns) return -1;
  return headers.findIndex((h) => {
    const norm = normalizeHeader(h);
    return patterns.some((p) => {
      const pNorm = normalizeHeader(p);
      return pNorm.length > 0 && norm.includes(pNorm);
    });
  });
}

function buildColumnMap(headers: string[]): Record<string, number> {
  const headerMap: Record<string, number> = {};

  // Prefer header-based detection whenever possible. Some exports may contain
  // extra columns, which makes positional mapping unreliable even if headers.length >= 19.
  for (const field of Object.keys(COLUMN_PATTERNS)) {
    const idx = detectColumnIndex(headers, field);
    if (idx !== -1) headerMap[field] = idx;
  }

  const hasRequiredHeaderFields =
    typeof headerMap.manufacturer_code === 'number' && typeof headerMap.model_code === 'number';

  // If we can reliably detect the required keys from headers, use headerMap.
  if (hasRequiredHeaderFields) return headerMap;

  // Fallback: positional mapping for the legacy "standard" format where headers are garbled.
  const positionalMap: Record<string, number> = {};
  const len = Math.min(POSITIONAL_COLUMNS.length, headers.length);
  for (let i = 0; i < len; i++) {
    positionalMap[POSITIONAL_COLUMNS[i]] = i;
  }
  return positionalMap;
}

function extractRow(values: string[], colMap: Record<string, number>): ParsedRow | null {
  const get = (field: string) => {
    const idx = colMap[field];
    return idx !== undefined && idx < values.length ? values[idx]?.trim() : undefined;
  };
  
  const manufacturerCode = normalizeCode(get('manufacturer_code'));
  const modelCode = normalizeCode(get('model_code'));
  if (!manufacturerCode || !modelCode) return null;

  return {
    manufacturer_code: manufacturerCode,
    model_code: modelCode,
    usage_value: parseNumber(get('usage_value')),
    usage_year: parseInteger(get('usage_year')),
    adjusted_price: parseNumber(get('adjusted_price')),
    registration_year: parseInteger(get('registration_year')),
    vehicle_type_code: get('vehicle_type_code') || null,
    manufacturer_name: get('manufacturer_name') || null,
    model_description: get('model_description') || null,
    fuel_type: get('fuel_type') || null,
    commercial_name: get('commercial_name') || null,
    is_automatic: get('is_automatic') === '1' ? true : get('is_automatic') === '0' ? false : null,
    drive_type: get('drive_type') || null,
    green_score: parseInteger(get('green_score')),
    pollution_level: parseInteger(get('pollution_level')),
    engine_volume_cc: parseInteger(get('engine_volume_cc')),
    weight: parseInteger(get('weight')),
    list_price: parseNumber(get('list_price')),
    effective_date: get('effective_date') || null,
  };
}

export default function PricingDataUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadPricingData();
  const syncMutation = useSyncVehiclesFromPricing();
  const { data: pricingRowCount, refetch: refetchCount } = usePricingRowCount();
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [detectedCount, setDetectedCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<string>('');

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('הקובץ חייב להכיל שורת כותרות ולפחות שורת נתונים אחת');
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const colMap = buildColumnMap(headers);
    
    console.log('CSV parsing: columns detected =', headers.length, 'column map =', colMap);
    
    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(delimiter).map((c) => c.trim());
      const row = extractRow(values, colMap);
      if (row) rows.push(row);
    }
    return rows;
  };

  const parseExcel = (buffer: ArrayBuffer): ParsedRow[] => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('קובץ האקסל ריק');
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1, raw: false, defval: '', blankrows: false,
    }) as Array<Array<string | number | null>>;
    if (matrix.length < 2) throw new Error('האקסל חייב להכיל שורת כותרות ולפחות שורת נתונים');
    const headers = matrix[0].map((c) => String(c ?? ''));
    const colMap = buildColumnMap(headers);
    const rows: ParsedRow[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const values = matrix[i].map((c) => String(c ?? ''));
      const row = extractRow(values, colMap);
      if (row) rows.push(row);
    }
    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const lowerName = file.name.toLowerCase();
        let rows: ParsedRow[];
        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
          rows = parseExcel(buffer);
        } else {
          const bytes = new Uint8Array(buffer);
          // Try UTF-8 first
          let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          // If we see replacement chars or no recognizable Hebrew, try windows-1255
          if (text.includes('\uFFFD') || text.includes('�')) {
            try {
              text = new TextDecoder('windows-1255', { fatal: false }).decode(bytes);
            } catch {
              // windows-1255 not supported in this browser, use UTF-8 result
            }
          }
          rows = parseCSV(text);
        }
        if (rows.length === 0) throw new Error('לא נמצאו שורות תקינות בקובץ.');
        setParsedRows(rows);
        setDetectedCount(rows.filter((r) => r.registration_year).length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'שגיאה בקריאת הקובץ');
        setParsedRows([]);
      }
    };
    reader.onerror = () => { setError('שגיאה בקריאת הקובץ'); setParsedRows([]); };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (parsedRows.length === 0) { toast.error('אין נתונים להעלאה'); return; }
    setUploadProgress(0);
    setUploadStartTime(Date.now());
    setEstimatedTimeLeft('מחשב...');
    try {
      const startMs = Date.now();

      await uploadMutation.mutateAsync({
        rows: parsedRows,
        onProgress: ({ inserted, total, phase }) => {
          // Phase-aware progress: deleting -> small bump; inserting -> proportional.
          const base = phase === 'deleting' ? 2 : 5;
          const pct = total > 0 ? Math.min(99, Math.round(base + (inserted / total) * (100 - base))) : base;
          setUploadProgress(pct);

          const elapsedSec = (Date.now() - startMs) / 1000;
          if (pct > 5 && elapsedSec > 1) {
            const totalEstimate = (elapsedSec / pct) * 100;
            const remaining = Math.max(0, totalEstimate - elapsedSec);
            setEstimatedTimeLeft(remaining < 60 ? `${Math.ceil(remaining)} שניות` : `${Math.ceil(remaining / 60)} דקות`);
          }
        },
      });

      setUploadProgress(100);
      setEstimatedTimeLeft('');
      
      // Save last upload timestamp (local only, to avoid RLS/schema mismatches)
      const uploadedAtIso = new Date().toISOString();
      localStorage.setItem('last_pricing_upload', uploadedAtIso);

      // Notify AdminSettings page in the same tab (instant UI refresh)
      window.dispatchEvent(new CustomEvent('pricing-uploaded', { detail: { iso: uploadedAtIso } }));
      refetchCount();
      
      setTimeout(() => {
        setParsedRows([]);
        setFileName('');
        setUploadProgress(0);
        setUploadStartTime(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
    } catch {
      setUploadProgress(0);
      setUploadStartTime(null);
      setEstimatedTimeLeft('');
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (result.notFound > 0) {
        toast.warning(
          `סונכרנו ${result.updated} רכבים בהצלחה. ${result.notFound} רכבים לא נמצאו במחירון:\n${result.notFoundNames.join('\n')}`,
          { duration: 10000 }
        );
      } else {
        toast.success(`סונכרנו ${result.updated} רכבים מתוך ${result.total} רכבים עם קוד תוצר/דגם`);
      }
    } catch { /* handled by mutation */ }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>טעינת קובץ משרד התחבורה</CardTitle>
            <CardDescription>העלה קובץ CSV / Excel עם נתוני מחירון ולאחר מכן סנכרן לכרטיסי רכב</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pricing-file">קובץ מחירון (CSV / Excel)</Label>
          <Input
            ref={fileInputRef}
            id="pricing-file"
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            onChange={handleFileChange}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            עמודות נדרשות: קוד תוצר + קוד דגם. שאר העמודות יזוהו אוטומטית (שנת רישום, שווי שימוש, מחיר מתואם, סוג דלק, נפח מנוע ועוד).
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-600" />
              <span>נקראו {parsedRows.length.toLocaleString()} רשומות מהקובץ {fileName}</span>
              {detectedCount > 0 && (
                <span className="text-muted-foreground">({detectedCount.toLocaleString()} עם שנת רישום)</span>
              )}
            </div>

            <div className="bg-muted/50 p-3 rounded-lg max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-1">קוד תוצר</th>
                    <th className="text-right p-1">שם</th>
                    <th className="text-right p-1">קוד דגם</th>
                    <th className="text-right p-1">כינוי</th>
                    <th className="text-right p-1">שנה</th>
                    <th className="text-right p-1">שווי שימוש</th>
                    <th className="text-right p-1">מחירון</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="p-1 font-mono">{row.manufacturer_code}</td>
                      <td className="p-1">{row.manufacturer_name || '-'}</td>
                      <td className="p-1 font-mono">{row.model_code}</td>
                      <td className="p-1">{row.commercial_name || '-'}</td>
                      <td className="p-1">{row.registration_year || '-'}</td>
                      <td className="p-1">{row.usage_value?.toLocaleString() || '-'}</td>
                      <td className="p-1">{row.list_price?.toLocaleString() || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 10 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  + עוד {(parsedRows.length - 10).toLocaleString()} רשומות...
                </p>
              )}
            </div>

            {uploadMutation.isPending && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>מעלה נתונים... {Math.round(uploadProgress)}%</span>
                  {estimatedTimeLeft && <span>זמן משוער: {estimatedTimeLeft}</span>}
                </div>
              </div>
            )}

            {uploadProgress === 100 && !uploadMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                <span>הנתונים הועלו בהצלחה!</span>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="w-full"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Upload className="h-4 w-4 ml-2" />
              )}
              העלה {parsedRows.length.toLocaleString()} רשומות
            </Button>
          </div>
        )}

        {/* Sync Button - always visible */}
        <div className="border-t pt-4 space-y-3">
          {/* Live pricing table status */}
          {pricingRowCount === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span className="text-base leading-none mt-0.5">⚠️</span>
              <span>
                <strong>טבלת המחירון ריקה</strong> — יש להעלות תחילה קובץ Excel של משרד התחבורה כדי שהסנכרון יפעל.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
              טבלת מחירון פעילה — {pricingRowCount?.toLocaleString('he-IL')} רשומות טעונות
            </div>
          )}
          <Button
            onClick={handleSync}
            disabled={syncMutation.isPending || pricingRowCount === 0}
            variant="secondary"
            className="w-full"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <RefreshCw className="h-4 w-4 ml-2" />
            )}
            סנכרן כרטיסי רכב
          </Button>
          <p className="text-xs text-muted-foreground">
            מעדכן את כרטיסי הרכב לפי התאמת קוד תוצר + קוד דגם + שנת רישום מול נתוני המחירון.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
