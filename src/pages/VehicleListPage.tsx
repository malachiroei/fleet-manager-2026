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
    <div className="group relative overflow-hidden rounded-2xl border border-cyan-400/50 bg-[#020617] shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_32px_rgba(6,182,212,0.18),0_8px_48px_rgba(15,23,42,0.8)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/80 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_0_48px_rgba(6,182,212,0.35),0_16px_64px_rgba(15,23,42,0.9)]">
      {/* Top glow line */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/8 via-transparent to-blue-700/6" />

      <div className="relative space-y-4 p-4 md:p-5">

        {/* ── Row 1: vehicle type chip + status badge ── */}
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-cyan-400/40 bg-cyan-950/50 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]">{vehicleType}</span>
          <StatusBadge status={worstStatus} />
        </div>

        {/* ── Row 2: Plate number header + model line ── */}
        <div className="rounded-xl border border-cyan-400/35 bg-slate-900/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(34,211,238,0.12)]">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400/70">מספר רישוי</p>
          <p className="text-[2.4rem] font-extrabold leading-none tracking-[0.2em] text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]" dir="ltr">{vehicle.plate_number}</p>
          <p className="mt-1.5 text-xs font-semibold text-cyan-200/60">{vehicle.manufacturer} {vehicle.model} &middot; {vehicle.year}</p>
        </div>

        {/* ── Row 3: Clean vertical stats list ── */}
        <div className="divide-y divide-cyan-500/15 rounded-xl border border-cyan-400/25 bg-slate-900/50 overflow-hidden shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]">
          {/* Odometer */}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <Gauge className="h-4 w-4 shrink-0 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]" />
              <span className="text-sm font-medium text-cyan-200/80">מד אוץ</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums" dir="ltr">{vehicle.current_odometer.toLocaleString()} ק&quot;מ</span>
          </div>
          {/* Next maintenance */}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-4 w-4 shrink-0 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]" />
              <span className="text-sm font-medium text-cyan-200/80">טיפול הבא</span>
            </div>
            <span className="text-sm font-bold text-white tabular-nums">{vehicle.next_maintenance_km ? `${vehicle.next_maintenance_km.toLocaleString()} ק"מ` : '—'}</span>
          </div>
          {/* Test */}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 shrink-0 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]" />
              <span className="text-sm font-medium text-cyan-200/80">תוקף טסט</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tabular-nums">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
              {testStatus === 'valid'
                ? <CircleCheck className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.7)]" />
                : <CircleAlert className="h-4 w-4 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.7)]" />}
            </div>
          </div>
          {/* Insurance */}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 shrink-0 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]" />
              <span className="text-sm font-medium text-cyan-200/80">תוקף ביטוח</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tabular-nums">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
              {insuranceStatus === 'valid'
                ? <CircleCheck className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.7)]" />
                : <CircleAlert className="h-4 w-4 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.7)]" />}
            </div>
          </div>
          {/* Driver */}
          <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <UserRound className="h-4 w-4 shrink-0 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.7)]" />
              <span className="text-sm font-medium text-cyan-200/80">נהג משויך</span>
            </div>
            <span className="text-sm font-bold text-white">{assignedDriver?.full_name ?? '—'}</span>
          </div>
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

        {/* ── Row 6: 4 glass action buttons ── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link to={`/vehicles/${vehicle.id}#handover-history`}>
            <Button variant="ghost" size="sm" className="w-full gap-1.5 rounded-xl border border-white/10 bg-white/5 text-cyan-200 backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] active:scale-95">
              <ClipboardList className="h-4 w-4" />
              היסטוריה
            </Button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#tax-data`}>
            <Button variant="ghost" size="sm" className="w-full gap-1.5 rounded-xl border border-white/10 bg-white/5 text-cyan-200 backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] active:scale-95">
              <Zap className="h-4 w-4" />
              נתוני מס
            </Button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#overview`}>
            <Button variant="ghost" size="sm" className="w-full gap-1.5 rounded-xl border border-white/10 bg-white/5 text-cyan-200 backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] active:scale-95">
              <Eye className="h-4 w-4" />
              צפייה
            </Button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`}>
            <Button variant="ghost" size="sm" className="w-full gap-1.5 rounded-xl border border-white/10 bg-white/5 text-cyan-200 backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] active:scale-95">
              <FileText className="h-4 w-4" />
              מסמכים
            </Button>
          </Link>
        </div>

      </div>
      {/* Bottom glow line */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
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
