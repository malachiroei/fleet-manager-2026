import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, Vehicle, Driver, ComplianceStatus } from '@/types/fleet';
import initialVehicles from '@/data/vehicles.json';
import initialDrivers from '@/data/drivers.json';

const VEHICLES_KEY = 'vehicles_data';
const DRIVERS_KEY = 'drivers_data';

interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
}

function getStoredData() {
  const storedVehicles = localStorage.getItem(VEHICLES_KEY);
  const vehicles: Vehicle[] = storedVehicles ? JSON.parse(storedVehicles) : initialVehicles;

  const storedDrivers = localStorage.getItem(DRIVERS_KEY);
  const drivers: Driver[] = storedDrivers ? JSON.parse(storedDrivers) : initialDrivers;

  return { vehicles, drivers };
}

function calculateStatus(expiryDate: string): ComplianceStatus {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'warning';
  return 'valid';
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      const { vehicles, drivers } = getStoredData();

      let warningCount = 0;
      let expiredCount = 0;

      // Check vehicle compliance
      vehicles.forEach(v => {
        const testStatus = calculateStatus(v.test_expiry);
        const insuranceStatus = calculateStatus(v.insurance_expiry);

        if (testStatus === 'expired') expiredCount++;
        else if (testStatus === 'warning') warningCount++;

        if (insuranceStatus === 'expired') expiredCount++;
        else if (insuranceStatus === 'warning') warningCount++;

        // Check maintenance KM alert
        if (v.next_maintenance_km && v.current_odometer + 500 >= v.next_maintenance_km) {
          warningCount++;
        }
      });

      // Check driver compliance
      drivers.forEach(d => {
        const licenseStatus = calculateStatus(d.license_expiry);

        if (licenseStatus === 'expired') expiredCount++;
        else if (licenseStatus === 'warning') warningCount++;
      });

      return {
        totalVehicles: vehicles.length,
        totalDrivers: drivers.length,
        alertsCount: warningCount + expiredCount,
        warningCount,
        expiredCount
      };
    }
  });
}

export function useComplianceAlerts() {
  return useQuery({
    queryKey: ['compliance-alerts'],
    queryFn: async (): Promise<ComplianceItem[]> => {
      await new Promise(resolve => setTimeout(resolve, 500));
      const { vehicles, drivers } = getStoredData();
      const alerts: ComplianceItem[] = [];

      // Check vehicle compliance
      vehicles.forEach(v => {
        const testStatus = calculateStatus(v.test_expiry);
        if (testStatus !== 'valid') {
          alerts.push({
            id: `${v.id}-test`,
            type: 'vehicle',
            name: `${v.manufacturer} ${v.model} (${v.plate_number})`,
            alertType: 'טסט',
            expiryDate: v.test_expiry,
            status: testStatus
          });
        }

        const insuranceStatus = calculateStatus(v.insurance_expiry);
        if (insuranceStatus !== 'valid') {
          alerts.push({
            id: `${v.id}-insurance`,
            type: 'vehicle',
            name: `${v.manufacturer} ${v.model} (${v.plate_number})`,
            alertType: 'ביטוח',
            expiryDate: v.insurance_expiry,
            status: insuranceStatus
          });
        }

        // KM-based maintenance alert
        if (v.next_maintenance_km && v.current_odometer + 500 >= v.next_maintenance_km) {
          alerts.push({
            id: `${v.id}-maintenance`,
            type: 'vehicle',
            name: `${v.manufacturer} ${v.model} (${v.plate_number})`,
            alertType: 'טיפול (ק"מ)',
            expiryDate: v.next_maintenance_date || '',
            status: 'warning'
          });
        }
      });

      // Check driver compliance
      drivers.forEach(d => {
        const licenseStatus = calculateStatus(d.license_expiry);
        if (licenseStatus !== 'valid') {
          alerts.push({
            id: `${d.id}-license`,
            type: 'driver',
            name: d.full_name,
            alertType: 'רישיון נהיגה',
            expiryDate: d.license_expiry,
            status: licenseStatus
          });
        }
      });

      // Sort by status (expired first, then warning)
      return alerts.sort((a, b) => {
        if (a.status === 'expired' && b.status !== 'expired') return -1;
        if (a.status !== 'expired' && b.status === 'expired') return 1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    }
  });
}
