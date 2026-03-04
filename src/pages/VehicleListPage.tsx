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
    <div className="audi-card group transition-all duration-300 hover:scale-[1.01] relative overflow-visible">
      {/* Dynamic edge-lighting layer (intensifies on hover via CSS) */}
      <div className="dynamic-glow rounded-[28px]" />
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

      {/* Vehicle image (Audi style) */}
      {vehicle.image_url && (
        <div className="vehicle-image-container mb-2">
          <img src={vehicle.image_url} alt={`${vehicle.manufacturer} ${vehicle.model}`} className="vehicle-image" />
        </div>
      )}

      <div className="relative space-y-3 p-8 pt-2">
        {/* Title row */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="vehicle-title">
              {vehicle.manufacturer} {vehicle.model}
              <span className="vehicle-year">{vehicle.year}</span>
            </p>
            <div className="vehicle-title-underline" />
          </div>
          <StatusBadge status={worstStatus} />
        </div>

        {/* License plate Hero */}
        <div className="flex flex-col items-center gap-2 py-1">
          <div className="relative z-10" dir="ltr">
            <div className="pointer-events-none absolute -inset-2 animate-pulse rounded-2xl opacity-30 blur-lg bg-cyan-400/20" />
            <div className="relative rounded-2xl bg-black/40 px-10 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.9)]">
              <span
                className="neon-title font-mono text-6xl leading-none"
                style={{ letterSpacing: '0.5em' }}
              >
                {vehicle.plate_number}
              </span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-6 mt-2">
          {/* Odometer */}
          <div className="glass audi-stat p-8 flex flex-col items-center gap-2 transition-colors hover:bg-cyan-500/5">
            <Gauge className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.9)] mb-1" />
            <span className="white-data text-2xl font-extrabold tabular-nums" dir="ltr">{vehicle.current_odometer.toLocaleString()}</span>
            <span className="data-label-glow">קילומטראז׳</span>
          </div>
          {/* Next maintenance */}
          <div className="glass audi-stat p-8 flex flex-col items-center gap-2 transition-colors hover:bg-cyan-500/5">
            <CalendarClock className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] mb-1" />
            <span className="white-data text-2xl font-extrabold">{vehicle.next_maintenance_km ? vehicle.next_maintenance_km.toLocaleString() : '—'}</span>
            <span className="data-label-glow">טיפול הבא</span>
          </div>
          {/* Test expiry */}
          <div className="glass audi-stat p-8 flex flex-col items-center gap-2 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              {testStatus === 'valid'
                ? <CircleCheck className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                : <CircleAlert className="h-5 w-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />}
            </div>
            <span className="white-data text-2xl font-extrabold">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">תוקף טסט</span>
          </div>
          {/* Insurance expiry */}
          <div className="glass audi-stat p-8 flex flex-col items-center gap-2 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              {insuranceStatus === 'valid'
                ? <CircleCheck className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                : <CircleAlert className="h-5 w-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />}
            </div>
            <span className="white-data text-2xl font-extrabold">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">תוקף ביטוח</span>
          </div>
        </div>

        {/* Driver row (Audi style) */}
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm mt-4">
          <UserRound className="h-6 w-6 shrink-0 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-white/60">נהג משויך</span>
            <span className="text-white font-extrabold text-lg tracking-wide">{assignedDriver?.full_name ?? '—'}</span>
          </div>
        </div>

        {/* Assign driver select (managers only) */}
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
      </div>

      {/* ── Bottom action panel ── */}
      <div className="relative border-t border-white/8 bg-white/5 backdrop-blur-sm">
        {/* thin top separator shimmer */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="flex w-full">
          {/* History */}
          <Link to={`/vehicles/${vehicle.id}#handover-history`} className="contents">
            <button className="glass-button group/btn relative flex flex-1 flex-col items-center gap-1.5 transition-all duration-300 active:scale-95">
              <ClipboardList className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-300 group-hover/btn:drop-shadow-[0_0_16px_rgba(34,211,238,1)]" />
              {/* Icon reflection */}
              <ClipboardList className="pointer-events-none absolute top-[calc(50%-4px)] h-4 w-4 scale-y-[-1] text-cyan-400 opacity-[0.15] blur-[1px]" />
              היסטוריה
            </button>
          </Link>
          {/* Tax data */}
          <Link to={`/vehicles/${vehicle.id}#tax-data`} className="contents">
            <button className="glass-button group/btn relative flex flex-1 flex-col items-center gap-1.5 transition-all duration-300 active:scale-95">
              <Zap className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-300 group-hover/btn:drop-shadow-[0_0_16px_rgba(34,211,238,1)]" />
              {/* Icon reflection */}
              <Zap className="pointer-events-none absolute top-[calc(50%-4px)] h-4 w-4 scale-y-[-1] text-cyan-400 opacity-[0.15] blur-[1px]" />
              נתוני מס
            </button>
          </Link>
          {/* Overview */}
          <Link to={`/vehicles/${vehicle.id}#overview`} className="contents">
            <button className="glass-button group/btn relative flex flex-1 flex-col items-center gap-1.5 transition-all duration-300 active:scale-95">
              <Eye className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-300 group-hover/btn:drop-shadow-[0_0_16px_rgba(34,211,238,1)]" />
              {/* Icon reflection */}
              <Eye className="pointer-events-none absolute top-[calc(50%-4px)] h-4 w-4 scale-y-[-1] text-cyan-400 opacity-[0.15] blur-[1px]" />
              צפייה
            </button>
          </Link>
          {/* Documents */}
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`} className="contents">
            <button className="glass-button group/btn relative flex flex-1 flex-col items-center gap-1.5 transition-all duration-300 active:scale-95">
              <FileText className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_9px_rgba(34,211,238,1)] transition-all duration-300 group-hover/btn:drop-shadow-[0_0_16px_rgba(34,211,238,1)]" />
              {/* Icon reflection */}
              <FileText className="pointer-events-none absolute top-[calc(50%-4px)] h-4 w-4 scale-y-[-1] text-cyan-400 opacity-[0.15] blur-[1px]" />
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
    <div className="relative min-h-screen overflow-hidden bg-[#050816]">
      {/* Radial cyan glow — the blue atmosphere behind everything */}
      <div className="absolute left-1/2 top-[-200px] h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[180px]" />
      {/* Subtle radial grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,255,0.05)_0%,transparent_60%)]" />

      {/* Page content — sits above all background layers */}
      <div className="relative z-10 px-4 py-6 space-y-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
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
      </div>{/* end z-10 content */}
    </div>
  );
}
