import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Gauge } from 'lucide-react';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}

function VehicleCard({ vehicle }: { vehicle: any; key?: string }) {
  return (
    <div className="audi-premium-card p-4 md:p-8">
      <div className="mb-2 text-lg md:text-2xl font-black neon-title uppercase">
        {vehicle.manufacturer} {vehicle.model}
      </div>
      <div className="mb-4 text-2xl md:text-4xl font-black tracking-[0.1em] md:tracking-[0.15em] text-cyan-400 text-center drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
        {vehicle.plate_number}
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3">
        <div className="bg-white/5 rounded-xl md:rounded-2xl p-2 md:p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-base md:text-2xl tabular-nums" dir="ltr">{vehicle.current_odometer.toLocaleString()}</span>
          <span className="data-label-glow text-xs">ק"מ</span>
        </div>
        <div className="bg-white/5 rounded-xl md:rounded-2xl p-2 md:p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-base md:text-2xl">{vehicle.year}</span>
          <span className="data-label-glow text-xs">שנה</span>
        </div>
        <div className="bg-white/5 rounded-xl md:rounded-2xl p-2 md:p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-sm md:text-lg text-center leading-tight">{vehicle.ownership_type ?? '—'}</span>
          <span className="data-label-glow text-xs">בעלות</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center border border-white/10">
          <span className="white-data text-xs md:text-sm tabular-nums" dir="ltr">{fmtDate(vehicle.created_at)}</span>
          <span className="data-label-glow text-xs">תאריך הקמה</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center border border-cyan-500/20">
          <span className="text-cyan-300 text-xs md:text-sm font-bold tabular-nums" dir="ltr">{fmtDate(vehicle.purchase_date)}</span>
          <span className="data-label-glow text-xs">תחילת עסקה</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center border border-orange-500/20">
          <span className="text-orange-300 text-xs md:text-sm font-bold tabular-nums" dir="ltr">{fmtDate(vehicle.sale_date)}</span>
          <span className="data-label-glow text-xs">סיום עסקה</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Link to={`/vehicles/${vehicle.id}#handover-history`}>
          <button className="glass-button w-full py-2 md:py-3 text-xs md:text-sm font-bold">היסטורית העברות</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#tax-data`}>
          <button className="glass-button w-full py-2 md:py-3 text-xs md:text-sm font-bold">נתוני מס</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#overview`}>
          <button className="glass-button w-full py-2 md:py-3 text-xs md:text-sm font-bold">צפייה</button>
        </Link>
        <Link to={`/vehicles/${vehicle.id}#vehicle-documents`}>
          <button className="glass-button w-full py-2 md:py-3 text-xs md:text-sm font-bold">מסמכים</button>
        </Link>
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const [search, setSearch] = useState('');
  const filtered = vehicles?.filter(v => v.plate_number.includes(search) || v.manufacturer.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#020617] p-4 md:p-8 text-white relative overflow-hidden">
      <div className="absolute top-[-180px] left-1/2 -translate-x-1/2 w-[120vw] max-w-[800px] h-[120vw] max-h-[800px] bg-cyan-500/10 blur-[150px] pointer-events-none" />
      <div className="relative z-10 space-y-6 md:space-y-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <h1 className="text-2xl md:text-4xl font-black neon-title">ניהול צי רכבים</h1>
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
            <Link to="/vehicles/add" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 font-bold px-4 md:px-8 py-2 md:py-6 text-sm md:text-lg shadow-[0_0_20px_rgba(6,182,212,0.4)]">הוסף רכב</Button>
            </Link>
            <Link to="/vehicles/odometer" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto border-cyan-500/40 bg-white/5 hover:bg-cyan-500/10 text-cyan-100 font-semibold gap-2"
              >
                <Gauge className="h-4 w-4" />
                עדכון קילומטראז׳
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative max-w-xl">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500/50" />
          <Input
            placeholder="חפש רכב..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 md:h-14 bg-white/5 border-white/10 pr-12 text-base md:text-xl focus:border-cyan-500"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-10">
          {filtered?.map(v => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      </div>
    </div>
  );
}