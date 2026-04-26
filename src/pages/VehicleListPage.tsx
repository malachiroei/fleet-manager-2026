import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { usePermissions } from '@/hooks/usePermissions';
import type { Vehicle } from '@/types/fleet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Gauge, Wrench } from 'lucide-react';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="audi-premium-card p-4 md:p-8">
      <div className="relative z-[1] mb-2 text-lg font-bold tracking-tight text-white md:text-2xl dashboard-cyber-hero-title">
        {vehicle.manufacturer} {vehicle.model}
      </div>
      <div className="relative z-[1] mb-4 text-center text-2xl font-bold tracking-[0.08em] text-cyan-300 tabular-nums md:text-4xl md:tracking-[0.12em] hud-kpi-value">
        {vehicle.plate_number}
      </div>
      <div className="relative z-[1] mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,1fr)] gap-1.5 min-[400px]:gap-2 md:gap-4">
        <div className="min-w-0 bg-white/5 rounded-xl md:rounded-2xl px-1 py-2 min-[400px]:p-2 md:p-4 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span
            className="hud-kpi-value white-data tabular-nums max-w-full text-center leading-tight whitespace-normal text-white [font-size:clamp(0.72rem,2.5vw+0.35rem,1.65rem)]"
            dir="ltr"
          >
            {vehicle.current_odometer.toLocaleString()}
          </span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight">
            ק"מ
          </span>
        </div>
        <div className="min-w-0 bg-white/5 rounded-xl md:rounded-2xl px-1 py-2 min-[400px]:p-2 md:p-4 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span className="hud-kpi-value text-sm font-bold text-white min-[400px]:text-base md:text-2xl">{vehicle.year}</span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight">
            שנה
          </span>
        </div>
        <div className="min-w-[7.5rem] bg-white/5 rounded-xl md:rounded-2xl px-1.5 py-2 min-[400px]:p-2 md:p-4 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span
            className="vehicle-stat-mixed text-center text-xs font-bold leading-snug text-white min-[400px]:text-sm md:text-base"
            lang={/[\u0590-\u05FF]/.test(String(vehicle.ownership_type ?? '')) ? 'he' : 'en'}
          >
            {vehicle.ownership_type ?? '—'}
          </span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight">
            בעלות
          </span>
        </div>
      </div>
      <div className="relative z-[1] mb-3 grid grid-cols-2 gap-1.5 min-[400px]:gap-2 md:gap-4">
        <div className="min-w-0 bg-white/5 rounded-xl md:rounded-2xl px-1 py-2 min-[400px]:p-2 md:p-4 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span className="text-xs font-semibold tabular-nums text-white min-[400px]:text-base md:text-xl text-center leading-tight" dir="ltr">
            {fmtDate(vehicle.last_service_date)}
          </span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight px-1 text-balance">
            תאריך טיפול אחרון
          </span>
        </div>
        <div className="min-w-0 bg-white/5 rounded-xl md:rounded-2xl px-1 py-2 min-[400px]:p-2 md:p-4 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span className="text-xs font-semibold tabular-nums text-white min-[400px]:text-base md:text-xl text-center leading-tight" dir="ltr">
            {vehicle.last_service_km != null ? vehicle.last_service_km.toLocaleString() : '—'}
          </span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight px-1 text-balance">
            ק״מ טיפול אחרון
          </span>
        </div>
      </div>
      <div className="relative z-[1] mb-4 grid grid-cols-1 min-[360px]:grid-cols-3 gap-1.5 min-[400px]:gap-2">
        <div className="min-w-0 bg-white/5 rounded-xl px-1 py-2 min-[400px]:p-2 flex flex-col items-center justify-center gap-1 border border-white/10">
          <span className="text-[11px] font-semibold tabular-nums text-white min-[400px]:text-xs md:text-sm text-center leading-tight" dir="ltr">{fmtDate(vehicle.created_at)}</span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight px-1 text-balance">תאריך הקמה</span>
        </div>
        <div className="min-w-0 bg-white/5 rounded-xl px-1 py-2 min-[400px]:p-2 flex flex-col items-center justify-center gap-1 border border-cyan-500/20">
          <span className="text-[11px] font-bold tabular-nums text-cyan-300 min-[400px]:text-xs md:text-sm text-center leading-tight" dir="ltr">{fmtDate(vehicle.purchase_date)}</span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight px-1 text-balance">תחילת עסקה</span>
        </div>
        <div className="min-w-0 bg-white/5 rounded-xl px-1 py-2 min-[400px]:p-2 flex flex-col items-center justify-center gap-1 border border-orange-500/20">
          <span className="text-[11px] font-bold tabular-nums text-orange-300 min-[400px]:text-xs md:text-sm text-center leading-tight" dir="ltr">{fmtDate(vehicle.sale_date)}</span>
          <span className="hud-dashboard-label text-[10px] font-semibold uppercase tracking-wide min-[400px]:text-xs text-center leading-tight px-1 text-balance">סיום עסקה</span>
        </div>
      </div>
      <div className="relative z-[1] grid grid-cols-2 min-[520px]:grid-cols-4 gap-1.5 min-[400px]:gap-2">
        <Link to={`/vehicles/${vehicle.id}#handover-history`} className="min-w-0">
          <button type="button" className="glass-button glass-button--multiline w-full font-bold">היסטוריית העברות</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#tax-data`} className="min-w-0">
          <button type="button" className="glass-button glass-button--multiline w-full font-bold">נתוני מס</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#overview`} className="min-w-0">
          <button type="button" className="glass-button glass-button--multiline w-full font-bold">צפייה</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#vehicle-documents`} className="min-w-0">
          <button type="button" className="glass-button glass-button--multiline w-full font-bold">מסמכים</button>
        </Link>
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const { canAccessUi } = usePermissions();
  const showServiceUpdate = canAccessUi({ permission: 'vehicles', featureKey: 'qa_service_update' });
  const [search, setSearch] = useState('');
  const filtered = vehicles?.filter(v => v.plate_number.includes(search) || v.manufacturer.toLowerCase().includes(search.toLowerCase()));

  return (
    <FleetHudPageShell
      title="ניהול צי רכבים"
      subtitle="רשימת רכבים, חיפוש ופעולות מהירות — אותה חוויית לוח בקרה."
      headerAside={
        <>
          <Link to="/vehicles/add" className="w-full sm:w-auto">
            <Button className="w-full bg-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:bg-cyan-500 sm:w-auto md:px-8 md:py-6 md:text-lg">
              הוסף רכב
            </Button>
          </Link>
          <Link to="/vehicles/odometer" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full gap-2 border-cyan-500/40 bg-white/5 font-semibold text-cyan-100 hover:bg-cyan-500/10 sm:w-auto"
            >
              <Gauge className="h-4 w-4" />
              עדכון קילומטראז׳
            </Button>
          </Link>
          {showServiceUpdate ? (
            <Link to="/vehicles/service-update" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full gap-2 border-purple-500/40 bg-white/5 font-semibold text-purple-100 hover:bg-purple-500/10 sm:w-auto"
              >
                <Wrench className="h-4 w-4" />
                עדכון טיפול
              </Button>
            </Link>
          ) : null}
        </>
      }
    >
      <section className="dashboard-status-stage dashboard-cyber-stage relative space-y-6 rounded-3xl border border-cyan-400/25 p-4 sm:p-6 md:space-y-8">
        <div className="relative max-w-xl">
          <Search className="absolute right-4 top-1/2 z-[1] -translate-y-1/2 text-cyan-500/50" />
          <Input
            placeholder="חפש רכב..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 border-white/10 bg-white/5 pr-12 text-base text-white placeholder:text-slate-500 focus:border-cyan-500 md:h-14 md:text-xl"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3 lg:gap-10">
          {isLoading
            ? [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-80 rounded-3xl border border-cyan-500/20 bg-slate-900/40" />)
            : filtered?.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      </section>
    </FleetHudPageShell>
  );
}