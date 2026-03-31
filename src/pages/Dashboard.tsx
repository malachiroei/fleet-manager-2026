import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useComplianceAlerts } from '@/hooks/useDashboard';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useViewAs } from '@/contexts/ViewAsContext';
import type { PermissionKey } from '@/lib/permissions';
import { isFeatureEnabled } from '@/hooks/useFeatureFlags';
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
  UserCog,
  Wrench,
  FlaskConical,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const statusCardConfig: Array<{
  titleKey: 'navigation.fleetManagement' | 'navigation.drivers' | 'navigation.exceptionAlerts' | 'dashboard.replacementVehicle';
  icon: React.ElementType;
  theme: 'blue' | 'purple' | 'orange' | 'teal';
  color: string;
  link: string;
  permission?: PermissionKey;
  featureFlagKey: string;
  getValue: (stats: { totalVehicles?: number; totalDrivers?: number } | null, alertCount?: number) => string | number;
  alertKey?: 'alert';
}> = [
  {
    titleKey: 'navigation.fleetManagement',
    icon: Car,
    theme: 'blue',
    color: 'from-blue-500 to-cyan-400',
    link: '/vehicles',
    permission: 'vehicles',
    featureFlagKey: 'dashboard_vehicles',
    getValue: (stats) => stats?.totalVehicles ?? 0,
  },
  {
    titleKey: 'navigation.drivers',
    icon: Users,
    theme: 'purple',
    color: 'from-purple-500 to-indigo-600',
    link: '/drivers',
    permission: 'drivers',
    featureFlagKey: 'dashboard_drivers',
    getValue: (stats) => stats?.totalDrivers ?? 0,
  },
  {
    titleKey: 'navigation.exceptionAlerts',
    icon: AlertTriangle,
    theme: 'orange',
    color: 'from-orange-500 to-yellow-400',
    link: '/compliance',
    permission: 'compliance',
    featureFlagKey: 'dashboard_exception_alerts',
    getValue: (_, alertCount) => alertCount ?? 0,
    alertKey: 'alert',
  },
  {
    titleKey: 'dashboard.replacementVehicle',
    icon: Repeat,
    theme: 'teal',
    color: 'from-teal-400 to-emerald-500',
    link: '/handover/replacement',
    permission: 'handover',
    featureFlagKey: 'dashboard_replacement_car',
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
    <Link
      to={link}
      className="block group cursor-pointer touch-manipulation min-w-0 relative z-10 min-h-[11rem] sm:min-h-[11rem] md:min-h-[14rem]"
      style={{ touchAction: 'manipulation', pointerEvents: 'auto' }}
    >
      <div
        className={`status-card status-card--${theme} relative h-40 sm:h-44 md:h-56 w-full rounded-2xl bg-white/5/80 backdrop-blur-lg border border-white/10 p-3 sm:p-4 flex flex-col items-center justify-between hover:scale-[1.03] hover:-translate-y-1 overflow-hidden transition-all duration-300 ${glowClass}`}
        style={{ pointerEvents: 'none' } as React.CSSProperties}
      >
        {/* השתקפות + גרדיאנט פנימי */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.07] via-black/40 to-black/80 opacity-80 pointer-events-none" aria-hidden />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-black/50 via-transparent to-white/[0.03] pointer-events-none" aria-hidden />

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

        <div className="status-card-shine pointer-events-none absolute -inset-full h-full w-1/2 z-[5] block transform -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0" aria-hidden />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: alerts } = useComplianceAlerts();
  const [showOdometerDialog, setShowOdometerDialog] = useState(false);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { user, profile, hasPermission, isAdmin, isManager, isDriver, roles: userRoles, loading, activeOrgId } = useAuth();
  const { viewAsEmail } = useViewAs();
  const { data: features, isPending: flagsPending } = useFeatureFlags();
  const { canAccessUi } = usePermissions();
  const showDashboardTreatmentCard = false;
  const showDashboardTestCard = false;
  const showMaintenanceFormCard = false;
  const totalAlerts = (alerts?.filter(a => a.status === 'expired' || a.status === 'warning').length) ?? 0;
  const isStatsLoading = isLoading || !stats;
  const isInitialUiLoading = loading || flagsPending;
  const showTempTestButton = isFeatureEnabled(features, 'TEMP_TEST_BUTTON');

  console.log('Current Active Org ID:', activeOrgId);

  useEffect(() => {
    if (!activeOrgId && !viewAsEmail) return;
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['compliance-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
  }, [activeOrgId, viewAsEmail, queryClient]);

  const email = user?.email || '';
  const isMainAdmin = email.toLowerCase() === 'malachiroei@gmail.com';
  const isSystemAdmin = ['malachiroei@gmail.com', 'ravidmalachi@gmail.com'].includes(email);
  const isOwner = isMainAdmin;
  const effectiveIsAdmin = isOwner || isAdmin;
  const { data: pendingUsersCount = 0 } = useQuery({
    queryKey: ['pending-users-count'],
    enabled: isMainAdmin,
    placeholderData: 0,
    refetchInterval: 5000,
    queryFn: async (): Promise<number> => {
      try {
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval');

        if (error) throw error;
        return typeof count === 'number' && Number.isFinite(count) ? count : 0;
      } catch (err) {
        console.error('Failed to load pending users count', err);
        return 0;
      }
    },
  });

  console.log('Dashboard userRole', {
    userRoles: userRoles ?? [],
    userRole: userRoles?.join(', ') ?? '(none)',
    email: email || '(no email)',
    viewAsEmail,
    isSystemAdmin,
    isAdmin,
    effectiveIsAdmin,
    isManager,
    isDriver,
    loadingAuth: loading,
  });

  // Base quick actions; filtering happens afterwards
  const baseQuickLinks: {
    title: string;
    href: string;
    icon: React.ElementType;
    disabled?: boolean;
    permission?: PermissionKey;
    adminOnly?: boolean;
    showPendingBadge?: boolean;
    featureFlagKey?: string;
  }[] = [
    {
      title: 'דיווח קילומטראז׳',
      href: '/report-mileage',
      icon: Gauge,
      permission: 'report_mileage',
      featureFlagKey: 'qa_report_mileage',
    },
    {
      title: 'עדכון טיפול',
      href: '/vehicles/service-update',
      icon: Wrench,
      permission: 'vehicles',
      featureFlagKey: 'qa_service_update',
    },
    {
      title: t('navigation.procedure6Complaints'),
      href: '/procedure6-complaints',
      icon: AlertTriangle,
      permission: 'procedure6_complaints',
      featureFlagKey: 'qa_procedure6_complaints',
    },
    {
      title: 'טפסים',
      href: '/forms',
      icon: FileText,
      permission: 'forms',
      featureFlagKey: 'qa_forms',
    },
    {
      title: 'הגדרות מערכת',
      href: '/admin/settings',
      icon: Settings,
      adminOnly: true,
      featureFlagKey: 'qa_admin_settings',
    },
    {
      title: t('navigation.reportGeneration', { defaultValue: 'הפקת דוחות' }),
      href: '/reports',
      icon: BarChart3,
      permission: 'reports',
      featureFlagKey: 'qa_reports',
    },
    {
      title: t('navigation.parkingReports'),
      href: '/reports/scan',
      icon: FileText,
      permission: 'reports',
      featureFlagKey: 'qa_parking_reports',
    },
    {
      title: t('navigation.accidents'),
      href: '/compliance',
      icon: Plus,
      permission: 'compliance',
      featureFlagKey: 'qa_accidents',
    },
    {
      title: t('navigation.vehicleDelivery'),
      href: '/handover/delivery',
      icon: Truck,
      permission: 'vehicle_delivery',
      featureFlagKey: 'qa_vehicle_delivery',
    },
    {
      title: 'רכב חליפי',
      href: '/handover/replacement',
      icon: Repeat,
      permission: 'replacement_car',
      featureFlagKey: 'qa_replacement_car',
    },
    {
      title: 'ניהול צוות',
      href: '/team',
      icon: UserCog,
      permission: 'manage_team',
      featureFlagKey: 'qa_team',
      showPendingBadge: true,
    },
    {
      title: 'ניהול משתמשים',
      href: '/admin/users',
      icon: Users,
      adminOnly: true,
      permission: 'admin_access',
      featureFlagKey: 'qa_users',
    },
  ];

  // Keep "Mileage Report" behind permission, but add a forced override to unblock staging:
  // - If `profile.email` is exactly malachiroei@gmail.com, always show it (independent of permissions).
  // - Permissions may be stored as an array or an object map.
  const forceMileageForMalachiroei =
    (profile?.email ?? user?.email ?? '').trim().toLowerCase() === 'malachiroei@gmail.com';
  const isRoeiAdmin = forceMileageForMalachiroei;

  const canReportMileageFromPermissions = Array.isArray(profile?.permissions)
    ? profile.permissions
        .map((p) => String(p).trim().toLowerCase())
        .includes('report_mileage')
    : profile?.permissions?.report_mileage === true;

  const canReportMileage = forceMileageForMalachiroei || canReportMileageFromPermissions;

  const visibleStatusCards = useMemo(() => {
    return statusCardConfig.filter((card) =>
      canAccessUi({ permission: card.permission, featureKey: card.featureFlagKey }),
    );
  }, [canAccessUi]);

  const visibleQuickLinksByFlags = useMemo(() => {
    return baseQuickLinks.filter((a) => {
      return canAccessUi({ permission: a.permission, featureKey: a.featureFlagKey });
    });
  }, [baseQuickLinks, canAccessUi]);

  const quickLinks = visibleQuickLinksByFlags.filter((a) => {
    if (a.href === '/report-mileage') return canReportMileage;
    if (a.href === '/team') return isRoeiAdmin;
    if (a.adminOnly && !isMainAdmin) return false;
    return true;
  });


  const devFeatureToast = () => {
    toast.info('פונקציה זו בפיתוח');
  };

  return (
    <div className="container py-6 md:py-8 pb-32 sm:pb-8 space-y-6 md:space-y-8 relative z-[1]">
      {showTempTestButton ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            className="h-11 px-6 text-base"
            onClick={() => toast.info('כפתור בדיקה זמני')}
          >
            כפתור בדיקה זמני
          </Button>
        </div>
      ) : null}
      <div className="rounded-2xl border bg-card p-4 md:p-6">
        <h1 className="hidden sm:block text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          {t('dashboard.title')}
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-0.5 sm:mt-1.5">
          {t('dashboard.subtitle')}
        </p>
      </div>

      {!isStatsLoading && stats && stats.totalVehicles === 0 && stats.totalDrivers === 0 && (
        <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
          <CardContent className="p-6 md:p-8 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{t('dashboard.emptyStateTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('dashboard.emptyStateDescription')}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              {hasPermission('vehicles') && (
                <Button asChild variant="default" size="sm">
                  <Link to="/vehicles/add">
                    <Car className="h-4 w-4 ml-1.5" />
                    {t('dashboard.addFirstVehicle')}
                  </Link>
                </Button>
              )}
              {hasPermission('drivers') && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/drivers/add">
                    <Users className="h-4 w-4 ml-1.5" />
                    {t('dashboard.addFirstDriver')}
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="dashboard-status-stage p-4 sm:p-6 md:p-10 pb-6 space-y-6 relative z-[20]">
        {isStatsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                className="h-40 w-full rounded-2xl min-h-[10rem]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 sm:gap-4">
            {visibleStatusCards
              .map((card) => {
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
          <section className="space-y-3 pb-4">
            <h2 className="text-base font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 gap-3">
              {isInitialUiLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </>
              ) : null}
              {showDashboardTreatmentCard ? (
                <Card
                  role="button"
                  tabIndex={0}
                  className="h-full min-h-[48px] cursor-pointer touch-manipulation border-primary/35 bg-primary/[0.07] shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/50"
                  style={{ touchAction: 'manipulation' }}
                  onClick={() => devFeatureToast()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      devFeatureToast();
                    }
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                      <Wrench className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">עדכן טיפול</p>
                      <span className="text-[11px] text-muted-foreground">בקרוב</span>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ) : null}
              {showDashboardTestCard ? (
                <Card
                  role="button"
                  tabIndex={0}
                  className="h-full min-h-[48px] cursor-pointer touch-manipulation border-primary/35 bg-primary/[0.07] shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/50"
                  style={{ touchAction: 'manipulation' }}
                  onClick={() => devFeatureToast()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      devFeatureToast();
                    }
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                      <FlaskConical className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">כפתור בדיקה</p>
                      <span className="text-[11px] text-muted-foreground">בקרוב</span>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ) : null}
              {showMaintenanceFormCard ? (
                <Link
                  to="/maintenance/add"
                  className="block touch-manipulation cursor-pointer"
                  style={{ touchAction: 'manipulation' }}
                >
                  <Card className="h-full min-h-[48px] transition-all duration-200 hover:shadow-md border-primary/35 bg-primary/[0.07] shadow-sm hover:border-primary/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <ClipboardList className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">עדכן טיפול</p>
                        <span className="text-[11px] text-muted-foreground">טופס תחזוקה — הוספת רישום</span>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ) : null}
              {!isInitialUiLoading ? quickLinks.map((action, idx) =>
                action.disabled ? (
                  <Card key={`${action.title}-${idx}`} className="h-full cursor-not-allowed opacity-55 touch-manipulation min-h-[48px]">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <action.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-muted-foreground truncate">{action.title}</p>
                        <p className="text-[11px] text-muted-foreground">בקרוב</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Link key={action.href + idx} to={action.href} className="block touch-manipulation cursor-pointer" style={{ touchAction: 'manipulation' }}>
                    <Card className="h-full transition-all duration-200 hover:shadow-md min-h-[48px] cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <action.icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{action.title}</p>
                          {isMainAdmin && action.showPendingBadge && pendingUsersCount > 0 && (
                            <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 text-[11px] font-semibold text-white px-2">
                              {pendingUsersCount}
                            </span>
                          )}
                        </div>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                )
              ) : null}

              {hasPermission('mileage_update') && (
                <Card className="h-full border-dashed touch-manipulation min-h-[48px] cursor-pointer" style={{ touchAction: 'manipulation' }}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Gauge className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{t('navigation.mileageUpdate')}</p>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground touch-manipulation cursor-pointer min-h-[44px] min-w-[44px] inline-flex items-center"
                        style={{ touchAction: 'manipulation' }}
                        onClick={() => setShowOdometerDialog(true)}
                      >
                        פתיחה מהירה
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{t('dashboard.quickActions')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {isInitialUiLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[48px] w-full rounded-xl" />
                  ))}
                </>
              ) : null}
              {showDashboardTreatmentCard ? (
                <Card
                  role="button"
                  tabIndex={0}
                  className="h-full min-h-[48px] cursor-pointer touch-manipulation border-primary/35 bg-primary/[0.07] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50"
                  style={{ touchAction: 'manipulation' }}
                  onClick={() => devFeatureToast()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      devFeatureToast();
                    }
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                      <Wrench className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">טיפול רכב</p>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        בקרוב
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {showDashboardTestCard ? (
                <Card
                  role="button"
                  tabIndex={0}
                  className="h-full min-h-[48px] cursor-pointer touch-manipulation border-primary/35 bg-primary/[0.07] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50"
                  style={{ touchAction: 'manipulation' }}
                  onClick={() => devFeatureToast()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      devFeatureToast();
                    }
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">כפתור בדיקה</p>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        בקרוב
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {showMaintenanceFormCard ? (
                <Link
                  to="/maintenance/add"
                  className="block touch-manipulation cursor-pointer"
                  style={{ touchAction: 'manipulation' }}
                >
                  <Card className="h-full min-h-[48px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-primary/35 bg-primary/[0.07] shadow-sm hover:border-primary/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">עדכן טיפול</p>
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          טופס תחזוקה — הוספת רישום
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : null}
              {!isInitialUiLoading ? quickLinks.map((action, idx) =>
                action.disabled ? (
                  <Card key={`${action.title}-${idx}`} className="h-full cursor-not-allowed opacity-55 touch-manipulation">
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
                  <Link key={action.href + idx} to={action.href} className="block touch-manipulation cursor-pointer" style={{ touchAction: 'manipulation' }}>
                    <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md min-h-[48px] cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <action.icon className="h-5 w-5" />
                        </div>
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{action.title}</p>
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            כניסה
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        {isMainAdmin && action.showPendingBadge && pendingUsersCount > 0 && (
                          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 text-[11px] font-semibold text-white px-2">
                            {pendingUsersCount}
                          </span>
                        )}
                      </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              ) : null}

              {hasPermission('mileage_update') && (
                <Card className="h-full border-dashed touch-manipulation min-h-[48px] cursor-pointer" style={{ touchAction: 'manipulation' }}>
                  <CardContent className="p-4 h-full flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Gauge className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{t('navigation.mileageUpdate')}</p>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground touch-manipulation cursor-pointer min-h-[44px] inline-flex items-center"
                        style={{ touchAction: 'manipulation' }}
                        onClick={() => setShowOdometerDialog(true)}
                      >
                        פתיחה מהירה
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
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