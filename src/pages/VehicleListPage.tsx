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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  CircleAlert
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
    valid: { label: 'תקין', className: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' },
    warning: { label: 'אזהרה', className: 'border-amber-400/40 bg-amber-500/15 text-amber-200' },
    expired: { label: 'פג תוקף', className: 'border-rose-400/40 bg-rose-500/15 text-rose-200' }
  };

  const { label, className } = config[status];
  return <Badge className={`border ${className}`}>{label}</Badge>;
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

  const testStatusLabel = testStatus === 'valid' ? 'תקין' : testStatus === 'warning' ? 'אזהרה' : 'פג תוקף';
  const insuranceStatusLabel = insuranceStatus === 'valid' ? 'תקין' : insuranceStatus === 'warning' ? 'אזהרה' : 'פג תוקף';

  return (
    <Card className="relative overflow-hidden border border-cyan-400/30 bg-slate-950/80 backdrop-blur-md shadow-[0_0_30px_rgba(34,211,238,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
      <CardContent className="relative p-4 md:p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">{vehicle.manufacturer} {vehicle.model} {vehicle.year}</h3>
              <div className="inline-flex items-center gap-2 rounded-md border border-cyan-400/40 bg-slate-900/70 px-2 py-1 text-sm text-cyan-100">
                <span className="font-semibold">מספר רישוי:</span>
                <span dir="ltr">{vehicle.plate_number}</span>
              </div>
              <p className="text-xs text-cyan-100/90">סוג: {vehicleType}</p>
            </div>
            <StatusBadge status={worstStatus} />
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-cyan-500/30 bg-slate-900/70 p-3 text-slate-100 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1.5">
              <Gauge className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="text-sm text-slate-100">מד אוץ: {vehicle.current_odometer.toLocaleString()} ק"מ</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1.5">
              <CalendarClock className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="text-sm text-slate-100">טיפול הבא: {vehicle.next_maintenance_km ? `${vehicle.next_maintenance_km.toLocaleString()} ק"מ` : 'לא הוגדר'}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1.5">
              <Shield className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="text-sm text-slate-100">טסט: {new Date(vehicle.test_expiry).toLocaleDateString('he-IL')} · {testStatusLabel}</span>
              {testStatus === 'valid' ? <CircleCheck className="h-4 w-4 text-emerald-400" /> : <CircleAlert className="h-4 w-4 text-amber-400" />}
            </div>
            <div className="flex items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1.5">
              <Shield className="h-4 w-4 shrink-0 text-cyan-300" />
              <span className="text-sm text-slate-100">ביטוח: {new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')} · {insuranceStatusLabel}</span>
              {insuranceStatus === 'valid' ? <CircleCheck className="h-4 w-4 text-emerald-400" /> : <CircleAlert className="h-4 w-4 text-amber-400" />}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-slate-900/70 p-3 text-slate-100">
            <UserRound className="h-4 w-4 shrink-0 text-cyan-300" />
            <p className="text-sm text-slate-100">נהג משויך: {assignedDriver?.full_name ?? 'אין נהג משויך'}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {canEdit && (
            <div>
              <Select
                value={assignedDriver?.id ?? '__none__'}
                onValueChange={(value) => onAssignDriver(vehicle.id, value === '__none__' ? null : value)}
                disabled={isAssigning}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר נהג" />
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
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link to={`/vehicles/${vehicle.id}#handover-history`}>
            <Button variant="outline" size="sm" className="w-full gap-1 border-cyan-400/30 bg-slate-900/55 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:bg-cyan-500/15 hover:text-cyan-50">
              <ClipboardList className="h-4 w-4" />
              היסטוריית מסירות
            </Button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#tax-data`}>
            <Button variant="outline" size="sm" className="w-full gap-1 border-cyan-400/30 bg-slate-900/55 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:bg-cyan-500/15 hover:text-cyan-50">
              <Zap className="h-4 w-4" />
              נתוני מס
            </Button>
          </Link>
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`}>
            <Button variant="outline" size="sm" className="w-full gap-1 border-cyan-400/30 bg-slate-900/55 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:bg-cyan-500/15 hover:text-cyan-50">
              <FileText className="h-4 w-4" />
              מסמכים
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
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
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('vehicles.title')}</h1>
          <p className="text-slate-500 mt-1">{t('vehicles.subtitle')}</p>
        </div>
        <Link to="/vehicles/add">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('vehicles.addVehicle')}
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('vehicles.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10"
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
          <Card>
            <CardContent className="py-8 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('vehicles.noVehicles')}</p>
              <Link to="/vehicles/add">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('vehicles.addNewVehicle')}
                </Button>
              </Link>
            </CardContent>
          </Card>
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
