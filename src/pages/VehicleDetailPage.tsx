import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useVehicle, useUpdateVehicle, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { useDriver, useUpdateDriver } from '@/hooks/useDrivers';
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
} from 'lucide-react';
import type { ComplianceStatus } from '@/types/fleet';
import { VehicleFolders } from '@/components/VehicleFolders';
import { VehicleDetailQuickActions } from '@/components/vehicles/VehicleDetailQuickActions';
import VehicleDamageSnapshot from '@/components/VehicleDamageSnapshot';
import { parseDamageSummaryLine } from '@/lib/vehicleDamage';
import { MISSING_DATA, fmtDriverDate } from '@/components/DriverCard';
import { displayOwnershipType, canonicalOwnershipType, ownershipSelectDefault } from '@/lib/vehicleOwnership';
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

/** שדות מפרט מלא לעריכה inline — ערכים כמחרוזות; תאריכים בפורמט input date */
type SpecFormState = Record<string, string>;

function vehicleToSpecForm(v: Vehicle): SpecFormState {
  const d = (x: string | null | undefined) => (x && String(x).trim() !== '' ? String(x).slice(0, 10) : '');
  return {
    manufacturer: v.manufacturer ?? '',
    model: v.model ?? '',
    year: v.year != null ? String(v.year) : '',
    color: v.color ?? '',
    engine_volume: v.engine_volume ?? '',
    ignition_code: v.ignition_code ?? '',
    ownership_type: ownershipSelectDefault(v.ownership_type),
    leasing_company_name: v.leasing_company_name ?? '',
    pickup_date: d(v.pickup_date),
    purchase_date: d(v.purchase_date),
    sale_date: d(v.sale_date),
    chassis_number: v.chassis_number ?? '',
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
  color: 'צבע',
  engine_volume: 'נפח מנוע (סמ״ק)',
  ignition_code: 'קוד הנעה',
  ownership_type: 'סוג בעלות',
  leasing_company_name: 'חברת ליסינג',
  pickup_date: 'תאריך קליטה',
  purchase_date: 'תאריך קניה / תחילת עסקה',
  sale_date: 'תאריך מכירה / סיום עסקה',
  chassis_number: 'מספר שלדה',
  average_fuel_consumption: 'צריכת דלק ממוצעת',
  service_interval_km: 'מרווח טיפול מומלץ (ק״מ)',
  assigned_driver_name: 'שם נהג מוקצה',
  assigned_driver_phone: 'טלפון נהג',
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
  const updateDriver = useUpdateDriver();
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

  useEffect(() => {
    if (!vehicle) return;
    const s = vehicleToSpecForm(vehicle);
    if (assignedDriver) {
      s.assigned_driver_name = assignedDriver.full_name ?? '';
      s.assigned_driver_phone = assignedDriver.phone ?? '';
    } else {
      s.assigned_driver_name = '';
      s.assigned_driver_phone = '';
    }
    setSpecForm(s);
    initialSpecRef.current = { ...s };
  }, [vehicle?.id, vehicle?.updated_at, assignedDriver?.id]);

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
    setIfChanged('color', specForm.color?.trim() || null);
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
    const driverNameChanged =
      assignedDriver &&
      norm(specForm.assigned_driver_name ?? '') !== norm(init.assigned_driver_name ?? '');
    const driverPhoneChanged =
      assignedDriver &&
      norm(specForm.assigned_driver_phone ?? '') !== norm(init.assigned_driver_phone ?? '');

    if (vehicleKeys.length === 0 && !driverNameChanged && !driverPhoneChanged) {
      setConfirmOpen(false);
      return;
    }
    setSpecSaving(true);
    try {
      if (vehicleKeys.length > 0) {
        await updateVehicle.mutateAsync(payload);
      }
      if (assignedDriver && (driverNameChanged || driverPhoneChanged)) {
        const name = specForm.assigned_driver_name?.trim();
        const phone = specForm.assigned_driver_phone?.trim();
        await updateDriver.mutateAsync({
          id: assignedDriver.id,
          full_name: name || assignedDriver.full_name,
          phone: phone ? phone : null,
        });
      }
      setConfirmOpen(false);
      const s = vehicleToSpecForm(
        vehicleKeys.length > 0 ? ({ ...vehicle, ...payload } as Vehicle) : vehicle
      );
      if (assignedDriver) {
        s.assigned_driver_name = specForm.assigned_driver_name?.trim() ?? '';
        s.assigned_driver_phone = specForm.assigned_driver_phone?.trim() ?? '';
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

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className={`${pageFrame} py-4`}>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-bold text-xl">{vehicle.manufacturer} {vehicle.model}</h1>
              <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="sticky top-[65px] z-10 bg-card border-b border-border">
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
                  className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

      <main className={`${pageFrame} py-6 space-y-4`}>
        {/* סקירה — פריסה אחת: הירו + בנטו + טבלת מפרט (בלי מחסנית כרטיסים) */}
        {(isOverviewSection || !section) && !isHandoverSection && !isTaxSection && !isDocumentsSection && !isFoldersSection && (
          <div className="w-full space-y-6">
            {/* הירו — זהות הרכב */}
            <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-800/90 via-slate-900 to-[#0a1628] px-4 py-4 shadow-[0_0_50px_rgba(6,182,212,0.06)] sm:px-6 sm:py-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent)]" />
              <div className="relative flex flex-col gap-3 sm:flex-row-reverse sm:items-start sm:justify-between">
                <div className="shrink-0 self-center sm:self-start">
                  <Button
                    type="button"
                    className="bg-cyan-600 hover:bg-cyan-500 font-semibold shadow-lg shadow-cyan-900/30"
                    onClick={() => {
                      document.getElementById('spec-full-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      openSpecConfirm();
                    }}
                    disabled={specSaving}
                  >
                    {specSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                    אישור שינויים
                  </Button>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 text-center sm:text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-500/70">רכב</p>
                  <div
                    dir="ltr"
                    className="mt-0.5 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 sm:justify-end"
                  >
                    <p className="order-2 text-sm text-slate-300 sm:order-1">
                      <span className="text-muted-foreground">נהג משויך: </span>
                      {assignedDriver ? (
                        <Link
                          to={`/drivers/${assignedDriver.id}`}
                          className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
                        >
                          {assignedDriver.full_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">אין נהג משויך</span>
                      )}
                    </p>
                    <h2
                      className="order-1 font-mono text-3xl font-black tracking-[0.15em] text-cyan-200 sm:order-2 sm:text-4xl"
                    >
                      {str(vehicle.plate_number)}
                    </h2>
                  </div>
                  <p className="pt-0.5 text-base font-medium text-slate-200 sm:text-lg">
                    {str(vehicle.manufacturer)} {str(vehicle.model)}
                  </p>
                  <p className="text-sm text-slate-500">
                    שנת {vehicle.year ?? '—'}
                    {vehicle.ownership_type ? ` · ${displayOwnershipType(vehicle.ownership_type)}` : ''}
                    {canonicalOwnershipType(vehicle.ownership_type) === 'הרץ' &&
                    vehicle.leasing_company_name?.trim()
                      ? ` · ${vehicle.leasing_company_name.trim()}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>

            <VehicleDetailQuickActions
              vehicle={vehicle}
              showReportMileage={showReportMileage}
              showServiceUpdate={showServiceUpdate}
            />

            {/* בנטו — שלושה מדדים מרכזיים בשורה */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Gauge className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-medium uppercase tracking-wider">מד אוץ</span>
                </div>
                <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-white" dir="ltr">
                  {displayOdometer.toLocaleString()}
                  <span className="mr-1 text-sm font-normal text-muted-foreground">ק״מ</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {vehicle.updated_at
                    ? `עודכן ב-${fmtDriverDate(vehicle.updated_at)}`
                    : 'תאריך עדכון לא זמין'}
                  {displayOdometer > odoFromOdometer && odoFromLastService > 0 ? ' · כולל תחזוקה' : ''}
                </p>
                <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">תאריך טיפול אחרון</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {fmtDriverDate(vehicle.last_service_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">ק״מ טיפול אחרון</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {vehicle.last_service_km != null
                        ? `${vehicle.last_service_km.toLocaleString()} ק״מ`
                        : MISSING_DATA}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium uppercase tracking-wider">תקינות</span>
                </div>
                <div className="mt-3 space-y-2">
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
                    <span className="font-mono tabular-nums" dir="ltr">{fmtDriverDate(vehicle.test_expiry)}</span>
                    {test ? <StatusBadge status={test.status} daysLeft={test.daysLeft} compact /> : <Badge variant="outline" className="text-[10px]">{MISSING_DATA}</Badge>}
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
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wrench className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-medium uppercase tracking-wider">טיפול הבא</span>
                </div>
                <p className="mt-3 text-sm font-medium">{fmtDriverDate(vehicle.next_maintenance_date)}</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-300" dir="ltr">
                  {vehicle.next_maintenance_km != null ? `${vehicle.next_maintenance_km.toLocaleString()} ק״מ` : MISSING_DATA}
                </p>
                {vehicle.service_interval_km != null && (
                  <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
                    מרווח מומלץ: {vehicle.service_interval_km.toLocaleString()} ק״מ
                  </p>
                )}
              </div>
            </div>

            {/* מפרט מלא — עריכה ישירה + אישור שינויים */}
            <div id="spec-full-section" className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/40">
              <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-200">מפרט מלא</h3>
                <p className="text-xs text-muted-foreground">עריכה ישירה — לחץ אישור שינויים בהירו לשמירה</p>
              </div>
              {/* dir=ltr כדי שעמודת תאריכים תישאר משמאל ועמודת יצרן מימין (עקביות עם מסך) */}
              <div className="grid grid-cols-1 gap-0 md:grid-cols-2" dir="ltr">
                {/* עמודה שמאלית: תאריכי קליטה / קניה / מכירה — רישוי/ביטוח/טסט/צמיגים/טיפול מעודכנים מהריבועים למעלה */}
                <div className="space-y-2 border-t border-white/10 p-3 md:border-t-0 md:border-e md:border-white/10">
                  <div className="flex flex-col gap-1" dir="rtl">
                    <FleetDatePicker
                      label="תאריך קליטה"
                      className="[&_input]:h-9"
                      value={specForm.pickup_date ?? ''}
                      onChange={(ymd) => setSpecForm((p) => ({ ...p, pickup_date: ymd }))}
                    />
                  </div>
                  <FleetDatePicker
                    label="תאריך קניה / תחילת עסקה"
                    className="[&_input]:h-9"
                    value={specForm.purchase_date ?? ''}
                    onChange={(ymd) => setSpecForm((p) => ({ ...p, purchase_date: ymd }))}
                  />
                  <FleetDatePicker
                    label="תאריך מכירה / סיום עסקה"
                    className="[&_input]:h-9"
                    value={specForm.sale_date ?? ''}
                    onChange={(ymd) => setSpecForm((p) => ({ ...p, sale_date: ymd }))}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground" dir="rtl">
                    לעדכון רישוי שנתי, ביטוח, צמיגים, טיפול או ק״מ השתמשי בריבועים מתחת לכותרת הרכב — הקבצים נשמרים בלשונית &quot;מסמכים&quot; עם כותרת מתאימה.
                  </p>
                </div>
                {/* עמודה ימנית: יצרן וכו׳ */}
                <div className="space-y-2 border-t border-white/10 p-3 md:border-t-0 md:border-s md:border-white/10">
                  {(
                    [
                      ['manufacturer', 'יצרן'],
                      ['model', 'דגם'],
                      ['year', 'שנת ייצור'],
                      ['color', 'צבע'],
                      ['engine_volume', 'נפח מנוע (סמ״ק)'],
                      ['ignition_code', 'קוד הנעה'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-1" dir="rtl">
                      <span className="text-xs font-medium text-muted-foreground">{label}</span>
                      <Input
                        type={key === 'year' ? 'number' : 'text'}
                        className="h-9 bg-background/80"
                        dir={key === 'engine_volume' || key === 'year' ? 'ltr' : undefined}
                        value={specForm[key] ?? ''}
                        onChange={(e) => setSpecForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1" dir="rtl">
                    <span className="text-xs font-medium text-muted-foreground">מספר שלדה</span>
                    <Input
                      className="h-9 bg-background/80"
                      dir="ltr"
                      value={specForm.chassis_number ?? ''}
                      onChange={(e) => setSpecForm((p) => ({ ...p, chassis_number: e.target.value }))}
                      placeholder="VIN / מספר שלדה"
                    />
                  </div>
                  <div className="flex flex-col gap-1" dir="rtl">
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
                  <div className="flex flex-col gap-1" dir="rtl">
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
                  <div className="flex flex-col gap-1" dir="rtl">
                    <span className="text-xs font-medium text-muted-foreground">נהג מוקצה</span>
                    <Input
                      className="h-9 bg-background/80"
                      value={specForm.assigned_driver_name ?? ''}
                      onChange={(e) => setSpecForm((p) => ({ ...p, assigned_driver_name: e.target.value }))}
                      placeholder={assignedDriver ? undefined : 'אין נהג מוקצה'}
                      disabled={!assignedDriver}
                    />
                  </div>
                  <div className="flex flex-col gap-1" dir="rtl">
                    <span className="text-xs font-medium text-muted-foreground">טלפון נהג</span>
                    <Input
                      className="h-9 bg-background/80"
                      dir="ltr"
                      value={specForm.assigned_driver_phone ?? ''}
                      onChange={(e) => setSpecForm((p) => ({ ...p, assigned_driver_phone: e.target.value }))}
                      placeholder={assignedDriver ? undefined : '—'}
                      disabled={!assignedDriver}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">סוג בעלות</span>
                    <Select
                      value={specForm.ownership_type || 'none'}
                      onValueChange={(v) => setSpecForm((p) => ({ ...p, ownership_type: v === 'none' ? '' : v }))}
                    >
                      <SelectTrigger className="h-9 bg-background/80">
                        <SelectValue placeholder="בחר" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="הרץ">הרץ</SelectItem>
                        <SelectItem value="יוניון מוביליטי">יוניון מוביליטי</SelectItem>
                        <SelectItem value="פריים ליס">פריים ליס</SelectItem>
                        <SelectItem value="rental">השכרה (ישן)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1" dir="rtl">
                    <span className="text-xs font-medium text-muted-foreground">חברת ליסינג</span>
                    <Input
                      className="h-9 bg-background/80"
                      value={specForm.leasing_company_name ?? ''}
                      onChange={(e) => setSpecForm((p) => ({ ...p, leasing_company_name: e.target.value }))}
                    />
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
