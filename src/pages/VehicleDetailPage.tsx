import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useVehicle, useUpdateVehicle, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { useDriver, useDrivers } from '@/hooks/useDrivers';
import {
  useVehicleSpecDirty,
  DIRTY_SOURCE_SPEC,
  DIRTY_SOURCE_MAINTENANCE,
} from '@/contexts/VehicleSpecDirtyContext';
import { useHandovers } from '@/hooks/useHandovers';
import { usePermissions } from '@/hooks/usePermissions';
import { usePricingLookup, useSyncVehicleFromPricing } from '@/hooks/usePricingData';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Car,
  Calendar,
  Gauge,
  FileText,
  User,
  Wrench,
  Shield,
  Edit,
  ClipboardList,
  Fuel,
  RefreshCw,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
} from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';
import { VehicleFolders } from '@/components/VehicleFolders';
import { VehicleDetailQuickActions } from '@/components/vehicles/VehicleDetailQuickActions';
import VehicleDamageSnapshot from '@/components/VehicleDamageSnapshot';
import { parseDamageSummaryLine } from '@/lib/vehicleDamage';
import { MISSING_DATA, fmtDriverDate } from '@/components/DriverCard';
import { displayOwnershipType, canonicalOwnershipType } from '@/lib/vehicleOwnership';
import { isVehicleExemptFromAnnualTestNow } from '@/lib/vehicleAnnualTest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { Vehicle } from '@/types/fleet';

function StatusBadge({
  status,
  daysLeft,
  compact,
}: {
  status: ComplianceStatus;
  daysLeft?: number;
  compact?: boolean;
}) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };

  const { label, className } = config[status];
  if (compact) {
    return <Badge className={className}>{label}</Badge>;
  }
  return (
    <div className="flex items-center gap-2">
      <Badge className={className}>{label}</Badge>
      {daysLeft !== undefined && status !== 'valid' && (
        <span className="text-xs text-muted-foreground">
          {daysLeft < 0 ? `פג לפני ${Math.abs(daysLeft)} ימים` : `${daysLeft} ימים`}
        </span>
      )}
    </div>
  );
}

function calculateStatus(expiryDate: string): { status: ComplianceStatus; daysLeft: number } | null {
  if (!expiryDate || String(expiryDate).trim() === '') return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const status: ComplianceStatus = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'warning' : 'valid';
  return { status, daysLeft };
}

function str(v: string | number | null | undefined): string {
  if (v == null) return MISSING_DATA;
  const s = String(v).trim();
  return s === '' ? MISSING_DATA : s;
}

function toModelImageSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = (raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

/** שדות מפרט מלא לעריכה inline — ערכים כמחרוזות; תאריכים בפורמט input date */
type SpecFormState = Record<string, string>;
const LEASING_COMPANY_OPTIONS = ['הרץ', 'פריים ליס', 'יוניון מוביליטי'] as const;

function normalizeOwnershipForEdit(
  ownershipRaw: string | null | undefined,
  leasingCompanyRaw: string | null | undefined,
): { ownershipType: string; leasingCompany: string } {
  const ownership = (ownershipRaw ?? '').trim();
  const leasingCompany = (leasingCompanyRaw ?? '').trim();
  const canonical = canonicalOwnershipType(ownership);
  const isKnownLeasingCompany = (LEASING_COMPANY_OPTIONS as readonly string[]).includes(canonical);

  if (ownership === 'ליסינג' || isKnownLeasingCompany) {
    return {
      ownershipType: 'ליסינג',
      leasingCompany: isKnownLeasingCompany ? canonical : leasingCompany,
    };
  }
  if (ownership === 'בעלות חברה') {
    return { ownershipType: 'בעלות חברה', leasingCompany: '' };
  }
  return { ownershipType: '', leasingCompany: leasingCompany };
}

function vehicleToSpecForm(v: Vehicle): SpecFormState {
  const d = (x: string | null | undefined) => (x && String(x).trim() !== '' ? String(x).slice(0, 10) : '');
  const normalizedOwnership = normalizeOwnershipForEdit(v.ownership_type, v.leasing_company_name);
  return {
    manufacturer: v.manufacturer ?? '',
    model: v.model ?? '',
    year: v.year != null ? String(v.year) : '',
    road_ascent_year: v.road_ascent_year != null ? String(v.road_ascent_year) : '',
    road_ascent_month: v.road_ascent_month != null ? String(v.road_ascent_month) : '',
    color: v.color ?? '',
    fuel_type: v.fuel_type ?? '',
    vehicle_standard: v.vehicle_standard ?? '',
    vat_recognized: v.vat_recognized != null && !Number.isNaN(Number(v.vat_recognized)) ? String(v.vat_recognized) : '',
    monthly_total_cost: v.monthly_total_cost != null && !Number.isNaN(Number(v.monthly_total_cost)) ? String(v.monthly_total_cost) : '',
    base_index: v.base_index != null && !Number.isNaN(Number(v.base_index)) ? String(v.base_index) : '',
    engine_volume: v.engine_volume ?? '',
    ignition_code: v.ignition_code ?? '',
    ownership_type: normalizedOwnership.ownershipType,
    leasing_company_name: normalizedOwnership.leasingCompany,
    pickup_date: d(v.pickup_date),
    purchase_date: d(v.purchase_date),
    sale_date: d(v.sale_date),
    chassis_number: v.chassis_number ?? '',
    safety_officer: v.safety_officer ?? '',
    average_fuel_consumption:
      v.average_fuel_consumption != null && !Number.isNaN(Number(v.average_fuel_consumption))
        ? String(v.average_fuel_consumption)
        : '',
    service_interval_km: v.service_interval_km != null ? String(v.service_interval_km) : '',
  };
}

const SPEC_LABELS: Record<string, string> = {
  manufacturer: 'יצרן',
  model: 'דגם',
  year: 'שנת ייצור',
  road_ascent_year: 'שנת עליה לכביש',
  road_ascent_month: 'חודש עליה לכביש',
  color: 'צבע',
  fuel_type: 'סוג דלק',
  vehicle_standard: 'התקן',
  vat_recognized: 'מע״מ מוכר',
  monthly_total_cost: 'עלות ליסינג חודשית',
  base_index: 'מדד בסיס',
  engine_volume: 'נפח מנוע (סמ״ק)',
  ignition_code: 'קוד הנעה',
  ownership_type: 'סוג בעלות',
  leasing_company_name: 'חברת ליסינג',
  pickup_date: 'תאריך קליטה',
  purchase_date: 'תאריך קניה / תחילת עסקה',
  sale_date: 'תאריך מכירה / סיום עסקה',
  chassis_number: 'מספר שלדה',
  safety_officer: 'קצין בטיחות',
  average_fuel_consumption: 'צריכת דלק ממוצעת',
  service_interval_km: 'מרווח טיפול מומלץ (ק״מ)',
  assigned_driver_name: 'שם נהג מוקצה',
  assigned_driver_phone: 'טלפון נהג',
  assigned_driver_id: 'נהג מוקצה',
};

function HandoverHistoryList({ handovers }: { handovers: any[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {handovers.map((h: any) => {
        const isOpen = openId === h.id;
        const date = new Date(h.handover_date);
        const dateStr = date.toLocaleDateString('he-IL');
        const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        const damageSummary = parseDamageSummaryLine(h.notes);
        return (
          <div id={`handover-${h.id}`} key={h.id} className="rounded-lg border border-border overflow-hidden">
            {/* Compact row */}
            <button
              onClick={() => setOpenId(isOpen ? null : h.id)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/60 transition-colors text-sm"
            >
              <div className="flex items-center gap-3">
                <Badge variant={h.handover_type === 'delivery' ? 'default' : 'secondary'} className="text-xs">
                  {h.handover_type === 'delivery' ? 'מסירה' : 'החזרה'}
                </Badge>
                <span className="font-medium">{dateStr}</span>
                <span className="text-muted-foreground">{timeStr}</span>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {/* Expanded details */}
            {isOpen && (
              <div className="px-4 py-3 space-y-3 border-t border-border bg-background">
                {h.driver && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{h.driver.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" />
                    {h.odometer_reading.toLocaleString()} ק&quot;מ
                  </span>
                  <span className="flex items-center gap-1">
                    <Fuel className="h-3.5 w-3.5" />
                    {h.fuel_level}/8
                  </span>
                </div>
                {(h.photo_front_url || h.photo_back_url || h.photo_right_url || h.photo_left_url) && (
                  <div className="grid grid-cols-4 gap-2">
                    {[h.photo_front_url, h.photo_back_url, h.photo_right_url, h.photo_left_url].filter(Boolean).map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`תמונה ${i + 1}`} className="rounded border border-border aspect-square object-cover w-full" />
                      </a>
                    ))}
                  </div>
                )}
                {h.signature_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">חתימה:</p>
                    <img src={h.signature_url} alt="חתימה" className="h-10 bg-white rounded border border-border px-2" />
                  </div>
                )}
                {h.notes && <p className="text-sm text-muted-foreground">{h.notes}</p>}
                {damageSummary && <VehicleDamageSnapshot summary={damageSummary} />}
                {h.pdf_url && (
                  <a
                    href={h.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    צפה בטופס PDF
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const docFocusParam = searchParams.get('focus');
  const { data: vehicle, isLoading, isError, error, refetch } = useVehicle(id || '');
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const { canAccessUi } = usePermissions();
  const assignmentDriverId =
    (activeAssignments ?? []).find((assignment) => assignment.vehicle_id === vehicle?.id)?.driver_id ?? '';
  /** עמודת הרכב מסונכרנת עם מסירה אחרונה; assignment משמש רק כשאין ערך בעמודה */
  const currentAssignedDriverId =
    ((vehicle?.assigned_driver_id ?? assignmentDriverId) || '').trim();
  const showReportMileage = canAccessUi({ permission: 'report_mileage', featureKey: 'qa_report_mileage' });
  const showServiceUpdate = canAccessUi({ permission: 'vehicles', featureKey: 'qa_service_update' });
  const { data: assignedDriver } = useDriver(currentAssignedDriverId || '');
  const { data: handovers } = useHandovers(id);
  const updateVehicle = useUpdateVehicle();
  const { data: drivers = [] } = useDrivers();
  const { setDirty, tryNavigate, getIsDirty } = useVehicleSpecDirty();
  const syncFromPricing = useSyncVehicleFromPricing();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const docScrollDoneKeyRef = useRef<string | null>(null);
  const section = location.hash.replace('#', '');
  const isOverviewSection = section === 'overview';
  const isTaxSection = section === 'tax-data';
  const isHandoverSection = section === 'handover-history';
  const isDocumentsSection = section === 'vehicle-documents';
  const isFoldersSection = section === 'vehicle-folders';
  // מפרט מלא — עריכה inline; אם נכנסים עם #completion מפנים לסקירה
  useEffect(() => {
    if (section === 'completion') {
      window.history.replaceState(null, '', `${location.pathname}#overview`);
    }
  }, [section, location.pathname]);

  const [specForm, setSpecForm] = useState<SpecFormState>({});
  const initialSpecRef = useRef<SpecFormState>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeLines, setChangeLines] = useState<string[]>([]);
  const [specSaving, setSpecSaving] = useState(false);
  const [modelImageOverrideUrl, setModelImageOverrideUrl] = useState<string | null>(null);
  const [modelImageFallbackIndex, setModelImageFallbackIndex] = useState(0);
  const [isUploadingModelImage, setIsUploadingModelImage] = useState(false);
  const modelImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!vehicle) return;
    const s = vehicleToSpecForm(vehicle);
    if (assignedDriver) {
      s.assigned_driver_name = assignedDriver.full_name ?? '';
      s.assigned_driver_phone = assignedDriver.phone ?? '';
      s.assigned_driver_id = assignedDriver.id ?? '';
    } else {
      s.assigned_driver_name = '';
      s.assigned_driver_phone = '';
      s.assigned_driver_id = '';
    }
    setSpecForm(s);
    initialSpecRef.current = { ...s };
  }, [vehicle?.id, vehicle?.updated_at, assignedDriver?.id]);

  useEffect(() => {
    const selectedAssignedId = (specForm.assigned_driver_id ?? '').trim();
    if (!selectedAssignedId) return;
    const selected = drivers.find((d) => d.id === selectedAssignedId);
    if (!selected) return;
    setSpecForm((prev) => {
      const nextName = selected.full_name ?? '';
      const nextPhone = selected.phone ?? '';
      if (
        (prev.assigned_driver_name ?? '') === nextName &&
        (prev.assigned_driver_phone ?? '') === nextPhone
      ) {
        return prev;
      }
      return {
        ...prev,
        assigned_driver_name: nextName,
        assigned_driver_phone: nextPhone,
      };
    });
  }, [specForm.assigned_driver_id, drivers]);

  const specIsDirty = useCallback(() => {
    const a = initialSpecRef.current;
    const b = specForm;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if ((a[k] ?? '') !== (b[k] ?? '')) return true;
    }
    return false;
  }, [specForm]);

  const confirmLeaveIfDirty = useCallback(
    (to: string) => {
      tryNavigate(to);
    },
    [tryNavigate]
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!getIsDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [getIsDirty]);

  useEffect(() => {
    setDirty(DIRTY_SOURCE_SPEC, specIsDirty());
    // חשוב: לא לנקות כאן maintenance — ה-cleanup רץ בכל שינוי specForm ומוחק בטעות dirty של תיקיות תחזוקה
    return () => setDirty(DIRTY_SOURCE_SPEC, false);
  }, [specForm, setDirty, vehicle?.id]);

  // ניקוי כל המקורות רק ביציאה מדף הרכב (unmount), שלא יישאר dirty דבוק לעמוד הבא
  useEffect(() => {
    return () => {
      setDirty(DIRTY_SOURCE_SPEC, false);
      setDirty(DIRTY_SOURCE_MAINTENANCE, false);
    };
  }, [setDirty]);

  const { data: vehicleDocuments = [], refetch: refetchVehicleDocuments } = useQuery({
    queryKey: ['vehicle-documents', vehicle?.id],
    enabled: !!vehicle?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_documents' as any)
        .select('id, title, file_url, created_at, document_type')
        .eq('vehicle_id', vehicle!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        file_url: string;
        created_at: string;
        document_type?: string | null;
      }>;
    },
  });
  const { data: pricingLookup } = usePricingLookup(
    vehicle?.manufacturer_code || null,
    vehicle?.model_code || null,
    vehicle?.year || null
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const target = document.querySelector(hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section, handovers]);

  useEffect(() => {
    if (!isDocumentsSection || !vehicle?.id) {
      docScrollDoneKeyRef.current = null;
      return;
    }
    const scrollKey = `${vehicle.id}|${docFocusParam ?? ''}|${vehicleDocuments.length}`;
    if (docScrollDoneKeyRef.current === scrollKey) return;
    const t = window.setTimeout(() => {
      try {
        const safe = docFocusParam && /^[a-z0-9_]+$/i.test(docFocusParam) ? docFocusParam : null;
        if (safe) {
          const el = document.querySelector(`[data-doc-focus="${safe}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            docScrollDoneKeyRef.current = scrollKey;
            return;
          }
        }
        if (docFocusParam === 'annual_license') {
          const legacy = document.querySelector('[data-doc-focus="legacy_license"]');
          if (legacy) {
            legacy.scrollIntoView({ behavior: 'smooth', block: 'center' });
            docScrollDoneKeyRef.current = scrollKey;
          }
        }
      } catch {
        /* מזהה לא תקין ל-querySelector */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [isDocumentsSection, docFocusParam, vehicle?.id, vehicleDocuments.length]);

  if (isLoading) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="container py-6 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : String(error ?? 'שגיאה');
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-xl">שגיאה בטעינת הרכב</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card>
            <CardContent className="p-4 sm:p-8 space-y-4 text-center">
              <p className="text-destructive text-sm">{msg}</p>
              <Button type="button" onClick={() => void refetch()}>
                נסה שוב
              </Button>
              <Link to="/vehicles">
                <Button variant="outline" className="ml-2">
                  חזור לרשימה
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="fleet-screen-page text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-xl">רכב לא נמצא</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card>
            <CardContent className="p-4 sm:p-8 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">הרכב המבוקש לא נמצא במערכת</p>
              <Link to="/vehicles">
                <Button className="mt-4">חזור לרשימת הרכבים</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const testExempt = isVehicleExemptFromAnnualTestNow(vehicle);
  const test = calculateStatus(vehicle.test_expiry);
  const insurance = calculateStatus(vehicle.insurance_expiry);
  /** מד אוץ מוצג כגבוה מבין current_odometer לבין ק״מ טיפול אחרון (מקורות מרובים) */
  const odoFromOdometer = Number(vehicle.current_odometer) || 0;
  const odoFromLastService =
    vehicle.last_service_km != null && !Number.isNaN(Number(vehicle.last_service_km))
      ? Number(vehicle.last_service_km)
      : 0;
  const displayOdometer = Math.max(odoFromOdometer, odoFromLastService);
  const taxValuePrice = vehicle.tax_value_price ?? pricingLookup?.usage_value ?? null;
  const taxValueYear = vehicle.tax_year ?? pricingLookup?.usage_year ?? null;
  const adjustedPrice = vehicle.adjusted_price ?? pricingLookup?.adjusted_price ?? null;
  const ascentMonthYear = (() => {
    const month = vehicle.road_ascent_month;
    const year = vehicle.road_ascent_year ?? vehicle.year;
    if (month != null && month >= 1 && month <= 12 && year != null) {
      return `${month}/${year}`;
    }
    return year != null ? String(year) : MISSING_DATA;
  })();

  const norm = (s: string) => (s ?? '').trim();
  const openSpecConfirm = () => {
    const init = initialSpecRef.current;
    const lines: string[] = [];
    (Object.keys(SPEC_LABELS) as Array<keyof typeof SPEC_LABELS>).forEach((key) => {
      const before = norm(init[key] ?? '');
      const after = norm(specForm[key] ?? '');
      if (before !== after) {
        const label = SPEC_LABELS[key];
        const disp = (x: string) => (x === '' ? '(ריק)' : x);
        lines.push(`${label}: ${disp(before)} ← ${disp(after)}`);
      }
    });
    if (lines.length === 0) {
      toast.message('לא בוצעו שינויים');
      return;
    }
    setChangeLines(lines);
    setConfirmOpen(true);
  };

  const performSpecSave = async () => {
    const init = initialSpecRef.current;
    const payload: Partial<Vehicle> & { id: string } = { id: vehicle.id };
    const setIfChanged = (key: string, value: unknown) => {
      if (norm(String(init[key] ?? '')) !== norm(String(specForm[key] ?? ''))) {
        (payload as Record<string, unknown>)[key] = value;
      }
    };
    setIfChanged('manufacturer', specForm.manufacturer?.trim() || null);
    setIfChanged('model', specForm.model?.trim() || null);
    if (norm(specForm.year) !== norm(init.year)) {
      const y = parseInt(specForm.year, 10);
      if (!Number.isNaN(y)) payload.year = y;
    }
    if (norm(specForm.road_ascent_year) !== norm(init.road_ascent_year)) {
      const y = parseInt(specForm.road_ascent_year, 10);
      (payload as Record<string, unknown>).road_ascent_year = Number.isNaN(y) ? null : y;
    }
    if (norm(specForm.road_ascent_month) !== norm(init.road_ascent_month)) {
      const m = parseInt(specForm.road_ascent_month, 10);
      (payload as Record<string, unknown>).road_ascent_month =
        Number.isNaN(m) || m < 1 || m > 12 ? null : m;
    }
    setIfChanged('color', specForm.color?.trim() || null);
    setIfChanged('fuel_type', specForm.fuel_type?.trim() || null);
    setIfChanged('vehicle_standard', specForm.vehicle_standard?.trim() || null);
    if (norm(specForm.vat_recognized) !== norm(init.vat_recognized)) {
      const raw = specForm.vat_recognized?.trim() ?? '';
      if (raw === '') (payload as Record<string, unknown>).vat_recognized = null;
      else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isNaN(n)) (payload as Record<string, unknown>).vat_recognized = n;
      }
    }
    if (norm(specForm.monthly_total_cost) !== norm(init.monthly_total_cost)) {
      const raw = specForm.monthly_total_cost?.trim() ?? '';
      if (raw === '') (payload as Record<string, unknown>).monthly_total_cost = null;
      else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isNaN(n)) (payload as Record<string, unknown>).monthly_total_cost = n;
      }
    }
    if (norm(specForm.base_index) !== norm(init.base_index)) {
      const raw = specForm.base_index?.trim() ?? '';
      if (raw === '') (payload as Record<string, unknown>).base_index = null;
      else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isNaN(n)) (payload as Record<string, unknown>).base_index = n;
      }
    }
    setIfChanged('engine_volume', specForm.engine_volume?.trim() || null);
    setIfChanged('ignition_code', specForm.ignition_code?.trim() || null);
    setIfChanged('ownership_type', specForm.ownership_type?.trim() || null);
    setIfChanged('leasing_company_name', specForm.leasing_company_name?.trim() || null);
    const dateOrNull = (k: string) => {
      const v = specForm[k]?.trim();
      return v ? v : null;
    };
    setIfChanged('pickup_date', dateOrNull('pickup_date'));
    setIfChanged('purchase_date', dateOrNull('purchase_date'));
    setIfChanged('sale_date', dateOrNull('sale_date'));
    setIfChanged('chassis_number', specForm.chassis_number?.trim() || null);
    setIfChanged('safety_officer', specForm.safety_officer?.trim() || null);

    if (norm(specForm.average_fuel_consumption ?? '') !== norm(init.average_fuel_consumption ?? '')) {
      const t = specForm.average_fuel_consumption?.trim() ?? '';
      if (t === '') (payload as Record<string, unknown>).average_fuel_consumption = null;
      else {
        const n = parseFloat(t.replace(',', '.'));
        if (!Number.isNaN(n)) (payload as Record<string, unknown>).average_fuel_consumption = n;
      }
    }
    if (norm(specForm.service_interval_km ?? '') !== norm(init.service_interval_km ?? '')) {
      const t = specForm.service_interval_km?.trim() ?? '';
      if (t === '') (payload as Record<string, unknown>).service_interval_km = null;
      else {
        const n = parseInt(t, 10);
        if (!Number.isNaN(n)) (payload as Record<string, unknown>).service_interval_km = n;
      }
    }

    const vehicleKeys = Object.keys(payload).filter((k) => k !== 'id');
    const assignedDriverIdChanged =
      norm(specForm.assigned_driver_id ?? '') !== norm(init.assigned_driver_id ?? '');

    if (vehicleKeys.length === 0 && !assignedDriverIdChanged) {
      setConfirmOpen(false);
      return;
    }
    setSpecSaving(true);
    try {
      if (vehicleKeys.length > 0) {
        await updateVehicle.mutateAsync(payload);
      }
      if (assignedDriverIdChanged) {
        const targetDriverId = (specForm.assigned_driver_id ?? '').trim();
        if (targetDriverId) {
          toast.message('שינוי נהג מתבצע דרך מסירת רכב');
          setConfirmOpen(false);
          setDirty(DIRTY_SOURCE_SPEC, false);
          window.location.assign(
            `/handover/delivery?vehicleId=${encodeURIComponent(vehicle.id)}&driverId=${encodeURIComponent(targetDriverId)}`
          );
          return;
        }
      }
      setConfirmOpen(false);
      const s = vehicleToSpecForm(
        vehicleKeys.length > 0 ? ({ ...vehicle, ...payload } as Vehicle) : vehicle
      );
      if (assignedDriver) {
        s.assigned_driver_name = specForm.assigned_driver_name?.trim() ?? '';
        s.assigned_driver_phone = specForm.assigned_driver_phone?.trim() ?? '';
        s.assigned_driver_id = specForm.assigned_driver_id?.trim() ?? '';
      }
      setSpecForm(s);
      initialSpecRef.current = { ...s };
      setDirty(DIRTY_SOURCE_SPEC, false);
    } finally {
      setSpecSaving(false);
    }
  };

  const handleDocumentUpload = async (file: File | null) => {
    if (!file || !vehicle) return;

    setDirty(DIRTY_SOURCE_SPEC, true);
    setIsUploadingDocument(true);
    try {
      const fileName = `vehicle-files/${vehicle.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('vehicle_documents' as any)
        .insert({
          vehicle_id: vehicle.id,
          title: file.name,
          file_url: data.publicUrl,
          document_type: 'manual',
        });

      if (insertError) throw insertError;

      await refetchVehicleDocuments();
      setDirty(DIRTY_SOURCE_SPEC, false);
    } catch {
      setDirty(DIRTY_SOURCE_SPEC, false);
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleSyncFromPricing = async () => {
    if (!vehicle.manufacturer_code || !vehicle.model_code || !vehicle.year) {
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncFromPricing.mutateAsync({
        vehicleId: vehicle.id,
        manufacturerCode: vehicle.manufacturer_code,
        modelCode: vehicle.model_code,
        year: vehicle.year,
      });
      // Update local vehicle with pricing data
      const p = result.pricingRow;
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        tax_value_price: p.usage_value,
        tax_year: p.usage_year,
        adjusted_price: p.adjusted_price,
        vehicle_type_code: p.vehicle_type_code,
        model_description: p.model_description,
        fuel_type: p.fuel_type,
        commercial_name: p.commercial_name,
        is_automatic: p.is_automatic,
        drive_type: p.drive_type,
        green_score: p.green_score,
        pollution_level: p.pollution_level,
        engine_volume: p.engine_volume_cc?.toString() || vehicle.engine_volume,
        weight: p.weight,
        list_price: p.list_price,
        effective_date: p.effective_date,
      });
    } catch {
      // handled by mutation
    } finally {
      setIsSyncing(false);
    }
  };

  const pageFrame = 'mx-auto w-full max-w-[1920px] px-4 sm:px-6';
  const ownershipLabel = vehicle.ownership_type ? displayOwnershipType(vehicle.ownership_type) : '';
  const leasingLabelRaw = vehicle.leasing_company_name?.trim() ?? '';
  const leasingLabel =
    leasingLabelRaw && leasingLabelRaw !== ownershipLabel && leasingLabelRaw !== canonicalOwnershipType(vehicle.ownership_type)
      ? leasingLabelRaw
      : '';
  const modelSlug = toModelImageSlug(`${vehicle.manufacturer} ${vehicle.model}`);
  const modelOnlySlug = toModelImageSlug(vehicle.model);
  const manufacturerRaw = (vehicle.manufacturer ?? '').trim();
  const modelRaw = (vehicle.model ?? '').trim();
  const manufacturerModelRaw = `${manufacturerRaw} ${modelRaw}`.trim();
  const manufacturerModelDash = manufacturerModelRaw.replace(/\s+/g, '-');
  const manufacturerModelUnderscore = manufacturerModelRaw.replace(/\s+/g, '_');
  const modelRawDash = modelRaw.replace(/\s+/g, '-');
  const modelRawUnderscore = modelRaw.replace(/\s+/g, '_');
  const modelImageDocUrl = (() => {
    const row = vehicleDocuments.find((d) => String(d.document_type ?? '').trim() === 'model_image');
    return row?.file_url?.trim() || null;
  })();
  const modelImageCandidates = (() => {
    const bases = uniqueNonEmpty([
      modelSlug,
      modelOnlySlug,
      manufacturerModelRaw,
      manufacturerModelDash,
      manufacturerModelUnderscore,
      modelRaw,
      modelRawDash,
      modelRawUnderscore,
    ]);
    const exts = ['png', 'jpg', 'jpeg', 'jfif', 'webp'] as const;
    const localCandidates = bases.flatMap((base) =>
      exts.map((ext) => `/vehicle-models/${encodeURIComponent(base)}.${ext}`),
    );
    return uniqueNonEmpty([modelImageOverrideUrl, modelImageDocUrl, ...localCandidates]);
  })();
  const currentModelImageSrc = modelImageCandidates[modelImageFallbackIndex] ?? null;

  const handleModelImageUpload = async (file: File | null) => {
    if (!file || !vehicle?.id) return;
    setIsUploadingModelImage(true);
    try {
      const ext = sanitizeFileExt(file.name);
      const uid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `vehicle-models/${vehicle.id}/${uid}.${ext}`;
      const contentType = file.type || 'image/jpeg';
      const { error: uploadErr } = await supabase.storage
        .from('vehicle-documents')
        .upload(path, file, { upsert: true, contentType });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('vehicle-documents').getPublicUrl(path);
      const url = data?.publicUrl?.trim();
      if (!url) throw new Error('לא התקבל קישור לתמונה');
      const { error: insertErr } = await supabase.from('vehicle_documents' as any).insert({
        vehicle_id: vehicle.id,
        title: `תמונת דגם — ${vehicle.manufacturer} ${vehicle.model}`,
        file_url: url,
        document_type: 'model_image',
      } as any);
      if (insertErr) throw insertErr;
      setModelImageOverrideUrl(url);
      setModelImageFallbackIndex(0);
      await refetchVehicleDocuments();
      toast.success('תמונת הדגם עודכנה');
    } catch (err) {
      console.error('[VehicleDetailPage] model image upload failed', err);
      toast.error('עדכון תמונת דגם נכשל');
    } finally {
      setIsUploadingModelImage(false);
      if (modelImageInputRef.current) modelImageInputRef.current.value = '';
    }
  };

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className={`${pageFrame} py-2`}>
          <div className="flex items-center justify-center">
            <h1 className="text-center font-bold text-xl">כרטיס רכב</h1>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="sticky top-[57px] z-10 bg-card border-b border-border">
        <div className={pageFrame}>
          <nav className="flex gap-1 overflow-x-auto" aria-label="סעיפי רכב">
            {[
              { label: 'סקירה', hash: '' },
              { label: 'נתוני מס', hash: '#tax-data' },
              { label: 'העברות', hash: '#handover-history' },
              { label: 'תיקייות ניהול', hash: '#vehicle-folders' },
              { label: 'מסמכים', hash: '#vehicle-documents' },
            ].map(({ label, hash }) => {
              const active =
                hash === ''
                  ? !section || section === 'overview'
                  : section === hash.slice(1);
              return (
                <Link
                  key={hash}
                  to={`/vehicles/${vehicle.id}${hash}`}
                  onClick={(e) => {
                    if (!getIsDirty()) return;
                    e.preventDefault();
                    confirmLeaveIfDirty(`/vehicles/${vehicle.id}${hash}`);
                  }}
                  className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main className={`${pageFrame} py-3 space-y-3`}>
        {/* סקירה — פריסה אחת: הירו + בנטו + טבלת מפרט (בלי מחסנית כרטיסים) */}
        {(isOverviewSection || !section) && !isHandoverSection && !isTaxSection && !isDocumentsSection && !isFoldersSection && (
          <div className="w-full space-y-3">
            {/* הירו — זהות הרכב */}
            <div className="relative overflow-hidden rounded-2xl border border-[rgba(255,215,0,0.25)] bg-[linear-gradient(135deg,#0b1a2a,#0f2438)] p-6 shadow-[0_18px_42px_rgba(0,0,0,0.38)]">
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between" dir="rtl">
                <div className="order-2 min-w-0 flex-1 text-center sm:order-1 sm:text-right" style={{ fontFamily: 'Heebo, Assistant, sans-serif' }}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-1 sm:justify-start">
                      <span className="inline-flex items-center gap-1 text-sm text-[#9aa3b2] sm:text-base">
                        <Car className="h-4 w-4 text-[rgba(255,215,0,0.7)]" />
                        רכב
                      </span>
                      <h2 className="font-mono text-4xl font-bold tracking-[0.06em] leading-none text-white sm:text-5xl" dir="ltr">
                        {str(vehicle.plate_number)}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 sm:justify-start">
                      <span className="text-sm text-[#9aa3b2] sm:text-base">נהג משויך</span>
                      {assignedDriver ? (
                        <Link
                          to={`/drivers/${assignedDriver.id}`}
                          className="text-2xl font-bold leading-tight text-white hover:text-slate-100 hover:underline sm:text-3xl"
                        >
                          {assignedDriver.full_name}
                        </Link>
                      ) : (
                        <span className="text-2xl font-bold leading-tight text-white/70 sm:text-3xl">ללא נהג משויך</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                      <span className="text-sm text-[#9aa3b2] sm:text-base">קוד נהג:</span>
                      <span className="font-mono text-2xl font-bold leading-tight text-white sm:text-3xl" dir="ltr">
                        {assignedDriver?.driver_code?.trim() ? assignedDriver.driver_code : MISSING_DATA}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                      <span className="text-sm text-[#9aa3b2] sm:text-base">קצין בטיחות:</span>
                      <span className="text-lg font-semibold leading-tight text-white sm:text-2xl">
                        {str(vehicle.safety_officer)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-[rgba(255,215,0,0.18)] pt-3">
                    <p className="text-sm text-slate-300 sm:text-base">
                      שנת ייצור {ascentMonthYear} <span className="mx-2 text-slate-500">|</span> {str(vehicle.model)} <span className="mx-2 text-slate-500">|</span> {str(vehicle.manufacturer)}
                    </p>
                  </div>
                </div>

                <div className="order-1 shrink-0 self-center sm:order-2 sm:self-start">
                  <input
                    ref={modelImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleModelImageUpload(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="group relative block h-[145px] w-[240px] overflow-hidden rounded-2xl border border-[rgba(255,215,0,0.25)] bg-[linear-gradient(145deg,#e8edf4,#cfd8e6)]"
                    onClick={() => modelImageInputRef.current?.click()}
                    disabled={isUploadingModelImage}
                    title="החלפת תמונת דגם"
                  >
                    {currentModelImageSrc ? (
                      <img
                        src={currentModelImageSrc}
                        alt={`${vehicle.manufacturer} ${vehicle.model}`}
                        className="h-full w-full object-cover"
                        onError={() => setModelImageFallbackIndex((i) => i + 1)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        הוספת תמונת דגם
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                      {isUploadingModelImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                      החלף תמונה
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <VehicleDetailQuickActions
              vehicle={vehicle}
              showReportMileage={showReportMileage}
              showServiceUpdate={showServiceUpdate}
            />

            {/* בנטו — שלושה מדדים מרכזיים בשורה */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Gauge className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-medium uppercase tracking-wider">מד אוץ</span>
                </div>
                <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-white" dir="ltr">
                  {displayOdometer.toLocaleString()}
                  <span className="mr-1 text-sm font-normal text-muted-foreground">ק״מ</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {vehicle.updated_at
                    ? `עודכן ב-${fmtDriverDate(vehicle.updated_at)}`
                    : 'תאריך עדכון לא זמין'}
                  {displayOdometer > odoFromOdometer && odoFromLastService > 0 ? ' · כולל תחזוקה' : ''}
                </p>
                <div className="mt-1.5 border-t border-white/10 pt-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">ק״מ לטיפול הבא</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {vehicle.next_maintenance_km != null
                        ? `${Math.max(0, vehicle.next_maintenance_km - displayOdometer).toLocaleString()} ק״מ`
                        : MISSING_DATA}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium uppercase tracking-wider">תקינות</span>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      to={`/vehicles/${vehicle.id}?focus=annual_license#vehicle-documents`}
                      onClick={(e) => {
                        if (!getIsDirty()) return;
                        e.preventDefault();
                        confirmLeaveIfDirty(`/vehicles/${vehicle.id}?focus=annual_license#vehicle-documents`);
                      }}
                      className="text-muted-foreground underline-offset-2 hover:text-cyan-300 hover:underline"
                      title="מסמכי רישוי / טסט"
                    >
                      טסט
                    </Link>
                    <span className="font-mono tabular-nums" dir="ltr">
                      {testExempt ? 'פטור בשנה ראשונה' : fmtDriverDate(vehicle.test_expiry)}
                    </span>
                    {test ? (
                      <StatusBadge status={test.status} daysLeft={test.daysLeft} compact />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{MISSING_DATA}</Badge>
                    )}
                    {testExempt ? (
                      <Badge className="border-cyan-500/40 bg-cyan-500/10 text-[10px] text-cyan-100">אגרת בלבד</Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      to={`/vehicles/${vehicle.id}?focus=insurance_policy#vehicle-documents`}
                      onClick={(e) => {
                        if (!getIsDirty()) return;
                        e.preventDefault();
                        confirmLeaveIfDirty(`/vehicles/${vehicle.id}?focus=insurance_policy#vehicle-documents`);
                      }}
                      className="text-muted-foreground underline-offset-2 hover:text-cyan-300 hover:underline"
                      title="מסמכי ביטוח"
                    >
                      ביטוח
                    </Link>
                    <span className="font-mono tabular-nums" dir="ltr">{fmtDriverDate(vehicle.insurance_expiry)}</span>
                    {insurance ? <StatusBadge status={insurance.status} daysLeft={insurance.daysLeft} compact /> : <Badge variant="outline" className="text-[10px]">{MISSING_DATA}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wrench className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wider">טיפול הבא</span>
                </div>
                <div className="mt-1.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">תאריך טיפול אחרון</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {fmtDriverDate(vehicle.last_service_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">ק״מ טיפול אחרון</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {vehicle.last_service_km != null
                        ? `${vehicle.last_service_km.toLocaleString()} ק״מ`
                        : MISSING_DATA}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">תאריך טיפול הבא</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {fmtDriverDate(vehicle.next_maintenance_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">ק״מ טיפול הבא</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {vehicle.next_maintenance_km != null
                        ? `${vehicle.next_maintenance_km.toLocaleString()} ק״מ`
                        : MISSING_DATA}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* מפרט מלא — עריכה ישירה + אישור שינויים */}
            <div id="spec-full-section" className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/40">
              <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                  <div className="justify-self-start">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-cyan-600 px-3 text-xs hover:bg-cyan-500"
                      onClick={() => {
                        document.getElementById('spec-full-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        openSpecConfirm();
                      }}
                      disabled={specSaving}
                    >
                      {specSaving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
                      אישור שינויים
                    </Button>
                  </div>
                  <h3 className="justify-self-center text-sm font-semibold text-slate-200">מפרט מלא</h3>
                  <div />
                </div>
              </div>
              <div className="space-y-2 border-t border-white/10 p-2.5" dir="rtl">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">יצרן</span>
                      <Input
                        className="h-9 bg-background/80"
                        value={specForm.manufacturer ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, manufacturer: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">דגם</span>
                      <Input
                        className="h-9 bg-background/80"
                        value={specForm.model ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, model: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <FleetDatePicker
                        label="תאריך קניה / תחילת עסקה"
                        className="[&_input]:h-9"
                        value={specForm.purchase_date ?? ''}
                        onChange={(ymd) => setSpecForm((p) => ({ ...p, purchase_date: ymd }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <FleetDatePicker
                        label="תאריך מכירה / סיום עסקה"
                        className="[&_input]:h-9"
                        value={specForm.sale_date ?? ''}
                        onChange={(ymd) => setSpecForm((p) => ({ ...p, sale_date: ymd }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">שנת ייצור</span>
                      <Input type="number" className="h-9 bg-background/80" dir="ltr" value={specForm.year ?? ''} onChange={(e) => setSpecForm((p) => ({ ...p, year: e.target.value }))} />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">חודש עליה לכביש</span>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        className="h-9 bg-background/80"
                        dir="ltr"
                        value={specForm.road_ascent_month ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, road_ascent_month: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">סוג דלק</span>
                      <Select
                        value={specForm.fuel_type || 'none'}
                        onValueChange={(v) => setSpecForm((p) => ({ ...p, fuel_type: v === 'none' ? '' : v }))}
                      >
                        <SelectTrigger className="h-9 bg-background/80">
                          <SelectValue placeholder="בחר סוג דלק" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="בנזין">בנזין</SelectItem>
                          <SelectItem value="סולר">סולר</SelectItem>
                          <SelectItem value="חשמל">חשמל</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">צבע</span>
                      <Input className="h-9 bg-background/80" value={specForm.color ?? ''} onChange={(e) => setSpecForm((p) => ({ ...p, color: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">סוג בעלות</span>
                      <Select
                        value={specForm.ownership_type || 'none'}
                        onValueChange={(v) =>
                          setSpecForm((p) => ({
                            ...p,
                            ownership_type: v === 'none' ? '' : v,
                            leasing_company_name: v === 'ליסינג' ? p.leasing_company_name : '',
                          }))
                        }
                      >
                        <SelectTrigger className="h-9 bg-background/80">
                          <SelectValue placeholder="בחר" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="ליסינג">ליסינג</SelectItem>
                          <SelectItem value="בעלות חברה">בעלות חברה</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">חברת ליסינג</span>
                      <Select
                        value={specForm.leasing_company_name || 'none'}
                        onValueChange={(v) =>
                          setSpecForm((p) => ({
                            ...p,
                            leasing_company_name: v === 'none' ? '' : v,
                          }))
                        }
                        disabled={specForm.ownership_type !== 'ליסינג'}
                      >
                        <SelectTrigger className="h-9 bg-background/80">
                          <SelectValue placeholder={specForm.ownership_type === 'ליסינג' ? 'בחר חברת ליסינג' : 'זמין רק בליסינג'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {LEASING_COMPANY_OPTIONS.map((company) => (
                            <SelectItem key={company} value={company}>
                              {company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">נפח מנוע (סמ״ק)</span>
                      <Input className="h-9 bg-background/80" dir="ltr" value={specForm.engine_volume ?? ''} onChange={(e) => setSpecForm((p) => ({ ...p, engine_volume: e.target.value }))} />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">קוד הנעה</span>
                      <Input className="h-9 bg-background/80" dir="ltr" value={specForm.ignition_code ?? ''} onChange={(e) => setSpecForm((p) => ({ ...p, ignition_code: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">מספר שלדה</span>
                      <Input className="h-9 bg-background/80" dir="ltr" value={specForm.chassis_number ?? ''} onChange={(e) => setSpecForm((p) => ({ ...p, chassis_number: e.target.value }))} placeholder="VIN / מספר שלדה" />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <FleetDatePicker label="תאריך קליטה" className="[&_input]:h-9" value={specForm.pickup_date ?? ''} onChange={(ymd) => setSpecForm((p) => ({ ...p, pickup_date: ymd }))} />
                    </div>
                  </div>
                </div>

                

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">נהג מוקצה</span>
                      <Select
                        value={specForm.assigned_driver_id?.trim() ? specForm.assigned_driver_id : 'none'}
                        onValueChange={(value) => {
                          const selectedId = value === 'none' ? '' : value;
                          const selected = drivers.find((d) => d.id === selectedId);
                          setSpecForm((p) => ({
                            ...p,
                            assigned_driver_id: selectedId,
                            assigned_driver_name: selected?.full_name ?? '',
                            assigned_driver_phone: selected?.phone ?? '',
                          }));
                        }}
                      >
                        <SelectTrigger className="h-9 bg-background/80">
                          <SelectValue placeholder="בחר נהג" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ללא נהג מוקצה</SelectItem>
                          {drivers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.full_name}
                              {d.driver_code?.trim() ? ` (${d.driver_code})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">טלפון נהג</span>
                      <Input
                        className="h-9 bg-background/80"
                        dir="ltr"
                        value={specForm.assigned_driver_phone ?? ''}
                        placeholder={specForm.assigned_driver_id ? undefined : '—'}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row-reverse">
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">התקן</span>
                      <Input
                        className="h-9 bg-background/80"
                        value={specForm.vehicle_standard ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, vehicle_standard: e.target.value }))}
                        placeholder="למשל Euro 6"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">מע״מ מוכר</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 bg-background/80"
                        dir="ltr"
                        placeholder="למשל 17"
                        value={specForm.vat_recognized ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, vat_recognized: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">קצין בטיחות</span>
                      <Input
                        className="h-9 bg-background/80"
                        value={specForm.safety_officer ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, safety_officer: e.target.value }))}
                        placeholder="שם קצין בטיחות"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">עלות ליסינג חודשית</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 bg-background/80"
                        dir="ltr"
                        placeholder="למשל 3200"
                        value={specForm.monthly_total_cost ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, monthly_total_cost: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">מדד בסיס</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 bg-background/80"
                        dir="ltr"
                        placeholder="למשל 100.5"
                        value={specForm.base_index ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, base_index: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">מרווח טיפול מומלץ (ק״מ)</span>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 bg-background/80"
                        dir="ltr"
                        placeholder="למשל 15000"
                        value={specForm.service_interval_km ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, service_interval_km: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">צריכת דלק ממוצעת</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-9 bg-background/80"
                        dir="ltr"
                        placeholder="למשל 6.5"
                        value={specForm.average_fuel_consumption ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, average_fuel_consumption: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
                <AlertDialogHeader>
                  <AlertDialogTitle>אישור שמירת שינויים</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-right text-foreground">
                      <p className="text-sm text-muted-foreground">השדות הבאים השתנו. לאשר שמירה?</p>
                      <ul className="list-inside list-disc rounded-md border border-border bg-muted/30 p-3 text-sm">
                        {changeLines.map((line, i) => (
                          <li key={i} className="py-0.5">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel disabled={specSaving}>ביטול</AlertDialogCancel>
                  <AlertDialogAction onClick={(e) => { e.preventDefault(); performSpecSave(); }} disabled={specSaving}>
                    {specSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                    אישור ושמירה
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Pricing / Tax Data - All 19 columns */}
        {isTaxSection && (
        <Card id="tax-data">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>נתוני מס</CardTitle>
              </div>
              {vehicle.manufacturer_code && vehicle.model_code ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncFromPricing}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 ml-1" />
                  )}
                  סנכרון נתונים
                </Button>
              ) : (
                <Link to={`/vehicles/${vehicle.id}/edit`}>
                  <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
                    <Edit className="h-4 w-4 ml-1" />
                    הגדר קוד תוצר/דגם
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!vehicle.manufacturer_code || !vehicle.model_code) && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <span className="text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
                <div className="space-y-1">
                  <p className="font-medium text-amber-300">חסרים קודי יצרן/דגם</p>
                  <p className="text-amber-400/80">
                    כדי לסנכרן נתוני מס ושווי שימוש, יש להגדיר{' '}
                    {!vehicle.manufacturer_code && <strong>קוד תוצר</strong>}
                    {!vehicle.manufacturer_code && !vehicle.model_code && ' ו'}
                    {!vehicle.model_code && <strong>קוד דגם</strong>}
                    {' '}בדף עריכת הרכב.
                  </p>
                  <Link to={`/vehicles/${vehicle.id}/edit`} className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2 text-xs font-medium">
                    <Edit className="h-3 w-3" />
                    פתח עריכת רכב
                  </Link>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* A - שנת מס */}
              <div>
                <p className="text-sm text-muted-foreground">שנת מס</p>
                <p className="font-medium">{taxValueYear || '-'}</p>
              </div>
              {/* B - שנת רישום */}
              <div>
                <p className="text-sm text-muted-foreground">שנת רישום</p>
                <p className="font-medium">{vehicle.year}</p>
              </div>
              {/* C - קוד סוג רכב */}
              <div>
                <p className="text-sm text-muted-foreground">קוד סוג רכב</p>
                <p className="font-medium">{vehicle.vehicle_type_code || '-'}</p>
              </div>
              {/* D - קוד תוצר */}
              <div>
                <p className="text-sm text-muted-foreground">קוד תוצר</p>
                <p className="font-medium font-mono">{vehicle.manufacturer_code || '-'}</p>
              </div>
              {/* E - שם תוצר */}
              <div>
                <p className="text-sm text-muted-foreground">שם תוצר</p>
                <p className="font-medium">{vehicle.manufacturer}</p>
              </div>
              {/* F - קוד דגם */}
              <div>
                <p className="text-sm text-muted-foreground">קוד דגם</p>
                <p className="font-medium font-mono">{vehicle.model_code || '-'}</p>
              </div>
              {/* G - תאור דגם */}
              <div>
                <p className="text-sm text-muted-foreground">תיאור דגם</p>
                <p className="font-medium">{vehicle.model_description || '-'}</p>
              </div>
              {/* H - סוג דלק */}
              <div>
                <p className="text-sm text-muted-foreground">סוג דלק</p>
                <p className="font-medium">{vehicle.fuel_type || '-'}</p>
              </div>
              {/* I - כינוי מסחרי */}
              <div>
                <p className="text-sm text-muted-foreground">כינוי מסחרי</p>
                <p className="font-medium">{vehicle.commercial_name || '-'}</p>
              </div>
              {/* J - אוטומט */}
              <div>
                <p className="text-sm text-muted-foreground">אוטומטי</p>
                <p className="font-medium">{vehicle.is_automatic === true ? 'כן' : vehicle.is_automatic === false ? 'לא' : '-'}</p>
              </div>
              {/* K - סוג הנעה */}
              <div>
                <p className="text-sm text-muted-foreground">סוג הנעה</p>
                <p className="font-medium">{vehicle.drive_type || '-'}</p>
              </div>
              {/* L - ציון ירוק */}
              <div>
                <p className="text-sm text-muted-foreground">ציון ירוק</p>
                <p className="font-medium">{vehicle.green_score ?? '-'}</p>
              </div>
              {/* M - דרגת זיהום */}
              <div>
                <p className="text-sm text-muted-foreground">דרגת זיהום</p>
                <p className="font-medium">{vehicle.pollution_level ?? '-'}</p>
              </div>
              {/* N - נפח מנוע */}
              <div>
                <p className="text-sm text-muted-foreground">נפח מנוע (סמ״ק)</p>
                <p className="font-medium">{vehicle.engine_volume || '-'}</p>
              </div>
              {/* O - משקל */}
              <div>
                <p className="text-sm text-muted-foreground">משקל (ק״ג)</p>
                <p className="font-medium">{vehicle.weight ?? '-'}</p>
              </div>
              {/* P - תאריך תחולה */}
              <div>
                <p className="text-sm text-muted-foreground">תאריך תחולה</p>
                <p className="font-medium">{vehicle.effective_date || '-'}</p>
              </div>
              {/* Q - מחיר מחירון */}
              <div>
                <p className="text-sm text-muted-foreground">מחיר מחירון</p>
                <p className="font-medium">{vehicle.list_price ? `₪${vehicle.list_price.toLocaleString()}` : '-'}</p>
              </div>
              {/* R - מחיר מתואם */}
              <div>
                <p className="text-sm text-muted-foreground">מחיר מתואם</p>
                <p className="font-medium">{adjustedPrice ? `₪${adjustedPrice.toLocaleString()}` : '-'}</p>
              </div>
              {/* S - שווי שימוש */}
              <div>
                <p className="text-sm text-muted-foreground">שווי שימוש</p>
                <p className="font-medium">{taxValuePrice ? `₪${taxValuePrice.toLocaleString()}` : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Handover History */}
        {isHandoverSection && (
        <Card id="handover-history">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>היסטורית העברות</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {handovers && handovers.length > 0 ? (
              <HandoverHistoryList handovers={handovers} />
            ) : (
              <p className="text-muted-foreground">אין רשומות העברות</p>
            )}
          </CardContent>
        </Card>
        )}

        {/* Vehicle Folders */}
        {isFoldersSection && <VehicleFolders vehicle={vehicle} />}

        {/* Vehicle Documents */}
        {isDocumentsSection && (
          <Card id="vehicle-documents">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  onChange={(event) => handleDocumentUpload(event.target.files?.[0] ?? null)}
                  disabled={isUploadingDocument}
                />
                {isUploadingDocument && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {vehicleDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין מסמכים לרכב זה</p>
              ) : (
                <div className="space-y-2">
                  {vehicleDocuments.map((doc) => {
                    const titleStr = String(doc?.title ?? 'מסמך');
                    const fileUrl = typeof doc?.file_url === 'string' ? doc.file_url.trim() : '';
                    const dt = String(doc?.document_type ?? '').trim();
                    const inferredFocus =
                      dt === 'annual_license' || dt === 'insurance_policy' || dt === 'tire_change'
                        ? dt
                        : /רישיון רכב \(טסט\)|טסט/i.test(titleStr)
                          ? 'annual_license'
                          : /פוליסת|ביטוח/i.test(titleStr)
                            ? 'insurance_policy'
                            : /החלפת צמיג|צמיגים/i.test(titleStr)
                              ? 'tire_change'
                              : null;
                    const dataFocus =
                      inferredFocus === 'annual_license'
                        ? dt === 'annual_license'
                          ? 'annual_license'
                          : 'legacy_license'
                        : inferredFocus ?? undefined;
                    const createdLabel = (() => {
                      try {
                        const d = doc?.created_at ? new Date(doc.created_at) : null;
                        return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('he-IL') : '—';
                      } catch {
                        return '—';
                      }
                    })();
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        data-doc-focus={dataFocus ?? undefined}
                        disabled={!fileUrl}
                        onClick={() => {
                          if (fileUrl) window.open(fileUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-border p-2 text-right text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1 truncate ps-2 text-start font-medium">{titleStr}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{createdLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
