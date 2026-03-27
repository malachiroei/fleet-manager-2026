import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from './ui/card';
import { MapPin, Truck, AlertCircle, Repeat } from 'lucide-react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { usePermissions } from '@/hooks/usePermissions';

type QuickActionItem = {
  title: string;
  href: string;
  icon: typeof MapPin;
  color: string;
  featureFlagKey: string;
};

export function QuickActions() {
  const { t } = useTranslation();
  useFeatureFlags();
  const { canAccessFeature } = usePermissions();

  const quickActions = useMemo((): QuickActionItem[] => {
    const candidates: QuickActionItem[] = [
      {
        title: t('navigation.parkingReports'),
        href: '/reports/scan',
        icon: MapPin,
        color: 'bg-orange-500',
        featureFlagKey: 'qa_parking_reports',
      },
      {
        title: t('navigation.vehicleDelivery'),
        href: '/handover/delivery',
        icon: Truck,
        color: 'bg-blue-500',
        featureFlagKey: 'qa_vehicle_delivery',
      },
      {
        title: 'רכב חליפי',
        href: '/handover/replacement',
        icon: Repeat,
        color: 'bg-cyan-600',
        featureFlagKey: 'qa_replacement_car',
      },
      {
        /** לא מקשר ל־/maintenance/add — רק כרטיס «עדכן טיפול» המאושר מופיע שם */
        title: t('navigation.accidents'),
        href: '/compliance',
        icon: AlertCircle,
        color: 'bg-red-500',
        featureFlagKey: 'qa_accidents',
      },
    ];

    return candidates.filter((a) => canAccessFeature(a.featureFlagKey));
  }, [t, canAccessFeature]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{t('dashboard.quickActions')}</h2>
      <div className="grid grid-cols-1 gap-3">
        {quickActions.map((action) => (
          <Link key={`${action.href}-${action.title}`} to={action.href}>
            <Card className="transition-all hover:shadow-md hover:scale-[1.02] active:scale-95">
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${action.color}`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-base font-medium text-white">{action.title}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
