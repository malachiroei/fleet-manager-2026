import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDrivers, useDriver } from '@/hooks/useDrivers';
import type { DriverSummary, ComplianceStatus } from '@/types/fleet';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Search, User } from 'lucide-react';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import DriverFolders from '@/components/DriverFolders';
import { DriversHudTable, type StatusFilter } from '@/components/drivers/DriversHudTable';
import { useVehicles, useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { mergeAssignedVehiclesForDriver } from '@/lib/mergeDriverAssignedVehicles';

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

function rowLicenseStatus(d: DriverSummary): ComplianceStatus {
  if (!d.is_active) return 'valid';
  const raw = d.license_expiry;
  const expiry = raw && String(raw).trim() !== '' ? new Date(raw) : null;
  const expiryValid = expiry && !Number.isNaN(expiry.getTime());
  if (!expiryValid) return 'valid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'warning';
  return 'valid';
}

export default function DriverListPage() {
  const { data: drivers, isLoading, isError, error, refetch } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const { data: activeAssignments = [] } = useActiveDriverVehicleAssignments();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterLicense, setFilterLicense] = useState('all');
  const [filterOperation, setFilterOperation] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const foldersDriverId = searchParams.get('folders') || '';
  const highlightDriverId = searchParams.get('highlightDriver') || '';
  const { data: foldersDriver } = useDriver(foldersDriverId);
  const foldersPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (foldersDriver && foldersPanelRef.current) {
      foldersPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [foldersDriver?.id]);

  useEffect(() => {
    if (!highlightDriverId || !drivers || drivers.length === 0) return;
    const el = document.getElementById(`driver-card-${highlightDriverId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightDriverId, drivers]);
  const errorMessage = getErrorMessage(error);

  const licenseTypeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const d of drivers ?? []) {
      const v = d.driving_permit?.trim();
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'he'));
  }, [drivers]);

  const operationOptions = useMemo(() => {
    const s = new Set<string>();
    for (const d of drivers ?? []) {
      const a = d.area?.trim();
      if (a) s.add(a);
      const div = d.division?.trim();
      if (div) s.add(div);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'he'));
  }, [drivers]);

  const assignedVehicleByDriverId = useMemo(() => {
    const m = new Map<string, { modelLabel: string; plateLabel: string }>();
    for (const d of drivers ?? []) {
      const tiles = mergeAssignedVehiclesForDriver(d.id, activeAssignments, vehicles);
      if (tiles.length === 0) continue;
      const primary = tiles[0];
      const extra = tiles.length - 1;
      const modelCore = [primary.manufacturer, primary.model].filter(Boolean).join(' ').trim();
      const modelLabel = extra > 0 ? `${modelCore || '—'} (+${extra})` : modelCore || '—';
      const plate = String(primary.plate_number ?? '').trim() || '—';
      const plateLabel = extra > 0 ? `${plate} (+${extra})` : plate;
      m.set(d.id, { modelLabel, plateLabel });
    }
    return m;
  }, [drivers, vehicles, activeAssignments]);

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
    if (filterStatus === 'training_gap') {
      list = list.filter(
        (d) => d.is_active && (!d.safety_training_date || String(d.safety_training_date).trim() === ''),
      );
    } else if (filterStatus !== 'all') {
      list = list.filter((d) => {
        if (filterStatus === 'inactive') return !d.is_active;
        if (!d.is_active) return false;
        const ls = rowLicenseStatus(d);
        if (filterStatus === 'active_ok') return ls === 'valid';
        if (filterStatus === 'renewal') return ls === 'warning';
        if (filterStatus === 'expired') return ls === 'expired';
        return true;
      });
    }
    if (filterLicense !== 'all') {
      list = list.filter((d) => (d.driving_permit?.trim() || '') === filterLicense);
    }
    if (filterOperation !== 'all') {
      list = list.filter(
        (d) => d.area?.trim() === filterOperation || d.division?.trim() === filterOperation
      );
    }
    return list;
  }, [drivers, search, filterStatus, filterLicense, filterOperation]);

  return (
    <FleetHudPageShell
      title={t('drivers.title')}
      subtitle={t('drivers.subtitle')}
      headerAside={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <div className="relative w-full min-w-0 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="search"
              dir="rtl"
              placeholder="חיפוש נהג — שם, ת״ז, טלפון, מייל…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 border-white/15 bg-black/40 pr-10 text-white placeholder:text-slate-500"
              aria-label="חיפוש נהג"
            />
          </div>
          <Link to="/drivers/add" className="w-full shrink-0 sm:w-auto">
            <Button size="sm" className="w-full border-cyan-500/40 bg-cyan-600/90 font-bold text-white shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:bg-cyan-500 sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              {t('drivers.addDriver')}
            </Button>
          </Link>
        </div>
      }
    >
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto w-full max-w-[1920px] space-y-5 rounded-3xl border border-cyan-400/25 p-4 text-foreground sm:space-y-6 sm:p-6">
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

        <div className="w-full">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
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
          ) : (drivers?.length ?? 0) === 0 ? (
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
            <>
              {foldersDriverId && !foldersDriver && !isLoading && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>נהג לא נמצא</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-2">
                    <span>לא נטען נהג עבור התיקיות. </span>
                    <Button variant="link" className="h-auto p-0" onClick={() => { searchParams.delete('folders'); setSearchParams(searchParams); }}>
                      נקה בחירה
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <DriversHudTable
                driversAll={drivers ?? []}
                driversFiltered={filteredDrivers}
                search={search}
                onSearchChange={setSearch}
                filterStatus={filterStatus}
                onFilterStatus={setFilterStatus}
                filterLicense={filterLicense}
                onFilterLicense={setFilterLicense}
                filterOperation={filterOperation}
                onFilterOperation={setFilterOperation}
                licenseTypeOptions={licenseTypeOptions}
                operationOptions={operationOptions}
                assignedVehicleByDriverId={assignedVehicleByDriverId}
              />
            </>
          )}
        </div>
      </section>
    </FleetHudPageShell>
  );
}
