import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardStats, useComplianceAlerts } from '@/hooks/useDashboard';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useViewAs } from '@/contexts/ViewAsContext';
import type { PermissionKey } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { invalidateFleetScopedQueries } from '@/lib/invalidateFleetQueryScope';
import { toast } from 'sonner';
import { getBrandLogoUrl } from '@/components/BrandLogo';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';

const statusCardConfig: Array<{
  titleKey: 'navigation.fleetManagement' | 'navigation.drivers' | 'navigation.exceptionAlerts' | 'dashboard.replacementVehicle';
  icon: React.ElementType;
  theme: 'blue' | 'purple' | 'orange' | 'teal';
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
    link: '/vehicles',
    permission: 'vehicles',
    featureFlagKey: 'dashboard_vehicles',
    getValue: (stats) => stats?.totalVehicles ?? 0,
  },
  {
    titleKey: 'navigation.drivers',
    icon: Users,
    theme: 'purple',
    link: '/drivers',
    permission: 'drivers',
    featureFlagKey: 'dashboard_drivers',
    getValue: (stats) => stats?.totalDrivers ?? 0,
  },
  {
    titleKey: 'navigation.exceptionAlerts',
    icon: AlertTriangle,
    theme: 'orange',
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
    link: '/handover/replacement',
    permission: 'handover',
    featureFlagKey: 'dashboard_replacement_car',
    getValue: () => '',
  },
];

const statusIconStroke: Record<'blue' | 'purple' | 'orange' | 'teal', string> = {
  blue: 'text-[#00f2ff]',
  purple: 'text-[#c4b5fd]',
  orange: 'text-[#ff9100]',
  teal: 'text-[#5eead4]',
};

function StatusCard({
  title,
  value,
  icon: Icon,
  link,
  theme,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  link: string;
  theme: 'purple' | 'blue' | 'orange' | 'teal';
}) {
  const glowClass =
    theme === 'blue'
      ? 'shadow-[0_0_22px_rgba(0,242,255,0.42)]'
      : theme === 'purple'
        ? 'shadow-[0_0_22px_rgba(167,139,250,0.38)]'
        : theme === 'orange'
          ? 'shadow-[0_0_26px_rgba(255,49,49,0.55),0_0_40px_rgba(255,145,0,0.25)]'
          : 'shadow-[0_0_22px_rgba(94,234,212,0.4)]';

  const iconStroke = statusIconStroke[theme];

  return (
    <Link
      to={link}
      className="block group cursor-pointer touch-manipulation min-w-0 relative z-10 min-h-[7.25rem] sm:min-h-[8rem] md:min-h-[8.5rem] xl:min-h-[11rem]"
      style={{ touchAction: 'manipulation', pointerEvents: 'auto' }}
    >
      <div
        className={`dashboard-cyber-status-card hud-status-card-surface status-card status-card--${theme} relative h-[clamp(7.25rem,18vh,9.25rem)] sm:h-[clamp(8rem,18vh,10rem)] md:h-[clamp(8.5rem,18vh,10.5rem)] xl:h-[clamp(10.5rem,18vh,14rem)] w-full rounded-2xl sm:rounded-3xl p-2 sm:p-2.5 xl:p-4 flex flex-col items-center justify-between hover:scale-[1.02] hover:-translate-y-0.5 overflow-hidden transition-all duration-300 border-t border-l border-white/[0.18] border-b border-r border-black/60 backdrop-blur-md ${glowClass}`}
        style={{ pointerEvents: 'none' } as React.CSSProperties}
      >
        <div className="hud-status-card-carbon pointer-events-none absolute inset-0 rounded-3xl opacity-85" aria-hidden />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/[0.08] via-transparent to-black/55 pointer-events-none" aria-hidden />
        <div
          className="pointer-events-none absolute inset-[1px] rounded-[1.2rem] border border-cyan-400/10 opacity-70"
          aria-hidden
        />

        <div className="relative z-10 mt-0.5 flex flex-col items-center gap-1.5 xl:gap-2">
          <div
            className={`status-card-icon-box dashboard-cyber-icon-dish inline-flex h-11 w-11 sm:h-12 sm:w-12 xl:h-14 xl:w-14 [@media(max-height:820px)]:h-11 [@media(max-height:820px)]:w-11 items-center justify-center rounded-2xl border bg-slate-950/65 backdrop-blur-md ${theme === 'blue' ? 'border-[#00f2ff]/55' : theme === 'purple' ? 'border-violet-400/50' : theme === 'orange' ? 'border-[#ff4d00]/65' : 'border-teal-400/50'}`}
          >
            <Icon
              className={`h-6 w-6 sm:h-7 sm:w-7 xl:h-8 xl:w-8 [@media(max-height:820px)]:h-6 [@media(max-height:820px)]:w-6 ${iconStroke}`}
              strokeWidth={1.35}
              aria-hidden
            />
          </div>
          <p className="hud-dashboard-label text-[11px] sm:text-xs md:text-sm font-medium tracking-wide truncate max-w-full">
            {title}
          </p>
        </div>

        {value !== '' && (
          <div className="relative z-10 text-center">
            <p className="hud-kpi-value text-2xl sm:text-3xl md:text-4xl xl:text-5xl [@media(max-height:820px)]:xl:text-4xl font-bold tracking-tight text-white tabular-nums">
              {value}
            </p>
          </div>
        )}

        <div className="relative z-10 mb-1 flex items-center gap-1 text-[10px] sm:text-xs font-medium hud-dashboard-muted">
          <div className="status-card-entry-btn flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full border border-white/20 bg-black/25 backdrop-blur-sm">
            <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:h-3.5 opacity-90" strokeWidth={1.5} />
          </div>
          <span className="tracking-wide">כניסה</span>
        </div>

        <div className="status-card-shine pointer-events-none absolute -inset-full h-full w-1/2 z-[5] block transform -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0" aria-hidden />
        <div
          className={`pointer-events-none absolute bottom-0 left-3 right-3 h-[3px] rounded-full opacity-95 ${theme === 'blue' ? 'bg-[#00ffff] shadow-[0_0_20px_#00ffff,0_0_40px_rgba(0,255,255,0.35)]' : theme === 'purple' ? 'bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.9)]' : theme === 'orange' ? 'bg-gradient-to-r from-[#ff3131] via-[#ff4d00] to-[#ff9100] shadow-[0_0_22px_rgba(255,77,0,0.95)]' : 'bg-teal-300 shadow-[0_0_18px_rgba(94,234,212,0.9)]'}`}
          aria-hidden
        />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: alerts } = useComplianceAlerts();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const {
    user,
    profile,
    hasPermission,
    isAdmin,
    isManager,
    isDriver,
    roles: userRoles,
    loading,
    activeOrgId,
  } = useAuth();
  const { effectiveOrgId } = useImpersonationFleetScope();
  const { viewAsEmail } = useViewAs();
  const {
    data: featureFlags,
    isPending: flagsPending,
    isPlaceholderData: flagsPlaceholder,
  } = useFeatureFlags();
  const { canAccessPermission } = usePermissions();
  const showDashboardTreatmentCard = false;
  const showDashboardTestCard = false;
  const showMaintenanceFormCard = false;
  /** כרטיס «התראות חריגה» + מרכז ציות: רק פג תוקף (ללא אזהרת 30 יום) */
  const totalAlerts = (alerts?.filter((a) => a.status === 'expired').length) ?? 0;
  const isStatsLoading = isLoading || !stats;
  /** placeholderData ב-useFeatureFlags מדליק כל הדגלים — לא לרנדר גייטים לפני נתונים אמיתיים */
  const isInitialUiLoading = loading || flagsPending || flagsPlaceholder;

  const dashboardScopeRemountKey = useMemo(
    () =>
      [user?.id ?? '', profile?.org_id ?? '', activeOrgId ?? '', effectiveOrgId ?? '', (viewAsEmail ?? '').trim()].join(
        '|',
      ),
    [user?.id, profile?.org_id, activeOrgId, effectiveOrgId, viewAsEmail],
  );

  const scopeRefreshKeyRef = useRef<string | null>(null);
  const scopeInvalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const key = [
      user?.id ?? '',
      activeOrgId ?? '',
      profile?.org_id ?? '',
      effectiveOrgId ?? '',
      (viewAsEmail ?? '').trim(),
    ].join('|');
    if (scopeRefreshKeyRef.current === key) return;
    scopeRefreshKeyRef.current = key;
    if (scopeInvalidateTimerRef.current != null) {
      clearTimeout(scopeInvalidateTimerRef.current);
    }
    scopeInvalidateTimerRef.current = window.setTimeout(() => {
      scopeInvalidateTimerRef.current = null;
      invalidateFleetScopedQueries(queryClient);
    }, 160);
    return () => {
      if (scopeInvalidateTimerRef.current != null) {
        clearTimeout(scopeInvalidateTimerRef.current);
        scopeInvalidateTimerRef.current = null;
      }
    };
  }, [activeOrgId, viewAsEmail, queryClient]);

  const email = user?.email || '';
  const isMainAdmin = email.toLowerCase() === 'malachiroei@gmail.com';
  const isOwner = isMainAdmin;
  /** קישורי quick action עם adminOnly — לא רק malachiroei; כל אדמין/מנהל צי בארגון */
  const sessionEmailDash = resolveSessionEmail(profile, user);
  const isElevatedOrgAdmin =
    isMainAdmin ||
    isPlatformSuperOwnerEmail(sessionEmailDash) ||
    isFleetOrgAdminFallbackEmail(sessionEmailDash) ||
    hasPermission('admin_access') ||
    isAdmin ||
    isManager ||
    profile?.is_system_admin === true;
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
    {
      title: 'מרכז ציות (אדמין)',
      href: '/admin/compliance',
      icon: ClipboardList,
      permission: 'compliance',
      featureFlagKey: 'qa_admin_compliance_tower',
    },
  ];

  // Keep "Mileage Report" behind permission, but add a forced override to unblock staging:
  // - If `profile.email` is exactly malachiroei@gmail.com, always show it (independent of permissions).
  // - Permissions may be stored as an array or an object map.
  const forceMileageForMalachiroei =
    (profile?.email ?? user?.email ?? '').trim().toLowerCase() === 'malachiroei@gmail.com';
  const isRoeiAdmin = forceMileageForMalachiroei;
  const canManageTeamUi = isMainAdmin || hasPermission('manage_team') || isAdmin || isManager;

  const canReportMileageFromPermissions = Array.isArray(profile?.permissions)
    ? profile.permissions
        .map((p) => String(p).trim().toLowerCase())
        .includes('report_mileage')
    : profile?.permissions?.report_mileage === true;

  const canReportMileage = forceMileageForMalachiroei || canReportMileageFromPermissions;

  const visibleStatusCards = useMemo(() => {
    return statusCardConfig.filter((card) => {
      if (!canAccessPermission(card.permission)) return false;
      return isFeatureEnabled(featureFlags, card.featureFlagKey);
    });
  }, [canAccessPermission, featureFlags]);

  const visibleQuickLinksByFlags = useMemo(() => {
    return baseQuickLinks.filter((a) => {
      if (!canAccessPermission(a.permission)) return false;
      if (!a.featureFlagKey) return true;
      return isFeatureEnabled(featureFlags, a.featureFlagKey);
    });
  }, [baseQuickLinks, canAccessPermission, featureFlags]);

  const quickLinks = visibleQuickLinksByFlags.filter((a) => {
    if (a.href === '/report-mileage') return canReportMileage;
    if (a.href === '/team') return canManageTeamUi;
    if (a.href === '/admin/compliance') return Boolean(isAdmin);
    if (a.adminOnly && !isElevatedOrgAdmin) return false;
    return true;
  });


  const devFeatureToast = () => {
    toast.info('פונקציה זו בפיתוח');
  };

  return (
    <div className="dashboard-cyber-page dashboard-page-hud relative isolate z-[1] -mx-6 w-[calc(100%+3rem)] max-w-none shrink-0 px-6 pt-1 pb-2 md:pb-3 [@media(max-height:820px)]:pt-0 [@media(max-height:820px)]:pb-1">
      <div className="dashboard-cyber-lens dashboard-cyber-lens--top select-none" aria-hidden />
      <div className="dashboard-cyber-lens dashboard-cyber-lens--bottom select-none" aria-hidden />
      <div className="dashboard-cyber-vignette select-none" aria-hidden />
      <div className="dashboard-cyber-grid select-none" aria-hidden />

      <div
        key={dashboardScopeRemountKey}
        className="container relative z-[2] mx-auto max-w-[1920px] space-y-3 md:space-y-4 py-2.5 md:py-3 pb-10 sm:pb-8 [@media(max-height:820px)]:py-1 [@media(max-height:820px)]:pb-4 [@media(max-height:820px)]:space-y-2"
      >
      <div className="hidden xl:block [@media(max-height:820px)]:hidden dashboard-hud-header-card rounded-2xl sm:rounded-3xl border-t border-l border-white/[0.16] border-b border-r border-black/55 p-3 sm:p-4 md:p-5 relative overflow-hidden">
        <div className="hud-status-card-carbon pointer-events-none absolute inset-0 rounded-3xl opacity-50" aria-hidden />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="dashboard-cyber-hero-title hidden sm:block relative text-xl md:text-2xl font-bold tracking-tight text-white">
              {t('dashboard.title')}
            </h1>
            <p className="relative text-[11px] sm:text-xs md:text-sm hud-dashboard-label mt-0.5 sm:mt-1.5 max-w-2xl leading-snug sm:leading-relaxed">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="hidden h-16 w-32 shrink-0 overflow-hidden rounded-lg sm:flex md:h-[4.75rem] md:w-44">
            <img
              src={getBrandLogoUrl()}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
              decoding="async"
              aria-hidden
            />
          </div>
        </div>
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

      <section className="dashboard-status-stage dashboard-cyber-stage p-3 sm:p-4 md:p-6 xl:p-8 pb-3 space-y-4 xl:space-y-6 [@media(max-height:820px)]:p-2.5 [@media(max-height:820px)]:pb-2 [@media(max-height:820px)]:space-y-3 relative z-[20]">
        {isStatsLoading || flagsPlaceholder ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton
                key={i}
                className="h-28 sm:h-32 w-full rounded-2xl sm:rounded-3xl min-h-[6.75rem]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                  />
                );
              })}
          </div>
        )}
      </section>

      {isMobile ? (
        <>
          <section className="space-y-3 pb-4">
            <h2 className="dashboard-cyber-section-title text-base font-semibold text-white tracking-tight">
              {t('dashboard.quickActions')}
            </h2>
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
                    <div className="dashboard-qa-icon">
                      <Wrench className="h-4.5 w-4.5" strokeWidth={1.35} />
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
                    <div className="dashboard-qa-icon">
                      <FlaskConical className="h-4.5 w-4.5" strokeWidth={1.35} />
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
                      <div className="dashboard-qa-icon">
                        <ClipboardList className="h-4.5 w-4.5" strokeWidth={1.35} />
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
                      <div className="dashboard-qa-icon dashboard-qa-icon--disabled">
                        <action.icon className="h-4.5 w-4.5" strokeWidth={1.35} />
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
                        <div className="dashboard-qa-icon">
                          <action.icon className="h-4.5 w-4.5" strokeWidth={1.35} />
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

            </div>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-3 [@media(max-height:820px)]:space-y-2">
            <h2 className="dashboard-cyber-section-title text-lg font-semibold text-white tracking-tight">
              {t('dashboard.quickActions')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 [@media(max-height:820px)]:gap-2">
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
                    <div className="dashboard-qa-icon">
                      <Wrench className="h-5 w-5" strokeWidth={1.35} />
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
                    <div className="dashboard-qa-icon">
                      <FlaskConical className="h-5 w-5" strokeWidth={1.35} />
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
                      <div className="dashboard-qa-icon">
                        <ClipboardList className="h-5 w-5" strokeWidth={1.35} />
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
                      <div className="dashboard-qa-icon dashboard-qa-icon--disabled">
                        <action.icon className="h-5 w-5" strokeWidth={1.35} />
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
                        <div className="dashboard-qa-icon">
                          <action.icon className="h-5 w-5" strokeWidth={1.35} />
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

            </div>
          </section>
        </>
      )}

      

      </div>
    </div>
  );
}