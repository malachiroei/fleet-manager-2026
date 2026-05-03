import { useMemo, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DriverSummary, ComplianceStatus } from '@/types/fleet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fmtDriverDate } from '@/components/DriverCard';
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  IdCard,
  GraduationCap,
  Users,
  UserX,
} from 'lucide-react';
import { fleetTableColumnsStorageKey, readOptionalColumnIds, writeOptionalColumnIds } from '@/lib/fleetTableColumnPrefs';
import { FleetTableColumnsButton, FleetTableColumnsSheet } from '@/components/fleet/FleetTableColumnsSheet';
import {
  DRIVER_HUD_OPTIONAL_COLUMNS,
  DRIVER_HUD_OPTIONAL_IDS,
  DEFAULT_DRIVER_HUD_OPTIONAL_VISIBLE,
} from '@/components/drivers/driverHudColumnDefinitions';

const PAGE_SIZE = 10;

function licenseStatusForDriver(d: DriverSummary): ComplianceStatus {
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

function statusPill(d: DriverSummary) {
  if (!d.is_active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-700/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
        לא פעיל
      </span>
    );
  }
  const s = licenseStatusForDriver(d);
  const map: Record<ComplianceStatus, { label: string; className: string }> = {
    valid: {
      label: 'פעיל',
      className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
    },
    warning: {
      label: 'לחידוש',
      className: 'border-amber-500/45 bg-amber-500/15 text-amber-100',
    },
    expired: {
      label: 'פג תוקף',
      className: 'border-red-500/45 bg-red-500/15 text-red-100',
    },
  };
  const cfg = map[s];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}

function fmtDriverCellText(raw: unknown): string {
  if (raw === null || raw === undefined) return '—';
  const s = String(raw).trim();
  return s || '—';
}

function renderDriverHudOptionalCell(
  colId: string,
  d: DriverSummary,
  vehicleCols: { modelLabel: string; plateLabel: string } | undefined,
): ReactNode {
  switch (colId) {
    case 'id_number':
      return (
        <span className="font-mono text-sm tabular-nums text-slate-300" dir="ltr">
          {d.id_number?.trim() ? d.id_number.trim() : '—'}
        </span>
      );
    case 'assigned_vehicle_model':
      return vehicleCols?.modelLabel ? (
        <span className="block truncate text-sm text-slate-300" title={vehicleCols.modelLabel}>
          {vehicleCols.modelLabel}
        </span>
      ) : (
        <span className="text-slate-500">—</span>
      );
    case 'assigned_vehicle_plate':
      return vehicleCols?.plateLabel ? (
        <span
          className="block truncate font-mono text-sm tabular-nums text-slate-200"
          dir="ltr"
          title={vehicleCols.plateLabel}
        >
          {vehicleCols.plateLabel}
        </span>
      ) : (
        <span className="text-slate-500">—</span>
      );
    case 'status':
      return statusPill(d);
    case 'phone':
      return (
        <span className="font-mono text-sm text-slate-200" dir="ltr">
          {d.phone?.trim() || '—'}
        </span>
      );
    case 'license_expiry':
      return (
        <span className="whitespace-nowrap text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.license_expiry)}
        </span>
      );
    case 'driver_code':
      return (
        <span className="font-mono text-sm text-slate-200" dir="ltr">
          {fmtDriverCellText(d.driver_code)}
        </span>
      );
    case 'employee_number':
      return (
        <span className="font-mono text-sm text-slate-200" dir="ltr">
          {fmtDriverCellText(d.employee_number)}
        </span>
      );
    case 'email':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.email)}</span>;
    case 'address':
      return <span className="block max-w-[12rem] truncate text-sm text-slate-300">{fmtDriverCellText(d.address)}</span>;
    case 'city':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.city)}</span>;
    case 'job_title':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.job_title)}</span>;
    case 'department':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.department)}</span>;
    case 'group_name':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.group_name)}</span>;
    case 'group_code':
      return (
        <span className="font-mono text-sm text-slate-200" dir="ltr">
          {fmtDriverCellText(d.group_code)}
        </span>
      );
    case 'division':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.division)}</span>;
    case 'area':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.area)}</span>;
    case 'safety_officer':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.safety_officer)}</span>;
    case 'birth_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.birth_date)}
        </span>
      );
    case 'work_start_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.work_start_date)}
        </span>
      );
    case 'license_number':
      return (
        <span className="font-mono text-sm text-slate-200" dir="ltr">
          {fmtDriverCellText(d.license_number)}
        </span>
      );
    case 'driving_permit':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.driving_permit)}</span>;
    case 'health_declaration_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.health_declaration_date)}
        </span>
      );
    case 'safety_training_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.safety_training_date)}
        </span>
      );
    case 'regulation_585b_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.regulation_585b_date)}
        </span>
      );
    case 'practical_driving_test_date':
      return (
        <span className="text-sm tabular-nums text-slate-200" dir="ltr">
          {fmtDriverDate(d.practical_driving_test_date)}
        </span>
      );
    case 'eligibility':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.eligibility)}</span>;
    case 'rating':
      return <span className="block truncate text-sm text-slate-300">{fmtDriverCellText(d.rating)}</span>;
    case 'note1':
      return <span className="block max-w-[10rem] truncate text-sm text-slate-400">{fmtDriverCellText(d.note1)}</span>;
    case 'note2':
      return <span className="block max-w-[10rem] truncate text-sm text-slate-400">{fmtDriverCellText(d.note2)}</span>;
    case 'is_field_person':
      return <span className="text-sm text-slate-300">{d.is_field_person ? 'כן' : 'לא'}</span>;
    case 'is_active':
      return <span className="text-sm text-slate-300">{d.is_active ? 'פעיל' : 'לא פעיל'}</span>;
    default:
      return <span className="text-slate-500">—</span>;
  }
}

function StatCardButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-right transition-colors sm:px-4',
        active
          ? 'border-cyan-400/45 bg-cyan-500/15 shadow-[0_0_16px_rgba(34,211,238,0.12)]'
          : 'border-white/5 bg-black/20 hover:border-cyan-500/25 hover:bg-white/[0.06]',
      )}
    >
      {children}
    </button>
  );
}

function scrollDriversTableIntoView() {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.getElementById('drivers-hud-table-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  });
}

export type StatusFilter =
  | 'all'
  | 'active_ok'
  | 'renewal'
  | 'expired'
  | 'inactive'
  /** נהג פעיל בלי תאריך הדרכת בטיחות */
  | 'training_gap';

export interface DriversHudTableProps {
  driversAll: DriverSummary[];
  driversFiltered: DriverSummary[];
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: StatusFilter;
  onFilterStatus: (v: StatusFilter) => void;
  filterLicense: string;
  onFilterLicense: (v: string) => void;
  filterOperation: string;
  onFilterOperation: (v: string) => void;
  licenseTypeOptions: string[];
  operationOptions: string[];
  /** רכב ראשון משויך — דגם ומספר רישוי בנפרד */
  assignedVehicleByDriverId: ReadonlyMap<string, { modelLabel: string; plateLabel: string }>;
  showNotificationSettingsLink?: boolean;
}

export function DriversHudTable({
  driversAll,
  driversFiltered,
  search,
  onSearchChange,
  filterStatus,
  onFilterStatus,
  filterLicense,
  onFilterLicense,
  filterOperation,
  onFilterOperation,
  licenseTypeOptions,
  operationOptions,
  assignedVehicleByDriverId,
  showNotificationSettingsLink = false,
}: DriversHudTableProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterLicense, filterOperation, search, driversFiltered.length]);

  const totalPages = Math.max(1, Math.ceil(driversFiltered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageClamped - 1) * PAGE_SIZE;
    return driversFiltered.slice(start, start + PAGE_SIZE);
  }, [driversFiltered, pageClamped]);

  const stats = useMemo(() => {
    const all = driversAll;
    const total = all.length;
    const inactive = all.filter((d) => !d.is_active).length;
    const expired = all.filter((d) => d.is_active && licenseStatusForDriver(d) === 'expired').length;
    const renewal = all.filter((d) => d.is_active && licenseStatusForDriver(d) === 'warning').length;
    const trainingGap = all.filter(
      (d) => d.is_active && (!d.safety_training_date || String(d.safety_training_date).trim() === ''),
    ).length;
    return { total, inactive, expired, renewal, trainingGap };
  }, [driversAll]);

  const applyStatFilter = useCallback(
    (next: StatusFilter) => {
      onFilterStatus(next);
      scrollDriversTableIntoView();
    },
    [onFilterStatus],
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allPageSelected =
    pageSlice.length > 0 && pageSlice.every((d) => selected.has(d.id));
  const togglePage = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const d of pageSlice) {
          if (checked) next.add(d.id);
          else next.delete(d.id);
        }
        return next;
      });
    },
    [pageSlice]
  );

  const driverColumnsKey = fleetTableColumnsStorageKey('drivers');
  const driverColAllowed = useMemo(() => new Set(DRIVER_HUD_OPTIONAL_IDS), []);
  const [driverOptionalVisible, setDriverOptionalVisible] = useState(() =>
    readOptionalColumnIds(driverColumnsKey, driverColAllowed, [...DEFAULT_DRIVER_HUD_OPTIONAL_VISIBLE]),
  );
  const [driverColSheetOpen, setDriverColSheetOpen] = useState(false);
  const driverTableColSpan = 2 + driverOptionalVisible.length;

  return (
    <div className="w-full max-w-[100vw] space-y-4 overflow-x-hidden sm:space-y-5">
      {/* KPI — לחיצה מסננת ומגללת לטבלה (כמו מסך רכבים) */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-cyan-500/20 bg-[#0a1528]/90 p-3 shadow-[0_0_24px_rgba(6,182,212,0.08)] sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-5">
        <StatCardButton
          active={filterStatus === 'all'}
          onClick={() => applyStatFilter('all')}
          title="הצג את כל הנהגים (לפי חיפוש למעלה והסינונים)"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.total}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">סה״כ נהגים</p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={filterStatus === 'expired'}
          onClick={() => applyStatFilter('expired')}
          title="סינון: רישיון נהיגה פג תוקף (נהגים פעילים)"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-red-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.expired}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">רישיון פג תוקף</p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={filterStatus === 'renewal'}
          onClick={() => applyStatFilter('renewal')}
          title="סינון: רישיון לחידוש (עד 30 יום)"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-200">
            <IdCard className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-amber-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.renewal}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">לחידוש (30 יום)</p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={filterStatus === 'training_gap'}
          onClick={() => applyStatFilter('training_gap')}
          title="סינון: נהג פעיל בלי תאריך הדרכת בטיחות — לטיפול"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-200">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-sky-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.trainingGap}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">הדרכה לטיפול</p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={filterStatus === 'inactive'}
          onClick={() => applyStatFilter('inactive')}
          title="סינון: נהגים לא פעילים"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-600/40 text-slate-200">
            <UserX className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-200 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.inactive}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">לא פעילים</p>
          </div>
        </StatCardButton>
      </div>

      {/* Filters row — חיפוש בכותרת העמוד */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3 sm:p-4">
        <div className="w-full min-w-[8rem] sm:w-40">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">סטטוס</label>
          <Select
            value={filterStatus}
            onValueChange={(v) => {
              onFilterStatus(v as StatusFilter);
              scrollDriversTableIntoView();
            }}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="סטטוס" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active_ok">פעיל — רישיון תקין</SelectItem>
              <SelectItem value="renewal">רישיון לחידוש (עד 30 יום)</SelectItem>
              <SelectItem value="expired">רישיון פג תוקף</SelectItem>
              <SelectItem value="training_gap">חסרה הדרכת בטיחות</SelectItem>
              <SelectItem value="inactive">לא פעיל</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full min-w-[8rem] sm:w-44">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">סוג רישיון</label>
          <Select value={filterLicense} onValueChange={onFilterLicense}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="סוג רישיון" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              {licenseTypeOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full min-w-[8rem] sm:w-44">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">תפעול / אזור</label>
          <Select value={filterOperation} onValueChange={onFilterOperation}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="תפעול" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              {operationOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full min-h-[2.5rem] flex-wrap items-end justify-start gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          {showNotificationSettingsLink ? (
            <Link
              to="/admin/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/15"
            >
              <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
              הגדרות התראות (מייל)
            </Link>
          ) : null}
          <FleetTableColumnsButton onClick={() => setDriverColSheetOpen(true)} />
        </div>
      </div>

      <FleetTableColumnsSheet
        open={driverColSheetOpen}
        onOpenChange={setDriverColSheetOpen}
        title="עמודות בטבלת נהגים"
        description="בחר אילו שדות יוצגו בטבלה אחרי עמודת שם הנהג. ההעדפה נשמרת בדפדפן."
        options={DRIVER_HUD_OPTIONAL_COLUMNS}
        value={driverOptionalVisible}
        defaultValue={[...DEFAULT_DRIVER_HUD_OPTIONAL_VISIBLE]}
        onSave={(next) => {
          const cleaned = next.filter((id) => driverColAllowed.has(id));
          writeOptionalColumnIds(driverColumnsKey, cleaned);
          setDriverOptionalVisible(cleaned);
        }}
      />

      {/* Table */}
      <div
        id="drivers-hud-table-anchor"
        className="scroll-mt-24 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#070d18]/95 shadow-[0_0_32px_rgba(6,182,212,0.06)]"
      >
        <div className="overflow-x-auto">
          <Table
            className={cn(
              'w-full border-separate border-spacing-0 text-right',
              driverOptionalVisible.length <= 6 ? 'min-w-[880px]' : 'min-w-[1040px]',
            )}
          >
            <TableHeader>
              <TableRow className="border-cyan-500/15 bg-black/40 hover:bg-black/40">
                <TableHead className="h-11 w-11 p-0 px-2 text-center align-middle [&:has([role=checkbox])]:pr-2">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(v) => togglePage(v === true)}
                    aria-label="בחר את כל השורות בעמוד"
                    className="border-cyan-400/50 data-[state=checked]:bg-cyan-600"
                  />
                </TableHead>
                <TableHead className="min-w-[10rem] p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  נהג
                </TableHead>
                {driverOptionalVisible.map((colId) => (
                  <TableHead
                    key={colId}
                    className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300 whitespace-nowrap"
                  >
                    {DRIVER_HUD_OPTIONAL_COLUMNS.find((c) => c.id === colId)?.label ?? colId}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageSlice.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={driverTableColSpan} className="py-16 text-center text-slate-400">
                    אין נהגים להצגה לפי הסינון
                  </TableCell>
                </TableRow>
              ) : (
                pageSlice.map((d) => {
                  const vehicleCols = assignedVehicleByDriverId.get(d.id);
                  return (
                    <TableRow
                      key={d.id}
                      id={`driver-card-${d.id}`}
                      onClick={() => navigate(`/drivers/${d.id}/edit`)}
                      className={cn(
                        'cursor-pointer border-white/5 transition-all duration-200',
                        'hover:border-cyan-400/25 hover:bg-cyan-500/[0.06] hover:shadow-[0_0_18px_rgba(34,211,238,0.12)]',
                      )}
                    >
                      <TableCell
                        className="p-0 px-2 py-2.5 text-center align-middle [&:has([role=checkbox])]:pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={(v) => toggleOne(d.id, v === true)}
                          aria-label={`בחר ${d.full_name}`}
                          className="border-cyan-400/50 data-[state=checked]:bg-cyan-600"
                        />
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-3">
                          {d.license_front_url ? (
                            <img
                              src={d.license_front_url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-600/80 to-slate-800 text-xs font-bold text-white">
                              {(d.full_name ?? '').trim().slice(0, 2) || '?'}
                            </div>
                          )}
                          <div className="min-w-0 text-right">
                            <Link
                              to={`/drivers/${d.id}/edit`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate font-semibold text-slate-100 hover:text-cyan-200 hover:underline"
                            >
                              {d.full_name}
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      {driverOptionalVisible.map((colId) => (
                        <TableCell key={colId} className="max-w-[14rem] p-0 px-3 py-2.5 align-middle">
                          {renderDriverHudOptionalCell(colId, d, vehicleCols)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {driversFiltered.length > 0 ? (
          <div className="flex flex-col items-stretch justify-between gap-2 border-t border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:px-4">
            <p className="text-center sm:text-right">
              מציג {(pageClamped - 1) * PAGE_SIZE + 1}–
              {Math.min(pageClamped * PAGE_SIZE, driversFiltered.length)} מתוך {driversFiltered.length}
            </p>
            <div className="flex items-center justify-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-white/10 bg-transparent px-2"
                disabled={pageClamped <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="px-2 tabular-nums text-slate-300">
                {pageClamped} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-white/10 bg-transparent px-2"
                disabled={pageClamped >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
