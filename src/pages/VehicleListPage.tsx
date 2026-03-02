import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVehicles, useDeleteVehicle, useAssignDriverToVehicle } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useHandoverHistory, buildHandoverRecordUrl, type HandoverHistoryItem } from '@/hooks/useHandovers';
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
  Car,
  Trash2,
  Edit,
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
    valid: { label: 'תקין', className: 'status-valid' },
    warning: { label: 'אזהרה', className: 'status-warning' },
    expired: { label: 'פג תוקף', className: 'status-expired' }
  };

  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function VehicleCard({ vehicle, onDelete, canEdit, drivers, onAssignDriver, isAssigning }: { 
  vehicle: Vehicle; 
  onDelete: () => void;
  canEdit: boolean;
  drivers: DriverSummary[];
  onAssignDriver: (vehicleId: string, driverId: string | null) => void;
  isAssigning: boolean;
  handoverHistory: HandoverHistoryItem[];
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
  const assignedDriver = drivers.find((driver) => driver.id === vehicle.assigned_driver_id) ?? null;
  const recentHandovers = handoverHistory.slice(0, 3);

  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{vehicle.manufacturer} {vehicle.model}</h3>
              <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
            </div>
          </div>
          <StatusBadge status={worstStatus} />
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-muted-foreground">נהג משויך:</span>
            <span>{assignedDriver?.full_name ?? 'לא משויך'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">שנה:</span> {vehicle.year}
          </div>
          <div>
            <span className="text-muted-foreground">ק"מ:</span> {vehicle.current_odometer.toLocaleString()}
          </div>
          <div>
            <span className="text-muted-foreground">טסט:</span> {new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}
          </div>
          <div>
            <span className="text-muted-foreground">ביטוח:</span> {new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {canEdit && (
            <div>
              <Select
                value={vehicle.assigned_driver_id ?? '__none__'}
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
                      <span className="text-muted-foreground">{new Date(handover.handover_date).toLocaleDateString('he-IL')}</span>
                      <span>{handover.driver_label}</span>
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
          <Link to={`/vehicles/${vehicle.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1">
              <Eye className="h-4 w-4" />
              צפייה
            </Button>
          </Link>
          {canEdit && (
            <>
              <Link to={`/vehicles/${vehicle.id}/edit`}>
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

export default function VehicleListPage() {
  const { data: vehicles, isLoading, isError, error, refetch } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: handoverHistory } = useHandoverHistory();
  const deleteVehicle = useDeleteVehicle();
  const assignDriver = useAssignDriverToVehicle();
  const { isManager, user } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
                onDelete={() => setDeleteId(vehicle.id)}
                canEdit={isManager}
                drivers={drivers ?? []}
                onAssignDriver={handleAssignDriver}
                isAssigning={assignDriver.isPending}
                handoverHistory={(handoverHistory ?? []).filter((handover) => handover.vehicle_id === vehicle.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vehicles.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('vehicles.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteVehicle.mutate(deleteId);
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
