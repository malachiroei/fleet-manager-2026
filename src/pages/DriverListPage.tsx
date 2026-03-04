import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDrivers, useDeleteDriver } from '@/hooks/useDrivers';
import {
  useVehicles,
  useAssignDriverToVehicle,
  useActiveDriverVehicleAssignments,
  type ActiveDriverVehicleAssignment,
} from '@/hooks/useVehicles';
import { useHandoverHistory, buildHandoverRecordUrl, type HandoverHistoryItem } from '@/hooks/useHandovers';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowRight,
  Plus,
  Search,
  User,
  Trash2,
  Edit,
  Eye,
  Phone,
  Mail
} from 'lucide-react';
import type { Driver, DriverSummary, Vehicle, ComplianceStatus } from '@/types/fleet';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.length > 0
      ? message
      : 'אירעה שגיאה לא צפויה בעת שליפת הנהגים.';
  }
  return 'אירעה שגיאה לא צפויה בעת שליפת הנהגים.';
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const config = {
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };

  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function DriverCard({
  driver,
  onDelete,
  canEdit,
  vehicles,
  onAssignVehicle,
  isAssigning,
  handoverHistory,
  driverActiveAssignments,
  allActiveAssignments,
}: {
  driver: DriverSummary;
  onDelete: () => void;
  canEdit: boolean;
  vehicles: Vehicle[];
  onAssignVehicle: (driverId: string, vehicleId: string | null) => void;
  isAssigning: boolean;
  handoverHistory: HandoverHistoryItem[];
  driverActiveAssignments: ActiveDriverVehicleAssignment[];
  allActiveAssignments: ActiveDriverVehicleAssignment[];
}) {
  const calculateStatus = (expiryDate: string): ComplianceStatus => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'warning';
    return 'valid';
  };

  const licenseStatus = calculateStatus(driver.license_expiry);
  const assignedVehicles = driverActiveAssignments
    .map((assignment) => assignment.vehicle)
    .filter((vehicle): vehicle is NonNullable<ActiveDriverVehicleAssignment['vehicle']> => !!vehicle);
  const assignedVehicleIds = new Set(allActiveAssignments.map((assignment) => assignment.vehicle_id));
  const assignableVehicles = vehicles.filter(
    (vehicle) => !assignedVehicleIds.has(vehicle.id) || assignedVehicles.some((assignedVehicle) => assignedVehicle.id === vehicle.id)
  );
  const selectedVehicleValue = assignedVehicles.length > 1
    ? '__multiple__'
    : (assignedVehicles[0]?.id ?? '__none__');
  const recentHandovers = handoverHistory.slice(0, 3);

  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <User className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold">{driver.full_name}</h3>
              <p className="text-sm text-muted-foreground">ת.ז. {driver.id_number}</p>
              <div className="text-sm mt-1">
                <span className="text-muted-foreground">רכבים משויכים:</span>
                {assignedVehicles.length === 0 ? (
                  <span className="mr-1">לא משויך</span>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {assignedVehicles.map((vehicle) => (
                      <li key={vehicle.id}>{vehicle.manufacturer} {vehicle.model} ({vehicle.plate_number})</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <StatusBadge status={licenseStatus} />
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">רישיון:</span>
            <span>{new Date(driver.license_expiry).toLocaleDateString('he-IL')}</span>
          </div>
          {driver.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span dir="ltr">{driver.phone}</span>
            </div>
          )}
          {driver.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span dir="ltr" className="text-xs">{driver.email}</span>
            </div>
          )}
          {canEdit && (
            <div>
              <Select
                value={selectedVehicleValue}
                onValueChange={(value) => {
                  if (value === '__multiple__') return;
                  onAssignVehicle(driver.id, value === '__none__' ? null : value);
                }}
                disabled={isAssigning}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר רכב" />
                </SelectTrigger>
                <SelectContent>
                  {selectedVehicleValue === '__multiple__' && (
                    <SelectItem value="__multiple__" disabled>משויכים מספר רכבים</SelectItem>
                  )}
                  <SelectItem value="__none__">ללא רכב משויך</SelectItem>
                  {assignableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.manufacturer} {vehicle.model} ({vehicle.plate_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-3 space-y-2">
          <p className="text-sm font-semibold">היסטוריית מסירות</p>
          {recentHandovers.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין נתוני מסירה/החזרה</p>
          ) : (
            <div className="space-y-2">
              {recentHandovers.map((handover) => {
                const formUrl = handover.form_url || buildHandoverRecordUrl(handover.vehicle_id, handover.id);
                return (
                  <div key={handover.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{new Date(handover.handover_date).toLocaleDateString('he-IL')} {new Date(handover.handover_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>{handover.vehicle_label}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <a href={formUrl} target="_blank" rel="noopener noreferrer">View Form</a>
                      </Button>
                      {handover.photo_urls.length > 0 && (
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          <a href={handover.photo_urls[0]} target="_blank" rel="noopener noreferrer">
                            תמונות ({handover.photo_urls.length})
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Link to={`/drivers/${driver.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1">
              <Eye className="h-4 w-4" />
              צפייה
            </Button>
          </Link>
          {canEdit && (
            <>
              <Link to={`/drivers/${driver.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DriverListPage() {
  const { data: drivers, isLoading, isError, error, refetch } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const { data: handoverHistory } = useHandoverHistory();
  const deleteDriver = useDeleteDriver();
  const assignDriver = useAssignDriverToVehicle();
  const { isManager, user } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const errorMessage = getErrorMessage(error);

  const filteredDrivers = (drivers ?? []).filter(d =>
    d.full_name.includes(search) ||
    d.id_number.includes(search) ||
    d.email?.includes(search) ||
    d.phone?.includes(search)
  );

  const handleAssignVehicle = (driverId: string, vehicleId: string | null) => {
    if (vehicleId) {
      assignDriver.mutate({
        vehicleId,
        driverId,
        assignedBy: user?.id ?? null,
      });
      return;
    }

    const currentAssignment = (activeAssignments ?? []).find((assignment) => assignment.driver_id === driverId);
    if (!currentAssignment) return;

    assignDriver.mutate({
      vehicleId: currentAssignment.vehicle_id,
      driverId: null,
      assignedBy: user?.id ?? null,
    });
  };

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('drivers.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('drivers.subtitle')}</p>
        </div>
        <Link to="/drivers/add">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('drivers.addDriver')}
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('drivers.searchPlaceholder')}
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
            <AlertTitle>שגיאה בטעינת הנהגים</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                נסה שוב
              </Button>
            </AlertDescription>
          </Alert>
        ) : filteredDrivers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('drivers.noDrivers')}</p>
              <Link to="/drivers/add">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('drivers.addNewDriver')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredDrivers.map(driver => (
              <DriverCard
                key={driver.id}
                driver={driver}
                onDelete={() => setDeleteId(driver.id)}
                canEdit={isManager}
                vehicles={vehicles ?? []}
                onAssignVehicle={handleAssignVehicle}
                isAssigning={assignDriver.isPending}
                handoverHistory={(handoverHistory ?? []).filter((handover) => handover.driver_id === driver.id)}
                driverActiveAssignments={(activeAssignments ?? []).filter((assignment) => assignment.driver_id === driver.id)}
                allActiveAssignments={activeAssignments ?? []}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('drivers.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('drivers.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteDriver.mutate(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
