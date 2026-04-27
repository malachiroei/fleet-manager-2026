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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { fmtDriverDate } from '@/components/DriverCard';
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  IdCard,
  GraduationCap,
  Users,
  UserX,
} from 'lucide-react';

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
  canEdit: boolean;
  onDelete: (id: string) => void;
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
  canEdit,
  onDelete,
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

  const openFolders = (id: string) => {
    navigate(`/drivers?folders=${id}`, { replace: false });
    setTimeout(() => {
      document.getElementById('driver-folders-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  return (
    <div className="w-full max-w-[100vw] space-y-4 overflow-x-hidden sm:space-y-5">
      {/* KPI — לחיצה מסננת ומגללת לטבלה (כמו מסך רכבים) */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-cyan-500/20 bg-[#0a1528]/90 p-3 shadow-[0_0_24px_rgba(6,182,212,0.08)] sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-5">
        <StatCardButton
          active={filterStatus === 'all'}
          onClick={() => applyStatFilter('all')}
          title="הצג את כל הנהגים (לפי חיפוש והדרופדאונים למטה)"
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

      {/* Filters row */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:p-4">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">חיפוש</label>
          <Input
            placeholder="חפש נהג…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 border-white/10 bg-black/30 text-white placeholder:text-slate-500"
          />
        </div>
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
        {showNotificationSettingsLink ? (
          <div className="flex min-h-[2.5rem] flex-1 items-end justify-start sm:justify-end">
            <Link
              to="/admin/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/15"
            >
              <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
              הגדרות התראות (מייל)
            </Link>
          </div>
        ) : null}
      </div>

      {/* Table */}
      <div
        id="drivers-hud-table-anchor"
        className="scroll-mt-24 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#070d18]/95 shadow-[0_0_32px_rgba(6,182,212,0.06)]"
      >
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-right">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: 48 }} />
            </colgroup>
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
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  נהג
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  ת.ז.
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  סוג רכב משויך
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  מספר רכב משויך
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  סטטוס
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  טלפון
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  תוקף רישיון
                </TableHead>
                <TableHead className="w-12 p-0 px-1 align-middle text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageSlice.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={9} className="py-16 text-center text-slate-400">
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
                      className={cn(
                        'border-white/5 transition-all duration-200',
                        'hover:border-cyan-400/25 hover:bg-cyan-500/[0.06] hover:shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                      )}
                    >
                      <TableCell className="p-0 px-2 py-2.5 text-center align-middle [&:has([role=checkbox])]:pr-2">
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
                              to={`/drivers/${d.id}`}
                              className="block truncate font-semibold text-slate-100 hover:text-cyan-200 hover:underline"
                            >
                              {d.full_name}
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className="p-0 px-3 py-2.5 align-middle font-mono text-sm tabular-nums text-slate-300"
                        dir="ltr"
                      >
                        {d.id_number?.trim() ? d.id_number.trim() : '—'}
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle text-sm text-slate-300">
                        {vehicleCols?.modelLabel ? (
                          <span className="block truncate" title={vehicleCols.modelLabel}>
                            {vehicleCols.modelLabel}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="p-0 px-3 py-2.5 align-middle font-mono text-sm tabular-nums text-slate-200"
                        dir="ltr"
                      >
                        {vehicleCols?.plateLabel ? (
                          <span className="block truncate" title={vehicleCols.plateLabel}>
                            {vehicleCols.plateLabel}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle">{statusPill(d)}</TableCell>
                      <TableCell
                        className="p-0 px-3 py-2.5 align-middle font-mono text-sm text-slate-200"
                        dir="ltr"
                      >
                        {d.phone?.trim() || '—'}
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle whitespace-nowrap text-sm tabular-nums text-slate-200">
                        {fmtDriverDate(d.license_expiry)}
                      </TableCell>
                      <TableCell className="p-0 px-1 py-2.5 text-center align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:bg-white/10 hover:text-cyan-200"
                              aria-label="פעולות"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[10rem]">
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link to={`/drivers/${d.id}`}>כרטיס נהג</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link to={`/drivers/${d.id}/edit`}>עריכה</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openFolders(d.id)}
                            >
                              תיקיות
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem
                                className="cursor-pointer text-red-400 focus:text-red-300"
                                onClick={() => onDelete(d.id)}
                              >
                                מחיקה
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
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
