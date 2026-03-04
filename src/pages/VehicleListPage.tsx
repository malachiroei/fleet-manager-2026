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
    <div className="audi-card audi-premium-card">
      <div className="p-8 pt-6">
        <div className="vehicle-title neon-title mb-2">
          {vehicle.manufacturer} {vehicle.model}
        </div>
        <div className="text-6xl font-black neon-plate-text tracking-widest mb-6">
          {vehicle.plate_number}
        </div>
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="audi-stat flex flex-col items-center justify-center p-6">
            <span className="white-data text-2xl">{vehicle.current_odometer.toLocaleString()}</span>
            <span className="data-label-glow">קילומטראז׳</span>
          </div>
          <div className="audi-stat flex flex-col items-center justify-center p-6">
            <span className="white-data text-2xl">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">טסט</span>
          </div>
          <div className="audi-stat flex flex-col items-center justify-center p-6">
            <span className="white-data text-2xl">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">ביטוח</span>
          </div>
        </div>
        <div className="flex w-full gap-4 mt-4">
          <Link to={`/vehicles/${vehicle.id}#handover-history`} className="flex-1">
            <button className="glass-button w-full py-4 text-lg font-bold">היסטוריה</button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#tax-data`} className="flex-1">
            <button className="glass-button w-full py-4 text-lg font-bold">נתוני מס</button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#overview`} className="flex-1">
            <button className="glass-button w-full py-4 text-lg font-bold">צפייה</button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`} className="flex-1">
            <button className="glass-button w-full py-4 text-lg font-bold">מסמכים</button>
          </Link>
        </div>
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
