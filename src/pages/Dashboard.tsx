import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useComplianceAlerts } from '@/hooks/useDashboard';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import QuickOdometerDialog from '@/components/QuickOdometerDialog';
import { 
  Car, 
  Users, 
  AlertTriangle,
  BarChart3,
  FileText,
  Plus,
  ChevronLeft,
  Truck,
  Repeat,
  Gauge,
  Settings,
  Calculator,
  Droplet
} from 'lucide-react';

const statusCardConfig = [
  {
    titleKey: 'navigation.drivers' as const,
    icon: Users,
    theme: 'purple' as const,
    color: 'from-purple-500 to-indigo-600',
    link: '/drivers',
    getValue: (stats: { totalDrivers?: number } | null) => stats?.totalDrivers ?? 0,
  },
  {
    titleKey: 'navigation.fleetManagement' as const,
    icon: Car,
    theme: 'blue' as const,
    color: 'from-blue-500 to-cyan-400',
    link: '/vehicles',
    getValue: (stats: { totalVehicles?: number } | null) => stats?.totalVehicles ?? 0,
  },
  {
    titleKey: 'navigation.exceptionAlerts' as const,
    icon: AlertTriangle,
    theme: 'orange' as const,
    color: 'from-orange-500 to-yellow-400',
    link: '/compliance',
    getValue: (_: unknown, alertCount?: number) => alertCount ?? 0,
    alertKey: 'alert' as const,
  },
];

function StatusCard({
  title,
  value,
  icon: Icon,
  link,
  theme,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  link: string;
  theme: 'purple' | 'blue' | 'orange';
  color: string;
}) {
  return (
    <Link to={link} className="block group flex justify-center shrink-0">
      <div
        className={`status-card status-card--${theme} relative w-64 h-80 rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 p-8 flex flex-col justify-between hover:scale-[1.03] hover:-translate-y-1 overflow-hidden transition-[border-color,filter] duration-300 group-hover:backdrop-blur-lg group-hover:border-white/20`}
      >
        {/* השתקפות אור על זכוכית — גרדיאנט לבן שקוף בראש הכרטיס */}
        <div className="absolute top-0 left-0 right-0 h-2/5 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none rounded-t-[2.5rem] z-[1]" />
        {/* גרדיאנט פנימי: למעלה כהה, למטה מעט בהיר יותר — עומק ותחושת חומר */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/5 to-white/[0.06] pointer-events-none rounded-[2.5rem] z-[0]" />
        <div className="flex justify-between items-start w-full">
          <div className={`status-card-icon-box p-3 rounded-2xl bg-gradient-to-br ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="text-right z-10">
          <p className="text-gray-400 text-base font-medium mb-1">{title}</p>
          <p
            className="text-white text-7xl font-black tracking-tighter transition-transform duration-300 group-hover:scale-105 origin-right"
            style={{ textShadow: '0 0 48px rgba(255,255,255,0.12)' }}
          >
            {value}
          </p>
        </div>
        <div className="flex items-center gap-2 text-white font-bold z-10">
          <div className="status-card-entry-btn flex items-center justify-center w-10 h-10 rounded-full border border-white/30 bg-white/5 backdrop-blur-sm shrink-0">
            <ChevronLeft size={22} />
          </div>
          <span className="text-sm tracking-wide">כניסה</span>
        </div>
        <div className="status-card-shine absolute -inset-full h-full w-1/2 z-[5] block transform -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0" />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: alerts } = useComplianceAlerts();
  const [showOdometerDialog, setShowOdometerDialog] = useState(false);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const totalAlerts = (alerts?.filter(a => a.status === 'expired' || a.status === 'warning').length) ?? 0;

  const quickLinks: {
    title: string;
    href: string;
    icon: React.ElementType;
    disabled?: boolean;
  }[] = [
    {
      title: t('navigation.procedure6Complaints'),
      href: '/procedure6-complaints',
      icon: AlertTriangle,
    },
    {
      title: t('navigation.accounting'),
      href: '#',
      icon: Calculator,
      disabled: true,
    },
    {
      title: t('navigation.fuel'),
      href: '#',
      icon: Droplet,
      disabled: true,
    },
    {
      title: 'טפסים',
      href: '/forms',
      icon: FileText,
    },
    {
      title: 'הגדרות מערכת',
      href: '/admin/settings',
      icon: Settings,
    },
    {
      title: t('navigation.reportGeneration', { defaultValue: 'הפקת דוחות' }),
      href: '/reports',
      icon: BarChart3,
    },
    {
      title: t('navigation.parkingReports'),
      href: '/reports/scan',
      icon: FileText,
    },
    {
      title: t('navigation.accidents'),
      href: '/maintenance/add',
      icon: Plus,
    },
    {
      title: t('navigation.vehicleDelivery'),
      href: '/handover/delivery',
      icon: Truck,
    },
    {
      title: 'רכב חליפי',
      href: '/handover/replacement',
      icon: Repeat,
    },
  ];

  return (
    <div className="container py-6 md:py-8 space-y-6 md:space-y-8">
      <div className="rounded-2xl border bg-card p-5 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t('dashboard.title')}</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1.5">{t('dashboard.subtitle')}</p>
      </div>

      <section className="dashboard-status-stage p-6 md:p-10 space-y-6">
        <h2 className="text-lg md:text-xl font-semibold text-foreground text-center md:text-right">תמונת מצב</h2>
        <div className="flex flex-nowrap justify-center gap-12 md:gap-16 overflow-x-auto pb-2 md:overflow-visible">
          {isLoading ? (
            <>
              <Skeleton className="h-80 w-64 rounded-[2.5rem] shrink-0" />
              <Skeleton className="h-80 w-64 rounded-[2.5rem] shrink-0" />
              <Skeleton className="h-80 w-64 rounded-[2.5rem] shrink-0" />
            </>
          ) : (
            statusCardConfig.map((card) => {
              const Icon = card.icon;
              const value = card.alertKey
                ? card.getValue(stats, totalAlerts)
                : card.getValue(stats);
              return (
                <StatusCard
                  key={card.link}
                  title={t(card.titleKey)}
                  value={value}
                  icon={Icon}
                  link={card.link}
theme={card.theme}
                      color={card.color}
                />
              );
            })
          )}
        </div>
      </section>

      {isMobile ? (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 gap-2.5">
              {quickLinks.map((action, idx) =>
                action.disabled ? (
                  <Card key={`${action.title}-${idx}`} className="h-full cursor-not-allowed opacity-55">
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <action.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-muted-foreground truncate">{action.title}</p>
                        <p className="text-[11px] text-muted-foreground">בקרוב</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Link key={action.href + idx} to={action.href} className="block">
                    <Card className="h-full transition-all duration-200 hover:shadow-md">
                      <CardContent className="p-3.5 flex items-center gap-3">
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <action.icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{action.title}</p>
                        </div>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                )
              )}

              <Card className="h-full border-dashed">
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Gauge className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{t('navigation.mileageUpdate')}</p>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs text-muted-foreground"
                      onClick={() => setShowOdometerDialog(true)}
                    >
                      פתיחה מהירה
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {quickLinks.map((action, idx) =>
                action.disabled ? (
                  <Card key={`${action.title}-${idx}`} className="h-full cursor-not-allowed opacity-55">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <action.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-muted-foreground truncate">{action.title}</p>
                        <span className="text-xs text-muted-foreground">בקרוב</span>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Link key={action.href + idx} to={action.href} className="block">
                    <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <action.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{action.title}</p>
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            כניסה
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              )}

              <Card className="h-full border-dashed">
                <CardContent className="p-4 h-full flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Gauge className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{t('navigation.mileageUpdate')}</p>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs text-muted-foreground"
                      onClick={() => setShowOdometerDialog(true)}
                    >
                      פתיחה מהירה
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}

      

      <QuickOdometerDialog 
        open={showOdometerDialog} 
        onOpenChange={setShowOdometerDialog} 
      />
    </div>
  );
}