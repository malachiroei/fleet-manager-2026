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
  // שורה עליונה: רכבים + נהגים
  {
    titleKey: 'navigation.fleetManagement' as const,
    icon: Car,
    theme: 'blue' as const,
    color: 'from-blue-500 to-cyan-400',
    link: '/vehicles',
    getValue: (stats: { totalVehicles?: number } | null) => stats?.totalVehicles ?? 0,
  },
  {
    titleKey: 'navigation.drivers' as const,
    icon: Users,
    theme: 'purple' as const,
    color: 'from-purple-500 to-indigo-600',
    link: '/drivers',
    getValue: (stats: { totalDrivers?: number } | null) => stats?.totalDrivers ?? 0,
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
  {
    titleKey: 'dashboard.replacementVehicle' as const,
    icon: Repeat,
    theme: 'teal' as const,
    color: 'from-teal-400 to-emerald-500',
    link: '/handover/replacement',
    getValue: () => '',
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
  theme: 'purple' | 'blue' | 'orange' | 'teal';
  color: string;
}) {
  const glowClass =
    theme === 'blue'
      ? 'shadow-[0_0_15px_rgba(59,130,246,0.55)]'
      : theme === 'purple'
        ? 'shadow-[0_0_15px_rgba(168,85,247,0.55)]'
        : theme === 'orange'
          ? 'shadow-[0_0_15px_rgba(249,115,22,0.55)]'
          : 'shadow-[0_0_15px_rgba(45,212,191,0.55)]';

  return (
    <Link to={link} className="block group">
      <div
        className={`status-card status-card--${theme} relative h-40 sm:h-44 md:h-56 w-full rounded-2xl bg-white/5/80 backdrop-blur-lg border border-white/10 p-3 sm:p-4 flex flex-col items-center justify-between hover:scale-[1.03] hover:-translate-y-1 overflow-hidden transition-all duration-300 ${glowClass}`}
      >
        {/* השתקפות + גרדיאנט פנימי */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.07] via-black/40 to-black/80 opacity-80 pointer-events-none" />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-black/50 via-transparent to-white/[0.03] pointer-events-none" />

        <div className="relative z-10 mt-1 flex flex-col items-center gap-2">
          <div className={`status-card-icon-box inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${color}`}>
            <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
          </div>
          <p className="text-[11px] sm:text-xs md:text-sm font-medium text-gray-300 tracking-wide truncate">
            {title}
          </p>
        </div>

        {value !== '' && (
          <div className="relative z-10 text-center">
            <p
              className="text-white text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
              style={{ textShadow: '0 0 40px rgba(255,255,255,0.2)' }}
            >
              {value}
            </p>
          </div>
        )}

        <div className="relative z-10 mb-1 flex items-center gap-1 text-[10px] sm:text-xs font-medium text-white/80">
          <div className="status-card-entry-btn flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full border border-white/25 bg-white/5 backdrop-blur-sm">
            <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </div>
          <span className="tracking-wide">כניסה</span>
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
    // חשבונאות ודלק ייכנסו כשיתממשקו — כרגע לא מציגים אותם בפעולות מהירות
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
  ];

  return (
    <div className="container py-6 md:py-8 space-y-6 md:space-y-8">
      <div className="rounded-2xl border bg-card p-5 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t('dashboard.title')}</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1.5">{t('dashboard.subtitle')}</p>
      </div>

      <section className="dashboard-status-stage p-6 md:p-10 space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                className="h-40 w-full rounded-2xl"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2">
            {statusCardConfig.map((card) => {
              const Icon = card.icon;
              const value = card.alertKey
                ? card.getValue(stats, totalAlerts)
                : card.getValue(stats);
              const title =
                card.titleKey === 'dashboard.replacementVehicle' ? 'רכב חליפי' : t(card.titleKey);
              return (
                <StatusCard
                  key={card.link}
                  title={title}
                  value={value}
                  icon={Icon}
                  link={card.link}
                  theme={card.theme}
                  color={card.color}
                />
              );
            })}
          </div>
        )}
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