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
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      {/* Radial cyan glow — the blue atmosphere behind everything */}
      <div className="absolute left-1/2 top-[-200px] h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[180px]" />
      {/* Subtle radial grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,255,0.05)_0%,transparent_60%)]" />

      {/* Page content — sits above all background layers */}
      <div className="relative z-10 px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('vehicles.title')}</h1>
            <p className="text-blue-300/60 mt-1">{t('vehicles.subtitle')}</p>
          </div>
          <Link to="/vehicles/add">
            <Button className="bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.45)]">
              <Plus className="h-4 w-4 mr-2" />
              {t('vehicles.addVehicle')}
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400/60" />
          <Input
            placeholder={t('vehicles.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-blue-500/30 bg-blue-950/40 pr-10 text-white placeholder:text-white/60 focus-visible:ring-blue-500/40"
          />
        </div>

        {/* Content */}
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTitle>שגיאה בטעינת הרכבים</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{errorMessage}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  נסה שוב
                </Button>
              </AlertDescription>
            </Alert>
          ) : filteredVehicles?.length === 0 ? (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 py-12 text-center">
              <Car className="h-12 w-12 mx-auto text-blue-400/40 mb-4" />
              <p className="text-blue-300/60">{t('vehicles.noVehicles')}</p>
              <Link to="/vehicles/add">
                <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-500">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('vehicles.addNewVehicle')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {filteredVehicles?.map(vehicle => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  canEdit={isManager}
                  drivers={drivers ?? []}
                  onAssignDriver={handleAssignDriver}
                  isAssigning={assignDriver.isPending}
                  activeAssignment={(activeAssignments ?? []).find((assignment) => assignment.vehicle_id === vehicle.id) ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>{/* end z-10 content */}
    </div>