import { useMemo, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Vehicle, ComplianceStatus } from '@/types/fleet';
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
import { displayOwnershipType } from '@/lib/vehicleOwnership';
import { fmtDriverDate } from '@/components/DriverCard';
import { AlertTriangle, ChevronLeft, ChevronRight, MoreHorizontal, Car, IdCard, UserX } from 'lucide-react';

const PAGE_SIZE = 10;

export type VehicleQuickFilter = 'all' | 'inactive' | 'docs_warn' | 'docs_expired' | 'no_driver';

/** רכב פעיל עם טסט או ביטוח שפגו */
export function vehicleHasDocExpired(v: Vehicle): boolean {
  if (!v.is_active) return false;
  return (
    urgencyForVehicleDocDate(v.test_expiry) === 'expired' ||
    urgencyForVehicleDocDate(v.insurance_expiry) === 'expired'
  );
}

/** רכב פעיל עם טסט/ביטוח בחלון 30 יום (ללא פג תוקף באחד מהם) */
export function vehicleHasDocWarnNoExpired(v: Vehicle): boolean {
  if (!v.is_active) return false;
  const t = urgencyForVehicleDocDate(v.test_expiry);
  const i = urgencyForVehicleDocDate(v.insurance_expiry);
  if (t === 'expired' || i === 'expired') return false;
  return t === 'warn' || i === 'warn';
}

/** ימים עד תוקף (חצות); null אם אין תאריך תקף */
function daysUntilCalendarDate(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

/** תואם לסינון KPI «טסט/ביטוח»: פג או פחות מ־30 יום */
export type DocExpiryUrgency = 'ok' | 'warn' | 'expired';

export function urgencyForVehicleDocDate(raw: string | null | undefined): DocExpiryUrgency {
  const days = daysUntilCalendarDate(raw);
  if (days === null) return 'ok';
  if (days < 0) return 'expired';
  if (days < 30) return 'warn';
  return 'ok';
}

function complianceRank(s: ComplianceStatus): number {
  if (s === 'expired') return 3;
  if (s === 'warning') return 2;
  return 1;
}

/** סטטוס תצוגה: שדה `status` מה-DB יחד עם טסט/ביטוח (כמו סינון הכרטיסייה) */
function effectiveVehicleComplianceStatus(v: Vehicle): ComplianceStatus {
  if (!v.is_active) return 'valid';
  const testU = urgencyForVehicleDocDate(v.test_expiry);
  const insU = urgencyForVehicleDocDate(v.insurance_expiry);
  let fromDocs: ComplianceStatus = 'valid';
  if (testU === 'expired' || insU === 'expired') fromDocs = 'expired';
  else if (testU === 'warn' || insU === 'warn') fromDocs = 'warning';
  const merged = Math.max(complianceRank(fromDocs), complianceRank(v.status));
  if (merged === 3) return 'expired';
  if (merged === 2) return 'warning';
  return 'valid';
}

function statusPillTitle(v: Vehicle): string {
  if (!v.is_active) return 'רכב מסומן כלא פעיל';
  const bits: string[] = [];
  const t = urgencyForVehicleDocDate(v.test_expiry);
  const i = urgencyForVehicleDocDate(v.insurance_expiry);
  const dt = daysUntilCalendarDate(v.test_expiry);
  const di = daysUntilCalendarDate(v.insurance_expiry);
  if (t === 'expired') bits.push(`טסט פג (${fmtDriverDate(v.test_expiry)})`);
  else if (t === 'warn' && dt != null) bits.push(`טסט: נותרו ${dt} ימים · ${fmtDriverDate(v.test_expiry)}`);
  if (i === 'expired') bits.push(`ביטוח פג (${fmtDriverDate(v.insurance_expiry)})`);
  else if (i === 'warn' && di != null) bits.push(`ביטוח: נותרו ${di} ימים · ${fmtDriverDate(v.insurance_expiry)}`);
  if (v.status === 'warning' && t === 'ok' && i === 'ok') {
    bits.push('סטטוס במערכת: דורש טיפול');
  }
  if (v.status === 'expired' && t === 'ok' && i === 'ok') {
    bits.push('סטטוס במערכת: פג תוקף');
  }
  if (bits.length === 0) return 'תאריכי טסט וביטוח בתוקף';
  return bits.join(' — ');
}

function vehicleTypeLabel(v: Vehicle): string {
  const named = [v.vehicle_type_name?.trim(), v.commercial_name?.trim()].filter(Boolean).join(' · ');
  if (named) return named;
  return `${v.manufacturer} ${v.model}`.trim();
}

/** פירוט טסט/ביטוח (ולעיתים סטטוס מערכת) מתחת לתג — כדי לראות למה השורה מסומנת בלי עמודות נפרדות */
function VehicleComplianceDocSubtext({ v }: { v: Vehicle }) {
  if (!v.is_active) return null;
  const t = urgencyForVehicleDocDate(v.test_expiry);
  const i = urgencyForVehicleDocDate(v.insurance_expiry);
  const dt = daysUntilCalendarDate(v.test_expiry);
  const di = daysUntilCalendarDate(v.insurance_expiry);
  const docNonOk = t !== 'ok' || i !== 'ok';
  const rows: { key: string; className: string; children: ReactNode }[] = [];

  if (t === 'expired') {
    rows.push({
      key: 'te',
      className: 'text-red-200/95',
      children: (
        <>
          טסט: פג תוקף · <span dir="ltr">{fmtDriverDate(v.test_expiry)}</span>
        </>
      ),
    });
  } else if (t === 'warn') {
    rows.push({
      key: 'tw',
      className: 'text-amber-200/95',
      children: (
        <>
          טסט: לטיפול
          {dt != null ? ` · נותרו ${dt} ימים` : ''} · <span dir="ltr">{fmtDriverDate(v.test_expiry)}</span>
        </>
      ),
    });
  }

  if (i === 'expired') {
    rows.push({
      key: 'ie',
      className: 'text-red-200/95',
      children: (
        <>
          ביטוח: פג תוקף · <span dir="ltr">{fmtDriverDate(v.insurance_expiry)}</span>
        </>
      ),
    });
  } else if (i === 'warn') {
    rows.push({
      key: 'iw',
      className: 'text-amber-200/95',
      children: (
        <>
          ביטוח: לטיפול
          {di != null ? ` · נותרו ${di} ימים` : ''} · <span dir="ltr">{fmtDriverDate(v.insurance_expiry)}</span>
        </>
      ),
    });
  }

  if (!docNonOk && v.status === 'warning') {
    rows.push({
      key: 'sys',
      className: 'text-amber-200/90',
      children: <>סטטוס במערכת: דורש טיפול (טסט וביטוח בתוקף)</>,
    });
  }
  if (!docNonOk && v.status === 'expired') {
    rows.push({
      key: 'syse',
      className: 'text-red-200/90',
      children: <>סטטוס במערכת: פג תוקף (טסט וביטוח בתוקף)</>,
    });
  }

  if (rows.length === 0) return null;
  return (
    <div className="mt-1 max-w-[14rem] space-y-0.5 text-[10px] font-medium leading-snug">
      {rows.map((r) => (
        <div key={r.key} className={cn('text-right', r.className)}>
          {r.children}
        </div>
      ))}
    </div>
  );
}

function vehicleCompliancePill(v: Vehicle) {
  if (!v.is_active) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-700/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200"
        title="רכב מסומן כלא פעיל — סטטוס טסט/ביטוח לא מחושב כאן"
      >
        לא פעיל
      </span>
    );
  }
  const effective = effectiveVehicleComplianceStatus(v);
  const map: Record<ComplianceStatus, { label: string; className: string }> = {
    valid: {
      label: 'תקין',
      className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
    },
    warning: {
      label: 'לטיפול',
      className: 'border-amber-500/45 bg-amber-500/15 text-amber-100',
    },
    expired: {
      label: 'פג תוקף',
      className: 'border-red-500/45 bg-red-500/15 text-red-100',
    },
  };
  const cfg = map[effective] ?? map.valid;
  return (
    <span
      title={statusPillTitle(v)}
      className={cn(
        'inline-flex cursor-help items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

export type VehicleStatusFilter = 'all' | 'valid' | 'warning' | 'expired' | 'inactive';

export interface VehiclesHudTableProps {
  vehiclesAll: Vehicle[];
  vehiclesFiltered: Vehicle[];
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: VehicleStatusFilter;
  onFilterStatus: (v: VehicleStatusFilter) => void;
  filterOwnership: string;
  onFilterOwnership: (v: string) => void;
  filterGroup: string;
  onFilterGroup: (v: string) => void;
  ownershipOptions: string[];
  groupOptions: string[];
  assignedDriverNameByVehicleId: ReadonlyMap<string, string>;
  quickFilter: VehicleQuickFilter;
  onQuickFilterChange: (v: VehicleQuickFilter) => void;
  canEdit: boolean;
  onDelete: (id: string) => void;
  showReportMileage: boolean;
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

export function VehiclesHudTable({
  vehiclesAll,
  vehiclesFiltered,
  search,
  onSearchChange,
  filterStatus,
  onFilterStatus,
  filterOwnership,
  onFilterOwnership,
  filterGroup,
  onFilterGroup,
  ownershipOptions,
  groupOptions,
  assignedDriverNameByVehicleId,
  quickFilter,
  onQuickFilterChange,
  canEdit,
  onDelete,
  showReportMileage,
}: VehiclesHudTableProps) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterOwnership, filterGroup, search, quickFilter, vehiclesFiltered.length]);

  const totalPages = Math.max(1, Math.ceil(vehiclesFiltered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageClamped - 1) * PAGE_SIZE;
    return vehiclesFiltered.slice(start, start + PAGE_SIZE);
  }, [vehiclesFiltered, pageClamped]);

  const stats = useMemo(() => {
    const all = vehiclesAll;
    const total = all.length;
    const inactive = all.filter((v) => !v.is_active).length;
    const docsWarn = all.filter(vehicleHasDocWarnNoExpired).length;
    const docsExpired = all.filter(vehicleHasDocExpired).length;
    const noDriver = all.filter(
      (v) => v.is_active && !assignedDriverNameByVehicleId.get(v.id)?.trim(),
    ).length;
    return { total, inactive, docsWarn, docsExpired, noDriver };
  }, [vehiclesAll, assignedDriverNameByVehicleId]);

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allPageSelected =
    pageSlice.length > 0 && pageSlice.every((v) => selected.has(v.id));
  const togglePage = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const v of pageSlice) {
          if (checked) next.add(v.id);
          else next.delete(v.id);
        }
        return next;
      });
    },
    [pageSlice],
  );

  return (
    <div className="w-full max-w-[100vw] space-y-4 overflow-x-hidden sm:space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-cyan-500/20 bg-[#0a1528]/90 p-3 shadow-[0_0_24px_rgba(6,182,212,0.08)] sm:grid-cols-3 lg:grid-cols-5 sm:gap-3 sm:p-4">
        <StatCardButton
          active={quickFilter === 'all'}
          onClick={() => onQuickFilterChange('all')}
          title="הצג את כל הרכבים (לפי סינון החיפוש והדרופדאונים)"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Car className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.total}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">סה״כ רכבים</p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={quickFilter === 'inactive'}
          onClick={() => onQuickFilterChange('inactive')}
          title="סינון: רכבים לא פעילים בלבד"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-600/40 text-slate-200">
            <Car className="h-5 w-5 opacity-80" />
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
        <StatCardButton
          active={quickFilter === 'docs_warn'}
          onClick={() => onQuickFilterChange('docs_warn')}
          title="סינון: טסט או ביטוח עם 0–29 ימים לתאריך התוקף (ללא פג תוקף באף אחד מהם)"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-200">
            <IdCard className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-amber-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.docsWarn}
            </p>
            <p className="text-[11px] font-medium leading-snug text-amber-100/90 sm:text-xs">
              טסט / ביטוח
              <span className="text-slate-400"> — </span>
              לטיפול
            </p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={quickFilter === 'docs_expired'}
          onClick={() => onQuickFilterChange('docs_expired')}
          title="סינון: טסט או ביטוח שכבר פגו"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-red-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.docsExpired}
            </p>
            <p className="text-[11px] font-medium leading-snug text-red-100/90 sm:text-xs">
              טסט / ביטוח
              <span className="text-slate-400"> — </span>
              פג תוקף
            </p>
          </div>
        </StatCardButton>
        <StatCardButton
          active={quickFilter === 'no_driver'}
          onClick={() => onQuickFilterChange('no_driver')}
          title="סינון: רכבים פעילים ללא נהג משויך"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-200">
            <UserX className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-bold tabular-nums leading-none tracking-tight text-sky-100 sm:text-3xl"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {stats.noDriver}
            </p>
            <p className="text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">ללא נהג משויך</p>
          </div>
        </StatCardButton>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-start sm:gap-3 sm:p-4">
        <div className="min-w-0 sm:max-w-xs sm:flex-1">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">חיפוש</label>
          <Input
            placeholder="חפש רכב…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 border-white/10 bg-black/30 text-white placeholder:text-slate-500"
          />
        </div>
        <div className="w-full min-w-[8rem] sm:w-40 sm:shrink-0">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">סטטוס</label>
          <Select value={filterStatus} onValueChange={(v) => onFilterStatus(v as VehicleStatusFilter)}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="סטטוס" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="valid">תקין</SelectItem>
              <SelectItem value="warning">לטיפול</SelectItem>
              <SelectItem value="expired">פג תוקף</SelectItem>
              <SelectItem value="inactive">לא פעיל</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full min-w-[8rem] sm:w-40 sm:shrink-0">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">בעלות</label>
          <Select value={filterOwnership} onValueChange={onFilterOwnership}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="בעלות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              {ownershipOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full min-w-[8rem] sm:w-40 sm:shrink-0">
          <label className="mb-1 block text-[11px] font-medium text-slate-400">קבוצה</label>
          <Select value={filterGroup} onValueChange={onFilterGroup}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="קבוצה" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              {groupOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-cyan-500/20 bg-[#070d18]/95 shadow-[0_0_32px_rgba(6,182,212,0.06)]">
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[880px] table-fixed border-separate border-spacing-0 text-right">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
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
                  סוג רכב
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  מספר רישוי
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  נהג משויך
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  סטטוס
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  בעלות
                </TableHead>
                <TableHead className="p-0 px-3 py-2.5 text-right align-middle text-xs font-semibold text-slate-300">
                  ק״מ
                </TableHead>
                <TableHead className="w-12 p-0 px-1 align-middle text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageSlice.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={8} className="py-16 text-center text-slate-400">
                    אין רכבים להצגה לפי הסינון
                  </TableCell>
                </TableRow>
              ) : (
                pageSlice.map((v) => {
                  const driverName = assignedDriverNameByVehicleId.get(v.id)?.trim() || '';
                  const typeLabel = vehicleTypeLabel(v);
                  const ownershipLabel = displayOwnershipType(v.ownership_type);
                  return (
                    <TableRow
                      key={v.id}
                      id={`vehicle-card-${v.id}`}
                      className={cn(
                        'border-white/5 transition-all duration-200',
                        'hover:border-cyan-400/25 hover:bg-cyan-500/[0.06] hover:shadow-[0_0_18px_rgba(34,211,238,0.12)]',
                      )}
                    >
                      <TableCell className="p-0 px-2 py-2.5 text-center align-middle [&:has([role=checkbox])]:pr-2">
                        <Checkbox
                          checked={selected.has(v.id)}
                          onCheckedChange={(ck) => toggleOne(v.id, ck === true)}
                          aria-label={`בחר ${v.plate_number}`}
                          className="border-cyan-400/50 data-[state=checked]:bg-cyan-600"
                        />
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle">
                        <Link
                          to={`/vehicles/${v.id}`}
                          className="block truncate font-semibold text-slate-100 hover:text-cyan-200 hover:underline"
                          title={typeLabel}
                        >
                          {typeLabel}
                        </Link>
                      </TableCell>
                      <TableCell
                        className="p-0 px-3 py-2.5 align-middle font-mono text-sm font-medium tabular-nums text-cyan-200/90"
                        dir="ltr"
                      >
                        <Link to={`/vehicles/${v.id}`} className="hover:underline">
                          {v.plate_number}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle text-sm text-slate-300">
                        <span className="block truncate" title={driverName || undefined}>
                          {driverName || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle">
                        <div className="flex flex-col items-stretch gap-0">
                          {vehicleCompliancePill(v)}
                          <VehicleComplianceDocSubtext v={v} />
                        </div>
                      </TableCell>
                      <TableCell className="p-0 px-3 py-2.5 align-middle text-sm text-slate-300">
                        <span className="block truncate" title={ownershipLabel || undefined}>
                          {ownershipLabel || '—'}
                        </span>
                      </TableCell>
                      <TableCell
                        className="p-0 px-3 py-2.5 align-middle font-mono text-sm tabular-nums text-slate-200"
                        dir="ltr"
                      >
                        {v.current_odometer.toLocaleString('he-IL')}
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
                              <Link to={`/vehicles/${v.id}`}>כרטיס רכב</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link to={`/vehicles/${v.id}/edit`}>עריכה</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link to={`/vehicles/${v.id}#handover-history`}>היסטוריית העברות</Link>
                            </DropdownMenuItem>
                            {showReportMileage ? (
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link to={`/report-mileage?vehicle=${encodeURIComponent(v.id)}`}>דיווח ק״מ</Link>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link to={`/vehicles/odometer`}>עדכון ק״מ</Link>
                              </DropdownMenuItem>
                            )}
                            {canEdit ? (
                              <DropdownMenuItem
                                className="cursor-pointer text-red-400 focus:text-red-300"
                                onClick={() => onDelete(v.id)}
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

        {vehiclesFiltered.length > 0 ? (
          <div className="flex flex-col items-stretch justify-between gap-2 border-t border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:px-4">
            <p className="text-center sm:text-right">
              מציג {(pageClamped - 1) * PAGE_SIZE + 1}–
              {Math.min(pageClamped * PAGE_SIZE, vehiclesFiltered.length)} מתוך {vehiclesFiltered.length}
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
