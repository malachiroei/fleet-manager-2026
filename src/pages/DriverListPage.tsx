import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDrivers, useDeleteDriver } from '@/hooks/useDrivers';
import {
  useActiveDriverVehicleAssignments,
  type ActiveDriverVehicleAssignment,
} from '@/hooks/useVehicles';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, Search, User, Filter, FolderOpen } from 'lucide-react';
import { DriverCard, licenseExpiresWithin30Days } from '@/components/DriverCard';
import DriverFolders from '@/components/DriverFolders';
import { useDriver } from '@/hooks/useDrivers';

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

export default function DriverListPage() {
  const { data: drivers, isLoading, isError, error, refetch } = useDrivers();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const deleteDriver = useDeleteDriver();
  const { isManager } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterExpiredLicense, setFilterExpiredLicense] = useState(false);
  const [filterNoVehicle, setFilterNoVehicle] = useState(false);
  const [filterNoSafetyTraining, setFilterNoSafetyTraining] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const foldersDriverId = searchParams.get('folders') || '';
  const { data: foldersDriver } = useDriver(foldersDriverId);
  const foldersPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (foldersDriver && foldersPanelRef.current) {
      foldersPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [foldersDriver?.id]);
  const errorMessage = getErrorMessage(error);

  const assignmentsByDriver = useMemo(() => {
    const map = new Map<string, ActiveDriverVehicleAssignment[]>();
    for (const a of activeAssignments ?? []) {
      if (!a.driver_id) continue;
      const list = map.get(a.driver_id) ?? [];
      list.push(a);
      map.set(a.driver_id, list);
    }
    return map;
  }, [activeAssignments]);

  const filteredDrivers = useMemo(() => {
    let list = drivers ?? [];
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((d) => {
        const name = String(d.full_name ?? '');
        const idn = String(d.id_number ?? '');
        return (
          name.includes(q) ||
          idn.includes(q) ||
          (d.email && d.email.includes(q)) ||
          (d.phone && d.phone.includes(q))
        );
      });
    }
    if (filterExpiredLicense) {
      list = list.filter((d) => licenseExpiresWithin30Days(d.license_expiry));
    }
    if (filterNoVehicle) {
      list = list.filter((d) => {
        const assigns = assignmentsByDriver.get(d.id) ?? [];
        const hasVehicle = assigns.some((a) => a.vehicle != null);
        return !hasVehicle;
      });
    }
    if (filterNoSafetyTraining) {
      list = list.filter(
        (d) => !d.safety_training_date || String(d.safety_training_date).trim() === ''
      );
    }
    return list;
  }, [
    drivers,
    search,
    filterExpiredLicense,
    filterNoVehicle,
    filterNoSafetyTraining,
    assignmentsByDriver,
  ]);

  const toggleBtn = (active: boolean) =>
    active
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted';

  return (
    <div className="container min-h-[50vh] space-y-5 bg-[#020617] py-4 text-foreground sm:space-y-6 sm:py-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">{t('drivers.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('drivers.subtitle')}</p>
        </div>
        <Link to="/drivers/add" className="w-full shrink-0 sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t('drivers.addDriver')}
          </Button>
        </Link>
      </div>

      <div className="relative w-full max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('drivers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* סינון מתקדם */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/40 p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>סינון מתקדם</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={toggleBtn(filterExpiredLicense)}
            onClick={() => setFilterExpiredLicense((v) => !v)}
          >
            נהגים עם רישיון פג תוקף
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={toggleBtn(filterNoVehicle)}
            onClick={() => setFilterNoVehicle((v) => !v)}
          >
            נהגים ללא שיוך רכב
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={toggleBtn(filterNoSafetyTraining)}
            onClick={() => setFilterNoSafetyTraining((v) => !v)}
          >
            נהגים ללא הדרכת בטיחות
          </Button>
        </div>
      </div>

      {/* תיקיות — מוצגות מעל הרשימה כשבוחרים נהג, כדי שלא יישארו מתחת למסך */}
      {foldersDriverId && !foldersDriver && (
        <Alert className="mb-4">
          <AlertTitle>טוען תיקיות…</AlertTitle>
          <AlertDescription>
            אם זה נמשך,{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => { searchParams.delete('folders'); setSearchParams(searchParams); }}>
              נקה בחירה
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {foldersDriver && (
        <div id="driver-folders-panel" ref={foldersPanelRef} className="mb-6 scroll-mt-24 rounded-xl border border-white/10 bg-slate-900/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              תיקיות עבור: <strong className="font-semibold text-slate-200">{foldersDriver.full_name}</strong>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                searchParams.delete('folders');
                setSearchParams(searchParams);
              }}
            >
              סגור תיקיות
            </Button>
          </div>
          <DriverFolders driver={foldersDriver} collapsible={false} defaultOpen />
        </div>
      )}

      <div>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
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
              <User className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{t('drivers.noDrivers')}</p>
              <Link to="/drivers/add">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('drivers.addNewDriver')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {foldersDriverId && !foldersDriver && !isLoading && (
              <Alert variant="destructive">
                <AlertTitle>נהג לא נמצא</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>לא נטען נהג עבור התיקיות. </span>
                  <Button variant="link" className="h-auto p-0" onClick={() => { searchParams.delete('folders'); setSearchParams(searchParams); }}>
                    נקה בחירה
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {filteredDrivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                onDelete={() => setDeleteId(driver.id)}
                canEdit={isManager}
                driverActiveAssignments={assignmentsByDriver.get(driver.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>

      {!foldersDriver && filteredDrivers.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 p-4 text-center">
          <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            לפתיחת <strong className="text-foreground">תיקיות ניהול נהג</strong> — לחץ על כפתור התיקיות בכרטיס הנהג
          </p>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('drivers.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('drivers.deleteDescription')}</AlertDialogDescription>
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
