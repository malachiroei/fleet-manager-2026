import { useQuery } from '@tanstack/react-query';
import type { DashboardStats, ComplianceStatus } from '@/types/fleet';
import { useVehicles } from './useVehicles'; // ייבוא ה-Hook של הרכבים מ-Supabase
import { useDrivers } from './useDrivers';   // ייבוא ה-Hook של הנהגים מ-Supabase

interface ComplianceItem {
  id: string;
  type: 'vehicle' | 'driver';
  name: string;
  alertType: string;
  expiryDate: string;
  status: ComplianceStatus;
}

function calculateStatus(expiryDate: string): ComplianceStatus {
  if (!expiryDate) return 'valid';
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'warning';
  return 'valid';
}

export function useDashboardStats() {
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();

  return useQuery({
    queryKey: ['dashboard-stats', vehicles.length, drivers.length],
    queryFn: async (): Promise<DashboardStats> => {
      let warningCount = 0;
      let expiredCount = 0;

      vehicles.forEach(v => {
        const testStatus = calculateStatus(v.test_expiry);
        const insuranceStatus = calculateStatus(v.insurance_expiry);
        if (testStatus === 'expired') expiredCount++;
        else if (testStatus === 'warning') warningCount++;
        if (insuranceStatus === 'expired') expiredCount++;
        else if (insuranceStatus === 'warning') warningCount++;
      });

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