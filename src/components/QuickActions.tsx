import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from './ui/card';
import { MapPin, Truck, AlertCircle } from 'lucide-react';

export function QuickActions() {
  const { t } = useTranslation();

  const quickActions = [
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
      title: t('navigation.accidents'),
      href: '/maintenance/add',
      icon: AlertCircle,
      color: 'bg-red-500',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.quickActions')}</h2>
      <div className="grid grid-cols-1 gap-3">
        {quickActions.map((action) => (
          <Link key={action.href} to={action.href}>
            <Card className="transition-all hover:shadow-md hover:scale-[1.02] active:scale-95">
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${action.color}`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-base font-medium text-slate-900">{action.title}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
