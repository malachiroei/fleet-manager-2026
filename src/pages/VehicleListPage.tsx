import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';

function VehicleCard({ vehicle }: { vehicle: any }) {
  return (
    <div className="audi-premium-card p-4 md:p-8">
      <div className="mb-2 text-lg md:text-2xl font-black neon-title uppercase">
        {vehicle.manufacturer} {vehicle.model}
      </div>
      <div className="mb-4 md:mb-8 text-4xl md:text-6xl font-black tracking-[0.15em] md:tracking-[0.2em] text-cyan-400 text-center drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
        {vehicle.plate_number}
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Link to={`/vehicles/${vehicle.id}#handover-history`}>
          <button className="glass-button w-full py-2 md:py-3 text-xs md:text-sm font-bold">היסטוריה</button>
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
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-cyan-500/10 blur-[150px] pointer-events-none" />
      <div className="relative z-10 space-y-6 md:space-y-10">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-2xl md:text-4xl font-black neon-title">ניהול צי רכבים</h1>
          <Link to="/vehicles/add">
            <Button className="bg-cyan-600 hover:bg-cyan-500 font-bold px-4 md:px-8 py-2 md:py-6 text-sm md:text-lg shadow-[0_0_20px_rgba(6,182,212,0.4)]">הוסף רכב</Button>
          </Link>
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