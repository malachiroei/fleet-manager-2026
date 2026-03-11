import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useComplianceAlerts } from '@/hooks/useDashboard';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ExternalLink,
  Settings
} from 'lucide-react';

function DashboardCard({ 
  title, 
  value, 
  icon: Icon, 
  link, 
  iconClassName,
  badge
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType; 
  link: string;
  iconClassName?: string;
  badge?: { count: number; variant: 'warning' | 'destructive' };
}) {
  return (
    <Link to={link} className="block h-full">
      <Card className="h-full min-h-[150px] border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div className="space-y-2">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ${iconClassName || 'text-primary'}`}>
              <Icon className="h-5 w-5" />
            </div>
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          </div>
          {badge && badge.count > 0 && (
            <Badge variant={badge.variant === 'warning' ? 'secondary' : 'destructive'}>
              {badge.count}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              כניסה
              <ChevronLeft className="h-4 w-4" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ComplianceCard() {
  const { t } = useTranslation();
  const { data: alerts, isLoading } = useComplianceAlerts();
  const expiredCount = alerts?.filter(a => a.status === 'expired').length || 0;
  const warningCount = alerts?.filter(a => a.status === 'warning').length || 0;
  const totalAlerts = expiredCount + warningCount;

  return (
    <Link to="/compliance" className="block h-full">
      <Card className="h-full min-h-[150px] border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div className="space-y-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('navigation.exceptionAlerts')}</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <div className="flex gap-1">
              {expiredCount > 0 && (
                <Badge variant="destructive">{expiredCount}</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="secondary">{warningCount}</Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold tracking-tight text-foreground">{totalAlerts}</div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                כניסה
                <ChevronLeft className="h-4 w-4" />
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const [showOdometerDialog, setShowOdometerDialog] = useState(false);
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const quickLinks = [
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

      {isMobile ? (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 gap-2.5">
              {quickLinks.map((action) => (
                <Link key={action.href} to={action.href} className="block">
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
              ))}

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

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">תמונת מצב</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-h-0 flex">
                {isLoading ? (
                  <Skeleton className="h-full w-full min-h-[130px]" />
                ) : (
                  <DashboardCard
                    title={t('navigation.fleetManagement')}
                    value={stats?.totalVehicles || 0}
                    icon={Car}
                    link="/vehicles"
                    iconClassName="text-blue-600"
                  />
                )}
              </div>

              <div className="min-h-0 flex">
                {isLoading ? (
                  <Skeleton className="h-full w-full min-h-[130px]" />
                ) : (
                  <DashboardCard
                    title={t('navigation.drivers')}
                    value={stats?.totalDrivers || 0}
                    icon={Users}
                    link="/drivers"
                    iconClassName="text-violet-600"
                  />
                )}
              </div>

              <div className="min-h-0 flex col-span-2">
                <ComplianceCard />
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">תמונת מצב</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="min-h-0 flex">
                {isLoading ? (
                  <Skeleton className="h-full w-full min-h-[150px]" />
                ) : (
                  <DashboardCard
                    title={t('navigation.fleetManagement')}
                    value={stats?.totalVehicles || 0}
                    icon={Car}
                    link="/vehicles"
                    iconClassName="text-blue-600"
                  />
                )}
              </div>

              <div className="min-h-0 flex">
                {isLoading ? (
                  <Skeleton className="h-full w-full min-h-[150px]" />
                ) : (
                  <DashboardCard
                    title={t('navigation.drivers')}
                    value={stats?.totalDrivers || 0}
                    icon={Users}
                    link="/drivers"
                    iconClassName="text-violet-600"
                  />
                )}
              </div>

              <div className="min-h-0 flex">
                <ComplianceCard />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {quickLinks.map((action) => (
                <Link key={action.href} to={action.href} className="block">
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
              ))}

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