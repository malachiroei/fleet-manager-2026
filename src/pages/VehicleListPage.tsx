import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useVehicles,
  useAssignDriverToVehicle,
  useActiveDriverVehicleAssignments,
  type ActiveDriverVehicleAssignment,
} from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Search, 
  Car,
  ClipboardList,
  FileText,
  Zap,
  Gauge,
  Shield,
  CalendarClock,
  UserRound,
  CircleCheck,
  CircleAlert,
  Eye
} from 'lucide-react';
import type { Vehicle, ComplianceStatus, DriverSummary } from '@/types/fleet';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.length > 0
      ? message
      : 'אירעה שגיאה לא צפויה בעת שליפת הרכבים.';
  }
  return 'אירעה שגיאה לא צפויה בעת שליפת הרכבים.';
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const config = {
    valid:   { label: 'תקין',     className: 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_8px_rgba(52,211,153,0.3)]' },
    warning: { label: 'אזהרה',   className: 'border-amber-400/60  bg-amber-500/20  text-amber-200  shadow-[0_0_8px_rgba(251,191,36,0.3)]' },
    expired: { label: 'פג תוקף', className: 'border-rose-400/60   bg-rose-500/20   text-rose-200   shadow-[0_0_8px_rgba(251,113,133,0.3)]' },
  };

  const { label, className } = config[status];
  return <Badge className={`border text-xs font-semibold ${className}`}>{label}</Badge>;
}

function VehicleCard({ vehicle, canEdit, drivers, onAssignDriver, isAssigning, activeAssignment }: {
  vehicle: Vehicle; 
  canEdit: boolean;
  drivers: DriverSummary[];
  onAssignDriver: (vehicleId: string, driverId: string | null) => void;
  isAssigning: boolean;
  activeAssignment: ActiveDriverVehicleAssignment | null;
}) {
  const calculateStatus = (expiryDate: string): ComplianceStatus => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'warning';
    return 'valid';
  };

  const testStatus = calculateStatus(vehicle.test_expiry);
  const insuranceStatus = calculateStatus(vehicle.insurance_expiry);
  const worstStatus = testStatus === 'expired' || insuranceStatus === 'expired' 
    ? 'expired' 
    : (testStatus === 'warning' || insuranceStatus === 'warning' ? 'warning' : 'valid');
  const assignedDriver = activeAssignment?.driver_id
    ? drivers.find((driver) => driver.id === activeAssignment.driver_id) ?? null
    : null;
  const vehicleType = vehicle.vehicle_type_name || 'רכב';

  return (
    <div className="audi-premium-card group rounded-2xl transition-all duration-300 hover:scale-[1.01]">
      {/* Dynamic edge-lighting layer (intensifies on hover via CSS) */}
      <div className="dynamic-glow rounded-2xl" />

      {/* Top-right corner cyan edge light */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-500/20 blur-xl" />

      {/* Top light strip */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      {/* Top cyan glow line */}
      <div className="pointer-events-none absolute left-0 right-0 top-[1px] h-[2px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/6 via-transparent to-blue-800/8" />
      {/* Side glow accent */}
      <div className="pointer-events-none absolute -left-12 top-1/4 h-40 w-40 rounded-full bg-cyan-500/5 blur-3xl" />

      {/* Inner shadow overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_4px_24px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]" />

      <div className="relative space-y-3 p-4 md:p-5">

        {/* ── Row 1: vehicle type chip + status badge ── */}
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-cyan-400/40 bg-cyan-950/50 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]">{vehicleType}</span>
          <StatusBadge status={worstStatus} />
        </div>

        {/* ── Row 2: Model/year title + digital license plate ── */}
        <div className="flex flex-col items-center gap-2 py-1">
          {/* Manufacturer · Model · Year — luxury sub-title */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            {vehicle.manufacturer}&nbsp;{vehicle.model}&ensp;&middot;&ensp;{vehicle.year}
          </p>

          {/* Digital license-plate block — z-10 so it floats above card layers */}
          <div className="relative z-10" dir="ltr">
            {/* Pulsing outer glow ring */}
            <div className="pointer-events-none absolute -inset-1 animate-pulse rounded-xl opacity-40 blur-md bg-cyan-400/30" />
            {/* Plate itself with floating dark outer shadow */}
            <div className="neon-plate relative shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
              {/* Subtle scanline texture */}
              <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(34,211,238,0.02)_3px,rgba(34,211,238,0.02)_4px)]" />
              <span className="neon-plate-text relative font-mono text-5xl font-extrabold leading-none tracking-[0.3em] text-white">
                {vehicle.plate_number}
              </span>
            </div>
          </div>
        </div>

        {/* ── Row 3: 4 data-widget stats in 2×2 grid ── */}
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10">
          {/* Odometer */}
          <div className="data-widget flex flex-col items-center gap-0.5 border-b border-white/10 transition-colors hover:bg-cyan-500/5">
            <Gauge className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            <span className="text-[9px] font-medium text-white/40">מרחק נסיעה</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">מד אוץ</span>
            <span className="text-sm font-extrabold text-white tabular-nums" dir="ltr">{vehicle.current_odometer.toLocaleString()}</span>
          </div>
          {/* Next maintenance */}
          <div className="data-widget flex flex-col items-center gap-0.5 border-b border-white/10 transition-colors hover:bg-cyan-500/5">
            <CalendarClock className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_7px_rgba(34,211,238,0.8)]" />
            <span className="text-[9px] font-medium text-white/40">מצב תחזוקה</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">טיפול הבא</span>
            <span className="text-sm font-extrabold text-white tabular-nums">{vehicle.next_maintenance_km ? vehicle.next_maintenance_km.toLocaleString() : '—'}</span>
          </div>
          {/* Test expiry */}
          <div className="data-widget flex flex-col items-center gap-0.5 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_7px_rgba(34,211,238,0.8)]" />
              {testStatus === 'valid'
                ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                : <CircleAlert className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" />}
            </div>
            <span className="text-[9px] font-medium text-white/40">בדיקת רכב</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">תוקף טסט</span>
            <span className="text-xs font-extrabold text-white tabular-nums">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
          </div>
          {/* Insurance expiry */}
          <div className="data-widget flex flex-col items-center gap-0.5 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_7px_rgba(34,211,238,0.8)]" />
              {insuranceStatus === 'valid'
                ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                : <CircleAlert className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" />}
            </div>
            <span className="text-[9px] font-medium text-white/40">כיסוי ביטוחי</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400/80">תוקף ביטוח</span>
            <span className="text-xs font-extrabold text-white tabular-nums">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
          </div>
        </div>

        {/* ── Row 4: Assigned driver inner card ── */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.75)]" />
            <span className="text-sm font-semibold text-white">נהג משויך</span>
          </div>
          <span className="text-sm font-bold text-cyan-200 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]">{assignedDriver?.full_name ?? '—'}</span>
        </div>

        {/* ── Row 5: Assign driver select (managers only) ── */}
        {canEdit && (
          <Select
            value={assignedDriver?.id ?? '__none__'}
            onValueChange={(value) => onAssignDriver(vehicle.id, value === '__none__' ? null : value)}
            disabled={isAssigning}
          >
            <SelectTrigger className="border-cyan-400/35 bg-slate-900/60 text-cyan-100 focus:ring-cyan-400/40">
              <SelectValue placeholder="שייך נהג" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">ללא נהג משויך</SelectItem>
              {drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.full_name} ({driver.id_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

      </div>{/* ── end main content ── */}

      {/* ── Bottom action panel ── */}
      <div className="relative border-t border-white/8 bg-white/5 backdrop-blur-sm">
        {/* thin top separator shimmer */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="flex w-full divide-x divide-white/8 rtl:divide-x-reverse">
          <Link to={`/vehicles/${vehicle.id}#handover-history`} className="contents">
            <button className="glass-button group/btn flex flex-1 flex-col items-center gap-1.5 py-3.5 text-[10px] font-bold text-white active:scale-95">
              <ClipboardList className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-200 group-hover/btn:drop-shadow-[0_0_14px_rgba(34,211,238,1)]" />
              היסטוריה
            </button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#tax-data`} className="contents">
            <button className="glass-button group/btn flex flex-1 flex-col items-center gap-1.5 py-3.5 text-[10px] font-bold text-white active:scale-95">
              <Zap className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-200 group-hover/btn:drop-shadow-[0_0_14px_rgba(34,211,238,1)]" />
              נתוני מס
            </button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#overview`} className="contents">
            <button className="glass-button group/btn flex flex-1 flex-col items-center gap-1.5 py-3.5 text-[10px] font-bold text-white active:scale-95">
              <Eye className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-200 group-hover/btn:drop-shadow-[0_0_14px_rgba(34,211,238,1)]" />
              צפייה
            </button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`} className="contents">
            <button className="glass-button group/btn flex flex-1 flex-col items-center gap-1.5 py-3.5 text-[10px] font-bold text-white active:scale-95">
              <FileText className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-200 group-hover/btn:drop-shadow-[0_0_14px_rgba(34,211,238,1)]" />
              מסמכים
            </button>
          </Link>
        </div>

        {/* Bottom glow line */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/65 to-transparent" />
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading, isError, error, refetch } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const assignDriver = useAssignDriverToVehicle();
  const { isManager, user } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const errorMessage = getErrorMessage(error);

  const filteredVehicles = vehicles?.filter(v => 
    v.plate_number.includes(search) ||
    v.manufacturer.includes(search) ||
    v.model.includes(search)
  );

  const handleAssignDriver = (vehicleId: string, driverId: string | null) => {
    assignDriver.mutate({
      vehicleId,
      driverId,
      assignedBy: user?.id ?? null,
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('vehicles.title')}</h1>
          <p className="text-blue-300/60 mt-1">{t('vehicles.subtitle')}</p>
        </div>
        <Link to="/vehicles/add">
          <Button className="bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.45)]">
            <Plus className="h-4 w-4 mr-2" />
            {t('vehicles.addVehicle')}
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400/60" />
        <Input
          placeholder={t('vehicles.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-blue-500/30 bg-blue-950/40 pr-10 text-blue-100 placeholder:text-blue-400/40 focus-visible:ring-blue-500/40"
        />
      </div>

      {/* Content */}
      <div>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>שגיאה בטעינת הרכבים</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                נסה שוב
              </Button>
            </AlertDescription>
          </Alert>
        ) : filteredVehicles?.length === 0 ? (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 py-12 text-center">
            <Car className="h-12 w-12 mx-auto text-blue-400/40 mb-4" />
            <p className="text-blue-300/60">{t('vehicles.noVehicles')}</p>
            <Link to="/vehicles/add">
              <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4 mr-2" />
                {t('vehicles.addNewVehicle')}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVehicles?.map(vehicle => (
              <VehicleCard
                key={vehicle.id} 
                vehicle={vehicle} 
                canEdit={isManager}
                drivers={drivers ?? []}
                onAssignDriver={handleAssignDriver}
                isAssigning={assignDriver.isPending}
                activeAssignment={(activeAssignments ?? []).find((assignment) => assignment.vehicle_id === vehicle.id) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
