import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles, useActiveDriverVehicleAssignments, useDeleteVehicle } from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, Wrench } from 'lucide-react';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
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
  VehiclesHudTable,
  vehicleHasDocExpired,
  vehicleHasDocWarnNoExpired,
  type VehicleQuickFilter,
  type VehicleStatusFilter,
} from '@/components/vehicles/VehiclesHudTable';
import { VEHICLE_OWNERSHIP_OPTIONS, canonicalOwnershipType } from '@/lib/vehicleOwnership';
import { normalizePlateNumber } from '@/lib/plateNumber';

export default function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();
  const { canAccessUi } = usePermissions();
  const { isManager } = useAuth();
  const showServiceUpdate = canAccessUi({ permission: 'vehicles', featureKey: 'qa_service_update' });
  const showReportMileage = canAccessUi({ permission: 'report_mileage', featureKey: 'qa_report_mileage' });
  const deleteVehicle = useDeleteVehicle();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<VehicleStatusFilter>('all');
  const [filterOwnership, setFilterOwnership] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [quickFilter, setQuickFilter] = useState<VehicleQuickFilter>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleQuickFilterChange = useCallback((qf: VehicleQuickFilter) => {
    setQuickFilter(qf);
    if (qf !== 'all') setFilterStatus('all');
  }, []);

  const handleFilterStatus = useCallback((v: VehicleStatusFilter) => {
    setFilterStatus(v);
    setQuickFilter('all');
  }, []);

  const handleFilterOwnership = useCallback((v: string) => {
    setFilterOwnership(v);
    setQuickFilter('all');
  }, []);

  const handleFilterGroup = useCallback((v: string) => {
    setFilterGroup(v);
    setQuickFilter('all');
  }, []);

  const assignedDriverNameByVehicleId = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles ?? []) {
      if (!v.assigned_driver_id) continue;
      const d = drivers.find((dr) => dr.id === v.assigned_driver_id);
      const name = (d?.full_name ?? '').trim();
      if (name) map.set(v.id, name);
    }
    for (const a of activeAssignments ?? []) {
      if (!a.vehicle_id || !a.driver_id || map.has(a.vehicle_id)) continue;
      const d = drivers.find((dr) => dr.id === a.driver_id);
      const name = (d?.full_name ?? '').trim();
      if (name) map.set(a.vehicle_id, name);
    }
    return map;
  }, [activeAssignments, drivers, vehicles]);

  const groupOptions = useMemo(() => {
    const s = new Set<string>();
    for (const v of vehicles ?? []) {
      const g = v.group_name?.trim();
      if (g) s.add(g);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'he'));
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    let list = vehicles ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((v) => {
        const plate = v.plate_number.toLowerCase();
        const plateDigits = normalizePlateNumber(v.plate_number);
        const qDigits = normalizePlateNumber(q);
        const mm = `${v.manufacturer} ${v.model}`.toLowerCase();
        const internal = v.internal_number?.toLowerCase() ?? '';
        const typeBits = [v.vehicle_type_name, v.commercial_name].filter(Boolean).join(' ').toLowerCase();
        const plateDigitsMatch = qDigits.length > 0 && plateDigits.includes(qDigits);
        return plateDigitsMatch || plate.includes(q) || mm.includes(q) || internal.includes(q) || typeBits.includes(q);
      });
    }
    if (filterStatus !== 'all') {
      list = list.filter((v) => {
        if (filterStatus === 'inactive') return !v.is_active;
        if (!v.is_active) return false;
        return v.status === filterStatus;
      });
    }
    if (filterOwnership !== 'all') {
      list = list.filter((v) => canonicalOwnershipType(v.ownership_type) === filterOwnership);
    }
    if (filterGroup !== 'all') {
      list = list.filter((v) => (v.group_name?.trim() || '') === filterGroup);
    }
    if (quickFilter === 'inactive') {
      list = list.filter((v) => !v.is_active);
    } else if (quickFilter === 'docs_warn') {
      list = list.filter(vehicleHasDocWarnNoExpired);
    } else if (quickFilter === 'docs_expired') {
      list = list.filter(vehicleHasDocExpired);
    } else if (quickFilter === 'no_driver') {
      list = list.filter(
        (v) => v.is_active && !assignedDriverNameByVehicleId.get(v.id)?.trim(),
      );
    }
    return list;
  }, [
    vehicles,
    search,
    filterStatus,
    filterOwnership,
    filterGroup,
    quickFilter,
    assignedDriverNameByVehicleId,
  ]);

  return (
    <FleetHudPageShell
      title="ניהול צי רכבים"
      subtitle="רשימת רכבים, חיפוש וסינון — תצוגת טבלה."
      headerAside={
        <>
          <Link to="/vehicles/add" className="w-full sm:w-auto">
            <Button className="w-full border-cyan-500/40 bg-cyan-600/90 text-sm font-bold text-white shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:bg-cyan-500 sm:w-auto">
              הוסף רכב
            </Button>
          </Link>
          {showReportMileage ? (
            <Link to="/report-mileage" className="w-full sm:w-auto">
              <Button
                type="button"
                data-no-theme
                variant="outline"
                className="w-full gap-2 border-slate-300 bg-white text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 sm:w-auto dark:border-cyan-500/40 dark:bg-white/5 dark:text-cyan-100 dark:shadow-none dark:hover:bg-cyan-500/10"
              >
                <Gauge className="h-4 w-4" />
                דיווח קילומטראז׳
              </Button>
            </Link>
          ) : (
            <Link to="/vehicles/odometer" className="w-full sm:w-auto">
              <Button
                type="button"
                data-no-theme
                variant="outline"
                className="w-full gap-2 border-slate-300 bg-white text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 sm:w-auto dark:border-cyan-500/40 dark:bg-white/5 dark:text-cyan-100 dark:shadow-none dark:hover:bg-cyan-500/10"
              >
                <Gauge className="h-4 w-4" />
                עדכון קילומטראז׳
              </Button>
            </Link>
          )}
          {showServiceUpdate ? (
            <Link to="/vehicles/service-update" className="w-full sm:w-auto">
              <Button
                type="button"
                data-no-theme
                variant="outline"
                className="w-full gap-2 border-slate-300 bg-white text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 sm:w-auto dark:border-purple-500/40 dark:bg-white/5 dark:text-purple-100 dark:shadow-none dark:hover:bg-purple-500/10"
              >
                <Wrench className="h-4 w-4" />
                עדכון טיפול
              </Button>
            </Link>
          ) : null}
        </>
      }
    >
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto w-full max-w-[1920px] space-y-5 rounded-3xl border border-cyan-400/25 p-4 text-foreground sm:space-y-6 sm:p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (vehicles?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 py-12 text-center text-slate-400">
            <p className="mb-4">אין רכבים בצי</p>
            <Link to="/vehicles/add">
              <Button>הוסף רכב ראשון</Button>
            </Link>
          </div>
        ) : (
          <VehiclesHudTable
            vehiclesAll={vehicles ?? []}
            vehiclesFiltered={filteredVehicles}
            search={search}
            onSearchChange={setSearch}
            filterStatus={filterStatus}
            onFilterStatus={handleFilterStatus}
            filterOwnership={filterOwnership}
            onFilterOwnership={handleFilterOwnership}
            filterGroup={filterGroup}
            onFilterGroup={handleFilterGroup}
            ownershipOptions={[...VEHICLE_OWNERSHIP_OPTIONS]}
            groupOptions={groupOptions}
            assignedDriverNameByVehicleId={assignedDriverNameByVehicleId}
            quickFilter={quickFilter}
            onQuickFilterChange={handleQuickFilterChange}
            canEdit={isManager}
            onDelete={(id) => setDeleteId(id)}
            showReportMileage={showReportMileage}
          />
        )}

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>מחיקת רכב</AlertDialogTitle>
              <AlertDialogDescription>
                פעולה זו תמחק את הרכב מהמערכת. האם להמשיך?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteId) {
                    deleteVehicle.mutate(deleteId);
                    setDeleteId(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                מחיקה
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </FleetHudPageShell>
  );
}
