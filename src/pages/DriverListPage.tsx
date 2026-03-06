import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDrivers, useDeleteDriver } from '@/hooks/useDrivers';
import {
  useActiveDriverVehicleAssignments,
  type ActiveDriverVehicleAssignment,
} from '@/hooks/useVehicles';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Plus,
  Search,
  User,
  Trash2,
  Edit,
  Car,
  Phone,
  Mail
} from 'lucide-react';
import type { DriverSummary, ComplianceStatus } from '@/types/fleet';

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
  driverActiveAssignments,
}: {
  driver: DriverSummary;
  onDelete: () => void;
  canEdit: boolean;
  driverActiveAssignments: ActiveDriverVehicleAssignment[];
}) {
  const today = new Date();
  const expiry = new Date(driver.license_expiry);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const licenseStatus: ComplianceStatus = diffDays < 0 ? 'expired' : diffDays <= 30 ? 'warning' : 'valid';

  const assignedVehicles = driverActiveAssignments
    .map((a) => a.vehicle)
    .filter((v): v is NonNullable<ActiveDriverVehicleAssignment['vehicle']> => !!v);

  return (
    <Link to={`/drivers/${driver.id}`} className="block group">
      <Card className="card-hover border border-border hover:border-primary/40 transition-all cursor-pointer">
        <CardContent className="p-0">
          <div className="flex items-stretch">
            {/* RIGHT — driver info */}
            <div className="flex flex-1 items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-md ${
                  licenseStatus === 'expired' ? 'bg-red-600' : licenseStatus === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
                }`}>
                  {driver.full_name.trim().slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{driver.full_name}</h3>
                  <p className="text-sm text-muted-foreground">ת.ז. {driver.id_number}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                    {driver.phone && (
                      <span className="text-sm text-muted-foreground" dir="ltr">{driver.phone}</span>
                    )}
                    {driver.email && (
                      <span className="text-sm text-muted-foreground" dir="ltr">{driver.email}</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      רישיון: {new Date(driver.license_expiry).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={licenseStatus} />
                {canEdit && (
                  <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
                    <Link to={`/drivers/${driver.id}/edit`} onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* LEFT — vehicle */}
            <div className="flex flex-col justify-center gap-2 px-5 py-4 min-w-[220px] border-l border-border bg-muted/20">
              <p className="text-xs text-muted-foreground mb-0.5">רכב משויך</p>
              {assignedVehicles.length > 0 ? (
                assignedVehicles.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 text-primary px-3 py-2 text-sm font-semibold">
                    <Car className="h-4 w-4 shrink-0" />
                    <span>{v.manufacturer} {v.model}</span>
                    <span className="text-xs font-normal text-muted-foreground">({v.plate_number})</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Car className="h-4 w-4" />
                  <span>אין רכב משויך</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DriverListPage() {
  const { data: drivers, isLoading, isError, error, refetch } = useDrivers();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const deleteDriver = useDeleteDriver();
  const { isManager } = useAuth();
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

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
        <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t('drivers.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('drivers.subtitle')}</p>
        </div>
        <Link to="/drivers/add" className="shrink-0">
          <Button size="sm">
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
                driverActiveAssignments={(activeAssignments ?? []).filter((assignment) => assignment.driver_id === driver.id)}
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
