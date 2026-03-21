import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from './ui/card';
import { MapPin, Truck, AlertCircle, Repeat, ClipboardList } from 'lucide-react';
import { useFleetManifestUiGates } from '@/hooks/useFleetManifestUiGates';

type QuickActionItem = {
  title: string;
  href: string;
  icon: typeof MapPin;
  color: string;
};

export function QuickActions() {
  const { t } = useTranslation();
  const manifestUi = useFleetManifestUiGates();

  const quickActions = useMemo((): QuickActionItem[] => {
    const base: QuickActionItem[] = [
      {
        title: t('navigation.parkingReports'),
        href: '/reports/scan',
        icon: MapPin,
        color: 'bg-orange-500',
      },
      {
        title: t('navigation.vehicleDelivery'),
        href: '/handover/delivery',
        icon: Truck,
        color: 'bg-blue-500',
      },
      {
        title: 'רכב חליפי',
        href: '/handover/replacement',
        icon: Repeat,
        color: 'bg-cyan-600',
      },
      {
        /** לא מקשר ל־/maintenance/add — רק כרטיס «עדכן טיפול» המאושר מופיע שם */
        title: t('navigation.accidents'),
        href: '/compliance',
        icon: AlertCircle,
        color: 'bg-red-500',
      },
    ];

    if (manifestUi.ready && manifestUi.maintenanceForm) {
      return [
        {
          title: 'עדכן טיפול',
          href: '/maintenance/add',
          icon: ClipboardList,
          color: 'bg-amber-600',
        },
        ...base,
      ];
    }

    return base;
  }, [t, manifestUi.ready, manifestUi.maintenanceForm]);

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
