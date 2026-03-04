import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useVehicles,
  useAssignDriverToVehicle,
  useActiveDriverVehicleAssignments,
  type ActiveDriverVehicleAssignment,
} from '@/hooks/useVehicles';
import { useDrivers } from '@/hooks/useDrivers';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Search, Car } from 'lucide-react';
import type { Vehicle, DriverSummary } from '@/types/fleet';

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="audi-premium-card">
      <div className="relative z-10 p-8">
        {/* Header - Model Name */}
        <div className="vehicle-title neon-title mb-1 text-2xl uppercase">
          {vehicle.manufacturer} {vehicle.model}
        </div>
        <div className="mb-6 h-1 w-12 bg-cyan-500 shadow-[0_0_8px_#22d3ee]" />

        {/* Big Plate Number */}
        <div className="neon-plate-text mb-8 text-6xl font-black tracking-[0.2em] text-center">
          {vehicle.plate_number}
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="audi-stat flex flex-col items-center justify-center p-4">
            <span className="white-data text-xl">{vehicle.current_odometer.toLocaleString()}</span>
            <span className="data-label-glow">קילומטראז'</span>
          </div>
          <div className="audi-stat flex flex-col items-center justify-center p-4">
            <span className="white-data text-xl">{new Date(vehicle.test_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">טסט</span>
          </div>
          <div className="audi-stat flex flex-col items-center justify-center p-4">
            <span className="white-data text-xl">{new Date(vehicle.insurance_expiry).toLocaleDateString('he-IL')}</span>
            <span className="data-label-glow">ביטוח</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-4 gap-3">
          <Link to={`/vehicles/${vehicle.id}#handover-history`}><button className="glass-button w-full py-3 font-bold">היסטוריה</button></Link>
          <Link to={`/vehicles/${vehicle.id}#tax-data`}><button className="glass-button w-full py-3 font-bold">נתוני מס</button></Link>
          <Link to={`/vehicles/${vehicle.id}#overview`}><button className="glass-button w-full py-3 font-bold">צפייה</button></Link>
          <Link to={`/vehicles/${vehicle.id}#vehicle-documents`}><button className="glass-button w-full py-3 font-bold">מסמכים</button></Link>
        </div>
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const { data: vehicles, isLoading, isError, error, refetch } = useVehicles();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filteredVehicles = vehicles?.filter(v => 
    v.plate_number.includes(search) || v.manufacturer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* BACKGROUND EFFECTS */}
      <div className="absolute left-1/2 top-[-200px] h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      <div className="relative z-10 p-8 space-y-10">
        {/* TOP BAR */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight neon-title">ניהול צי רכבים</h1>
            <p className="text-cyan-400/60 font-medium">מבט על של כל הרכבים במערכת</p>
          </div>
          <Link to="/vehicles/add">
            <Button className="bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.4)] px-6 py-6 text-lg font-bold">
              <Plus className="ml-2 h-5 w-5" /> הוסף רכב
            </Button>
          </Link>
        </div>

        {/* SEARCHBAR */}
        <div className="relative max-w-xl">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cyan-500/50" />
          <Input 
            placeholder="חפש לפי מספר רכב או דגם..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-14 bg-white/5 border-white/10 pr-12 text-xl focus:border-cyan-500/50 transition-all"
          />
        </div>

        {/* VEHICLE GRID */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[450px] rounded-3xl bg-white/5" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filteredVehicles?.map(vehicle => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}