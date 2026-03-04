import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVehicles } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';

function VehicleCard({ vehicle }: { vehicle: any }) {
  return (
    <div className="audi-premium-card p-8">
      <div className="mb-2 text-2xl font-black neon-title uppercase">
        {vehicle.manufacturer} {vehicle.model}
      </div>
      <div className="mb-8 text-6xl font-black tracking-[0.2em] text-cyan-400 text-center drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
        {vehicle.plate_number}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/5 rounded-2xl p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-2xl">{vehicle.current_odometer.toLocaleString()}</span>
          <span className="data-label-glow">ק"מ</span>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-2xl">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
          <span className="data-label-glow">טסט</span>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 flex flex-col items-center border border-white/10">
          <span className="white-data text-2xl">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
          <span className="data-label-glow">ביטוח</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {['היסטוריה', 'נתוני מס', 'צפייה', 'מסמכים'].map((label) => (
          <button key={label} className="glass-button py-3 text-sm font-bold uppercase">{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const [search, setSearch] = useState('');
  const filtered = vehicles?.filter(v => v.plate_number.includes(search) || v.manufacturer.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#020617] p-8 text-white relative overflow-hidden">
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-cyan-500/10 blur-[150px] pointer-events-none" />
      <div className="relative z-10 space-y-10">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-black neon-title">ניהול צי רכבים</h1>
          <Button className="bg-cyan-600 hover:bg-cyan-500 font-bold px-8 py-6 text-lg shadow-[0_0_20px_rgba(6,182,212,0.4)]">הוסף רכב</Button>
        </div>
        <div className="relative max-w-xl">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500/50" />
          <Input 
            placeholder="חפש רכב..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="h-14 bg-white/5 border-white/10 pr-12 text-xl focus:border-cyan-500" 
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered?.map(v => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      </div>
    </div>
  );
}