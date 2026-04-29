import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
import type { Driver, Vehicle } from '@/types/fleet';
import { Columns3 } from 'lucide-react';

type ComplianceTabKey =
  | 'annual_licensing'
  | 'insurance'
  | 'periodic_inspection'
  | 'maintenance'
  | 'driver_license'
  | 'health_declaration'
  | 'regulation_585';

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

const VEHICLE_DEFAULT_COLUMNS = ['plate_number', 'manufacturer', 'model'];
const DRIVER_DEFAULT_COLUMNS = ['full_name', 'id_number', 'phone'];

const TAB_DEFS: Array<{ key: ComplianceTabKey; label: string; source: 'vehicle' | 'driver'; dueField: string }> = [
  { key: 'annual_licensing', label: 'רישוי שנתי', source: 'vehicle', dueField: 'test_expiry' },
  { key: 'insurance', label: 'ביטוח', source: 'vehicle', dueField: 'insurance_expiry' },
  { key: 'periodic_inspection', label: 'ביקורת תקופתית (6 חודשים)', source: 'vehicle', dueField: 'next_inspection_date' },
  { key: 'maintenance', label: 'טיפול', source: 'vehicle', dueField: 'next_maintenance_date' },
  { key: 'driver_license', label: 'רישיון נהיגה', source: 'driver', dueField: 'license_expiry' },
  { key: 'health_declaration', label: 'הצהרת בריאות', source: 'driver', dueField: 'health_declaration_date' },
  { key: 'regulation_585', label: 'תקנה 585', source: 'driver', dueField: 'regulation_585b_date' },
];

function toStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(raw: unknown): number | null {
  const target = parseIsoDate(raw);
  if (!target) return null;
  const now = toStartOfDay(new Date());
  const targetDay = toStartOfDay(target);
  return Math.round((targetDay.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(raw: unknown): string {
  const d = parseIsoDate(raw);
  return d ? d.toLocaleDateString('he-IL') : '—';
}

function prettifyKey(key: string): string {
  const dict: Record<string, string> = {
    plate_number: 'מספר רישוי',
    manufacturer: 'יצרן',
    model: 'דגם',
    test_expiry: 'תוקף רישוי',
    insurance_expiry: 'תוקף ביטוח',
    next_inspection_date: 'ביקורת תקופתית הבאה',
    next_maintenance_date: 'טיפול הבא',
    full_name: 'שם מלא',
    id_number: 'ת.ז.',
    license_expiry: 'תוקף רישיון',
    health_declaration_date: 'הצהרת בריאות',
    regulation_585b_date: 'תקנה 585',
  };
  if (dict[key]) return dict[key];
  return key.replace(/_/g, ' ');
}

function renderValue(raw: unknown): string {
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
  selected,
  onChange,
}: {
  allKeys: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter((k) => k.toLowerCase().includes(q) || prettifyKey(k).toLowerCase().includes(q));
  }, [allKeys, query]);

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((x) => x !== key));
      return;
    }
    onChange([...selected, key]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-2">
          <Columns3 className="h-4 w-4" />
          עמודות ({selected.length})
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
            <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...allKeys])}>בחר הכל</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onChange([])}>נקה הכל</Button>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border p-2">
            {shown.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <Checkbox checked={selected.includes(key)} onCheckedChange={() => toggle(key)} />
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
  emptyLabel: string;
};

function ComplianceTable<T extends Record<string, unknown>>({ rows, columns, dueField, emptyLabel }: TabTableProps<T>) {
  const safeColumns = columns.length > 0 ? columns : [dueField];

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">ימים נותרו</TableHead>
            <TableHead className="text-right">{prettifyKey(dueField)}</TableHead>
            {safeColumns.map((col) => (
              <TableHead key={col} className="text-right">{prettifyKey(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="text-right text-muted-foreground" colSpan={safeColumns.length + 2}>
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={String(row.id ?? idx)}>
                <TableCell className="text-right font-medium">{daysUntil(row[dueField]) ?? '—'}</TableCell>
                <TableCell className="text-right">{formatDate(row[dueField])}</TableCell>
                {safeColumns.map((col) => (
                  <TableCell key={`${String(row.id ?? idx)}-${col}`} className="text-right">
                    {renderValue(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminCompliancePage() {
  const { isAdmin, activeOrgId, profile } = useAuth();
  const orgId = activeOrgId ?? profile?.org_id ?? null;
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['admin-compliance-drivers', orgId],
    enabled: isAdmin && orgId != null,
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
  });

  const [daysThreshold, setDaysThreshold] = useState(30);
  const [activeTab, setActiveTab] = useState<ComplianceTabKey>('annual_licensing');
  const [visibleByTab, setVisibleByTab] = useState<Record<ComplianceTabKey, string[]>>({
    annual_licensing: [...VEHICLE_DEFAULT_COLUMNS],
    insurance: [...VEHICLE_DEFAULT_COLUMNS],
    periodic_inspection: [...VEHICLE_DEFAULT_COLUMNS],
    maintenance: [...VEHICLE_DEFAULT_COLUMNS],
    driver_license: [...DRIVER_DEFAULT_COLUMNS],
    health_declaration: [...DRIVER_DEFAULT_COLUMNS],
    regulation_585: [...DRIVER_DEFAULT_COLUMNS],
  });

  const tabData = useMemo(() => {
    const out = {} as Record<ComplianceTabKey, Array<Record<string, unknown>>>;
    for (const tab of TAB_DEFS) {
      const sourceRows = tab.source === 'vehicle' ? (vehicles as Array<Record<string, unknown>>) : (drivers as Array<Record<string, unknown>>);
      out[tab.key] = sourceRows
        .filter((row) => {
          const d = daysUntil(row[tab.dueField]);
          return d != null && d >= 0 && d <= daysThreshold;
        })
        .sort((a, b) => (daysUntil(a[tab.dueField]) ?? 9999) - (daysUntil(b[tab.dueField]) ?? 9999));
    }
    return out;
  }, [daysThreshold, drivers, vehicles]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const loading = vehiclesLoading || driversLoading;
  const activeDef = TAB_DEFS.find((t) => t.key === activeTab) ?? TAB_DEFS[0];
  const currentAllColumns = activeDef.source === 'vehicle' ? VEHICLE_KEYS : DRIVER_KEYS;

  return (
    <FleetHudPageShell
      title="Compliance Tower"
      subtitle="מרכז בקרה לפקיעות כלי רכב ונהגים לפי סף ימים דינמי"
    >
      <div className="mx-auto max-w-[1400px] space-y-4 pb-8" dir="rtl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>הגדרות תצוגה</CardTitle>
            <CardDescription>הנתונים בטבלאות מתעדכנים מיידית לפי סף הימים שתבחרי</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1">
              <Label htmlFor="days-threshold">Days Threshold</Label>
              <Input
                id="days-threshold"
                type="number"
                min={1}
                value={daysThreshold}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setDaysThreshold(Number.isFinite(next) && next > 0 ? next : 30);
                }}
              />
            </div>
            <SearchableColumnPicker
              allKeys={currentAllColumns}
              selected={visibleByTab[activeTab]}
              onChange={(next) => setVisibleByTab((prev) => ({ ...prev, [activeTab]: next }))}
            />
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ComplianceTabKey)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {TAB_DEFS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="rounded-md border bg-card data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_DEFS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              {loading ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">טוען נתונים...</CardContent>
                </Card>
              ) : (
                <ComplianceTable
                  rows={tabData[tab.key]}
                  columns={visibleByTab[tab.key]}
                  dueField={tab.dueField}
                  emptyLabel={`לא נמצאו רשומות עם ${prettifyKey(tab.dueField)} בטווח ${daysThreshold} הימים הקרובים`}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </FleetHudPageShell>
  );
}
