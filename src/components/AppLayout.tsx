import { type ElementType, type MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganizations';
import { useTeamMembersForSwitcher } from '@/hooks/useTeam';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AIChatAssistant } from './AIChatAssistant';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Building2, LogOut, Home, ArrowRight, ChevronDown, Building, Settings, UserCog, Menu } from 'lucide-react';
import { PwaInstallButton } from './PwaInstallButton';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getBrandLogoUrl } from '@/components/BrandLogo';
import { supabase } from '@/integrations/supabase/client';
import {
  version as bundleVersion,
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
} from '@/constants/version';
import { isFleetManagerProHostname, normalizeVersion } from '@/lib/versionManifest';
import { getFleetEnvironmentBannerKind } from '@/lib/fleetAppStagingEnvironment';
import { isFleetBootstrapOwnerEmail, resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';
import type { TeamMemberSummary } from '@/hooks/useTeam';

/** קישור מנהל ראשי ↔ מנהל צי ↔ נהג — כש־RLS לא מחזיר את כל ה־profiles במחליף */
const MAIN_ADMIN_SWITCHER_EMAIL = 'malachiroei@gmail.com';
const RAVID_MANAGER_EMAIL = 'ravidmalachi@gmail.com';
const ROEI_DRIVER_EMAIL = 'roeima21@gmail.com';

function augmentSwitcherMembers(
  teamMembers: TeamMemberSummary[],
  opts: {
    selfEmail: string;
    isMainAdmin: boolean;
    isRavid: boolean;
    activeOrgId: string | null;
    mainFleetOrgId: string | null;
    profileOrgId: string | null | undefined;
  },
): TeamMemberSummary[] {
  const self = opts.selfEmail.toLowerCase();
  let visible = teamMembers.filter(
    (m) =>
      m.email &&
      m.email.toLowerCase() !== self &&
      m.email.toLowerCase() !== MAIN_ADMIN_SWITCHER_EMAIL,
  );
  visible = visible.filter((m) => (m.full_name || '').trim() !== 'רביד צי רכבים');

  if (opts.isMainAdmin) {
    const allow = new Set([RAVID_MANAGER_EMAIL]);
    visible = visible.filter((m) => m.email && allow.has(m.email.toLowerCase()));
  }

  const orgForRavid = opts.mainFleetOrgId ?? opts.profileOrgId ?? opts.activeOrgId ?? null;
  if (opts.isMainAdmin && !visible.some((m) => m.email?.toLowerCase() === RAVID_MANAGER_EMAIL)) {
    visible = [
      ...visible,
      {
        id: 'synthetic-ravid',
        full_name: 'רביד מלחי',
        email: RAVID_MANAGER_EMAIL,
        org_id: orgForRavid,
        source: 'profile',
      },
    ];
  }

  const orgForRoei = opts.activeOrgId ?? opts.profileOrgId ?? null;
  if (opts.isRavid && !visible.some((m) => m.email?.toLowerCase() === ROEI_DRIVER_EMAIL)) {
    visible = [
      ...visible,
      {
        id: 'synthetic-roeima21',
        full_name: 'רועי (נהג)',
        email: ROEI_DRIVER_EMAIL,
        org_id: orgForRoei,
        source: 'profile',
      },
    ];
  }

  return visible;
}

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const {
    user,
    signOut,
    profile,
    activeOrgId,
    memberOrganizations,
    setActiveOrgId,
    isAdmin,
    isManager,
    isDriver,
    hasPermission,
  } = useAuth();
  const isDriverOnlyHeader = Boolean(isDriver && !isManager && !isAdmin);
  /** כולל bootstrap / is_system_admin כש־user_roles ריק בפרו */
  const isElevatedHeader =
    isAdmin ||
    isManager ||
    profile?.is_system_admin === true ||
    isFleetBootstrapOwnerEmail(resolveSessionEmail(profile, user));
  /** מנהל ארגון / מנהל צי — כפתורי ניהול בכותרת (ארגון, צוות) */
  const isOrgAdminOrManager = isElevatedHeader && !isDriverOnlyHeader;
  /** בולטים בזהב/ענבר כדי שלא יפספסו */
  const managementNavClass =
    'relative z-[9999] !flex items-center justify-center border-2 !border-solid !border-[gold] bg-amber-500/25 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.45)] hover:bg-amber-500/40 hover:text-white hover:!border-[#ffd700]';
  const email = (user?.email ?? '').toLowerCase();
  const name = (profile?.full_name?.trim()) || user?.user_metadata?.full_name || email.split('@')[0] || '';
  const initials = (name || email || '?').slice(0, 2).toUpperCase();
  const isRtl = i18n.dir() === 'rtl';
  const { tryNavigate, getIsDirty, getLastPath } = useVehicleSpecDirty();
  const isHomeActive = location.pathname === '/';
  const { data: organization } = useOrganization(activeOrgId ?? null);
  const orgName = organization?.name?.trim() ?? '';
  const { data: teamMembers = [], error: teamMembersError } = useTeamMembersForSwitcher(activeOrgId ?? null as any);
  const { viewAsEmail, setViewAsEmail, viewAsProfile } = useViewAs();

  /** קיר קשיח ייצור: fleet-manager-pro.com + www (גרסה בכותרת וכו') */
  const isProduction = isFleetManagerProHostname();
  /** באנר סביבה: לפי פרויקט Supabase (FLEET_*_REF) + hostname — לא רק localhost */
  const fleetEnvBannerKind =
    typeof window !== 'undefined' ? getFleetEnvironmentBannerKind() : 'none';
  const showFleetEnvironmentBanner = fleetEnvBannerKind !== 'none';

  /**
   * ייצור: אחרי `FLEET_PRO_ACK_VERSION_UPDATED_EVENT` — אם `fleet-pro-acknowledged-version` בפועל השתנה,
   * רענון קשיח כדי לסנכרן gates / מצב React עם localStorage (פרסום, שמירת הרשאות, «עדכן עכשיו»).
   */
  const lastProAckSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isProduction) return;
    try {
      lastProAckSeenRef.current = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY);
    } catch {
      lastProAckSeenRef.current = null;
    }
    const onAckEvent = () => {
      let next = '';
      try {
        next = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY)?.trim() ?? '';
      } catch {
        return;
      }
      const prev = (lastProAckSeenRef.current ?? '').trim();
      if (next && next !== prev) {
        lastProAckSeenRef.current = next;
        window.location.reload();
      }
    };
    window.addEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, onAckEvent);
    return () => window.removeEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, onAckEvent);
  }, [isProduction]);

  /** מוצג בכותרת — תמיד גרסת הבנדל מ־package.json (זהה לשורת «מידע מערכת») */
  const headerDisplayVersion = useMemo(() => normalizeVersion(bundleVersion), [bundleVersion]);

  useEffect(() => {
    console.log('TeamMembers for Org:', activeOrgId, {
      teamMembers,
      teamMembersError,
    });
  }, [activeOrgId, teamMembers, teamMembersError]);

  // When impersonating, ensure the active org is taken from the target user's org_members.
  // This prevents stale org context (and blank dashboard due to orgId=null) after switching users.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const viewAsAuthId = viewAsProfile?.id ?? viewAsProfile?.user_id;
      if (!viewAsEmail || !viewAsAuthId) return;

      try {
        const { data: membership, error } = await (supabase as any)
          .from('org_members')
          .select('org_id')
          .eq('user_id', viewAsAuthId)
          .maybeSingle();
        const nextOrgId = (membership as any)?.org_id as string | undefined;
        if (!cancelled && nextOrgId && activeOrgId !== nextOrgId) {
          console.log('[Impersonation] Setting activeOrgId from org_members', {
            viewAsEmail,
            nextOrgId,
          });
          setActiveOrgId(nextOrgId);
        }
      } catch (err) {
        console.warn('[Impersonation] Failed to resolve org_members org_id', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewAsEmail, viewAsProfile?.id, viewAsProfile?.user_id, activeOrgId, setActiveOrgId]);

  console.log('CURRENT PROFILE STATUS:', profile?.status);

  const isMainAdmin = email === MAIN_ADMIN_SWITCHER_EMAIL;
  const canManageTeamUi = isMainAdmin || hasPermission('manage_team') || isOrgAdminOrManager;
  const canManageOrgUi = isMainAdmin || hasPermission('admin_access') || isOrgAdminOrManager;

  /** Gold header buttons (Roei Admin + Ravid Manager). */
  const canAccessGoldenManagementLinks = !isDriverOnlyHeader && (canManageOrgUi || canManageTeamUi);
  const isDriverRoei = email === ROEI_DRIVER_EMAIL;
  const isRavid = email === RAVID_MANAGER_EMAIL;

  const viewAsBannerVisible = (isMainAdmin || isRavid) && Boolean(viewAsEmail);
  /** באנר staging מיני — גובה ~h-6 */
  const headerStickyTopClass = showFleetEnvironmentBanner
    ? viewAsBannerVisible
      ? 'top-16'
      : 'top-6'
    : 'top-0';
  const viewAsStickyTopClass = showFleetEnvironmentBanner ? 'top-6' : 'top-0';

  const mainFleetOrgId = useMemo(() => {
    // Prefer explicit Main Fleet org id when present.
    const explicitMainFleet = memberOrganizations.find((o) => o.id === FALLBACK_MAIN_FLEET_ORG_ID);
    if (explicitMainFleet) return explicitMainFleet.id;

    const mainFleet = memberOrganizations.find((o) => {
      const name = (o.name ?? '').toLowerCase();
      // Prefer explicit English name when available, otherwise fallback to the Hebrew "Ravid fleet" naming.
      return (
        (name.includes('main') && name.includes('fleet')) ||
        name.includes('רביד צי') ||
        name.includes('רביד') // very soft fallback
      );
    });
    return mainFleet?.id ?? memberOrganizations[0]?.id ?? null;
  }, [memberOrganizations]);

  // Ensure main admin is always on the main admin org when not impersonating
  useEffect(() => {
    if (!isMainAdmin) return;
    if (viewAsEmail) return; // when impersonating, org follows the impersonated user
    if (mainFleetOrgId && activeOrgId !== mainFleetOrgId) {
      setActiveOrgId(mainFleetOrgId);
    }
  }, [isMainAdmin, viewAsEmail, activeOrgId, setActiveOrgId, mainFleetOrgId]);

  // Ensure Roei (driver-only) is always locked to his org and cannot switch orgs
  useEffect(() => {
    if (!isDriverRoei) return;
    const targetOrgId = profile?.org_id as string | null | undefined;
    if (targetOrgId && activeOrgId !== targetOrgId) {
      setActiveOrgId(targetOrgId);
    }
  }, [isDriverRoei, profile?.org_id, activeOrgId, setActiveOrgId]);

  // Ensure Ravid is locked to his org and cannot switch orgs
  useEffect(() => {
    if (!isRavid) return;
    const targetOrgId = profile?.org_id as string | null | undefined;
    if (targetOrgId && activeOrgId !== targetOrgId) {
      setActiveOrgId(targetOrgId);
    }
  }, [isRavid, profile?.org_id, activeOrgId, setActiveOrgId]);

  /** bootstrap בלי org בפרופיל — מסנכרן מחליף ורשימת צוות ל־UUID הצי הראשי */
  useEffect(() => {
    if (!isFleetBootstrapOwnerEmail(resolveSessionEmail(profile, user))) return;
    if (viewAsEmail) return;
    if (activeOrgId) return;
    setActiveOrgId(mainFleetOrgId ?? FALLBACK_MAIN_FLEET_ORG_ID);
  }, [profile, user, viewAsEmail, activeOrgId, mainFleetOrgId, setActiveOrgId]);

  /**
   * יציאה מ-View-As + רענון מלא — מונע «תקיעה» במצב תצוגה (מטמון React / שאילתות).
   * API האפליקציה: setViewAsEmail (לא setViewAs).
   */
  const exitViewAsToDashboard = useCallback(() => {
    setViewAsEmail(null);

    const mainOrgId = FALLBACK_MAIN_FLEET_ORG_ID;
    if (isMainAdmin) {
      setActiveOrgId(mainOrgId);
    } else if (isRavid && profile?.org_id?.trim()) {
      setActiveOrgId(profile.org_id.trim());
    } else {
      setActiveOrgId(mainOrgId);
    }

    try {
      localStorage.removeItem('viewAsUser');
    } catch {
      /* ignore */
    }

    try {
      window.dispatchEvent(new CustomEvent('app:go-home'));
    } catch {
      /* ignore */
    }

    void navigate('/');
    window.location.href = `${window.location.origin}/`;
  }, [setViewAsEmail, isMainAdmin, isRavid, profile?.org_id, setActiveOrgId, navigate]);

  const handleLogout = () => {
    void signOut();
  };

  type HeaderAction =
    | { key: 'manage_org'; label: string; to: string; icon: ElementType; showOn: 'mobileMenu' | 'desktop' | 'both' }
    | { key: 'manage_team'; label: string; to: string; icon: ElementType; showOn: 'mobileMenu' | 'desktop' | 'both' }
    | { key: 'logout'; label: string; onSelect: () => void; icon: ElementType; showOn: 'mobileMenu' | 'desktop' | 'both' };

  const availableActions = useMemo<HeaderAction[]>(() => {
    const out: HeaderAction[] = [];
    // Secondary actions: collapse into hamburger on small screens.
    if (canManageOrgUi) {
      out.push({ key: 'manage_org', label: 'ניהול', to: '/admin/org-settings', icon: Building2, showOn: 'both' });
    }
    if (canManageTeamUi) {
      out.push({ key: 'manage_team', label: 'ניהול צוות', to: '/team', icon: UserCog, showOn: 'both' });
    }
    out.push({ key: 'logout', label: 'התנתקות', onSelect: handleLogout, icon: LogOut, showOn: 'both' });
    return out;
  }, [canManageOrgUi, canManageTeamUi]);

  const ThemeToggle = () => (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
      className="h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  const MobileSettingsMenu = () => {
    // ארגונים זמינים (כמו ב-OrgSwitcher)
    const orgItems = isMainAdmin
      ? (mainFleetOrgId ? memberOrganizations.filter((org) => org.id === mainFleetOrgId) : memberOrganizations)
      : memberOrganizations;

    // חברי צוות זמינים (אותה לוגיקה כמו OrgSwitcher)
    const mobileMembers = augmentSwitcherMembers(teamMembers, {
      selfEmail: email,
      isMainAdmin,
      isRavid,
      activeOrgId,
      mainFleetOrgId,
      profileOrgId: profile?.org_id,
    });

  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            title="ניהול"
            aria-label="ניהול"
            className={cn(
              'relative z-[9999] flex sm:hidden h-8 rounded-lg border transition-colors',
              isOrgAdminOrManager
                ? cn('gap-1 px-2 min-w-[4.5rem]', managementNavClass)
                : 'w-8 px-0 justify-center border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 hover:text-white'
            )}
          >
            <Settings className={cn('h-4 w-4 shrink-0', isOrgAdminOrManager && 'text-amber-200')} />
            {isOrgAdminOrManager ? (
              <span className="text-[11px] font-semibold leading-none text-amber-100">ניהול</span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px]">
          {/* User info */}
          <div className="px-3 py-2 border-b border-border text-xs">
            <div className="font-semibold truncate">{name || email}</div>
            <div className="text-[11px] text-muted-foreground truncate">{email}</div>
                </div>

          {/* Org select / view-as */}
          {orgItems.length > 0 && (
            <div className="py-1">
              <div className="px-3 pb-1 text-[11px] font-semibold text-muted-foreground">
                הארגון הנוכחי
              </div>
              {orgItems.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  className="text-xs cursor-pointer"
                  onClick={() => {
                    if (isMainAdmin && mainFleetOrgId && org.id === mainFleetOrgId) {
                      setViewAsEmail(null);
                      setActiveOrgId(mainFleetOrgId);
                    } else {
                      setActiveOrgId(org.id);
                    }
                  }}
                >
                  <span className="truncate">{org.name || org.id}</span>
                </DropdownMenuItem>
              ))}
            </div>
          )}

          {mobileMembers.length > 0 && (
            <div className="py-1 border-t border-border mt-1">
              <div className="px-3 pb-1 text-[11px] font-semibold text-muted-foreground">
                תצוגה כחבר צוות
              </div>
              {mobileMembers.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  className="text-xs cursor-pointer"
                  onClick={() => {
                    setViewAsEmail(member.email ?? null);
                    if (member.org_id) {
                      setActiveOrgId(member.org_id as any);
                    }
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium truncate">
                      {member.full_name || member.email || 'חבר צוות'}
                    </span>
                    {member.email && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {member.email}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}

          {/* Language / theme / org */}
          <div className="py-1 border-t border-border mt-1">
            <DropdownMenuItem asChild className="cursor-pointer">
              <button type="button" className="w-full flex items-center justify-between text-xs">
                <span>שפה</span>
                <span className="ml-2">
                  <LanguageSwitcher />
                </span>
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between text-xs"
              >
                <span>מצב תצוגה</span>
                <span className="ml-2 flex items-center justify-center">
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </span>
              </button>
            </DropdownMenuItem>
            {canAccessGoldenManagementLinks ? (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link
                  to="/admin/org-settings"
                  className="w-full flex items-center justify-between text-xs text-amber-700 dark:text-amber-200"
                >
                  <span className="font-medium">ארגון</span>
                  <Building2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                </Link>
              </DropdownMenuItem>
            ) : null}
            {canAccessGoldenManagementLinks ? (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link
                  to="/team"
                  className="w-full flex items-center justify-between text-xs text-amber-700 dark:text-amber-200"
                >
                  <span className="font-medium">ניהול צוות</span>
                  <UserCog className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                </Link>
              </DropdownMenuItem>
            ) : null}
          </div>

          {/* Logout */}
          <div className="py-1 border-t border-border mt-1">
            <DropdownMenuItem
              className="text-xs text-red-500 cursor-pointer"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              התנתקות
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const OrgSwitcher = () => {
    /** נהג רועי: אין רשימת ארגונים — רק מעבר לתצוגת מנהל (רביד) */
    if (isDriverRoei) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 hover:text-cyan-100"
            >
              <Building className="h-3.5 w-3.5" />
              <span className="hidden md:inline max-w-[140px] truncate">חשבונות מקושרים</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px]">
            <DropdownMenuItem disabled className="text-[11px] font-semibold opacity-80">
              תצוגה כמנהל
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={() => {
                setViewAsEmail(RAVID_MANAGER_EMAIL);
                const oid = profile?.org_id?.trim() || null;
                if (oid) setActiveOrgId(oid);
              }}
            >
              <div className="flex flex-col">
                <span className="font-medium truncate">רביד (מנהל צי)</span>
                <span className="text-[11px] text-muted-foreground truncate">{RAVID_MANAGER_EMAIL}</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    // אם אין ארגונים משויכים בכלל, נסתיר רק למשתמשים רגילים – אבל לא למנהל הראשי ולא לרביד
    if (memberOrganizations.length === 0 && !isMainAdmin && !isRavid) return null;
    // For the org list at the top: for main admin, prefer only the primary org "רביד צי רכבים"
    const orgItems = isMainAdmin
      ? (mainFleetOrgId ? memberOrganizations.filter((org) => org.id === mainFleetOrgId) : memberOrganizations)
      : memberOrganizations;

    const visibleMembers = augmentSwitcherMembers(teamMembers, {
      selfEmail: email,
      isMainAdmin,
      isRavid,
      activeOrgId,
      mainFleetOrgId,
      profileOrgId: profile?.org_id,
    });
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            <Building className="h-3.5 w-3.5" />
            <span className="hidden md:inline max-w-[120px] truncate">
              {organization?.name ??
                (orgName || (isMainAdmin ? 'הצי הראשי - רועי' : 'החלף צי'))}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px]">
          {viewAsEmail && (
            <DropdownMenuItem
              onClick={() => exitViewAsToDashboard()}
              className="text-xs font-semibold text-emerald-200 bg-emerald-950/60 cursor-pointer mb-1"
            >
              חזרה לתצוגת מנהל
            </DropdownMenuItem>
          )}
          <DropdownMenuRadioGroup
            value={activeOrgId ?? ''}
            onValueChange={(id) => {
              if (!id) return;
              if (isMainAdmin && id === FALLBACK_MAIN_FLEET_ORG_ID) {
                // Manual override: reset to admin view and main admin org
                setViewAsEmail(null);
                if (mainFleetOrgId) setActiveOrgId(mainFleetOrgId);
              } else {
                setActiveOrgId(id);
              }
            }}
          >
            {orgItems.map((org) => (
              <DropdownMenuRadioItem key={org.id} value={org.id}>
                <span className="truncate">{org.name || org.id}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {visibleMembers.length > 0 ? (
            <>
              <DropdownMenuItem disabled className="mt-2 text-[11px] font-semibold opacity-80">
                תצוגה כחבר צוות
              </DropdownMenuItem>
              {visibleMembers.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  className="text-xs cursor-pointer"
                onClick={() => {
                  // CRITICAL: viewAsEmail drives the orange banner; always set it from member.email
                  setViewAsEmail(member.email ?? null);
                  // Also align org to the member's org when available
                  if (member.org_id) {
                    setActiveOrgId(member.org_id as any);
                  }
                }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium truncate">
                      {member.full_name || member.email || 'חבר צוות'}
                    </span>
                    {member.email && (
                      <span className="text-[11px] text-muted-foreground truncate">{member.email}</span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          ) : teamMembers.length > 0 ? (
            <DropdownMenuItem disabled className="mt-2 text-[11px] opacity-70">
              אין חברי צוות נוספים לארגון זה
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className="mt-2 text-[11px] opacity-70">
              אין חברי צוות לארגון זה
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const MobileActionsMenu = () => {
    const actions = availableActions.filter((a) => a.showOn === 'both' || a.showOn === 'mobileMenu');
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="תפריט פעולות"
            title="תפריט"
            className="h-8 w-8 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 hover:text-white"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px]">
          {actions.map((a) => {
            const Icon = a.icon;
            if (a.key === 'logout') {
              return (
                <DropdownMenuItem
                  key={a.key}
                  className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10 gap-2"
                  onSelect={a.onSelect}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {a.label}
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem key={a.key} asChild className="cursor-pointer">
                <Link to={a.to} className="w-full flex items-center justify-between text-xs">
                  <span className="font-medium">{a.label}</span>
                  <Icon className="h-4 w-4 shrink-0" />
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const MobileNavDrawer = () => {
    const side = isRtl ? 'right' : 'left';
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="תפריט"
            title="תפריט"
            className="h-10 min-h-[44px] w-10 min-w-[44px] rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 hover:text-white"
          >
            <Menu className="h-5 w-5 shrink-0" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side={side as any}
          className={cn('w-[85vw] max-w-[360px] p-4', isRtl ? 'text-right' : 'text-left')}
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-xs font-bold text-cyan-200">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{name || email}</div>
                {email ? <div className="text-xs text-muted-foreground truncate">{email}</div> : null}
              </div>
            </div>
          </div>

          <div className="pt-3 space-y-2">
            <p className="px-1 text-[11px] font-medium text-muted-foreground">כלים והגדרות</p>
            <div className="flex flex-col gap-2">
              <OrgSwitcher />
              <div className="flex flex-wrap items-center gap-2">
                <PwaInstallButton />
                <ThemeToggle />
                <LanguageSwitcher />
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border">
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-between"
              onClick={handleLogout}
            >
              <span>התנתקות</span>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  };

  const ViewAsExitButton = ({ className }: { className?: string }) =>
    viewAsEmail ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-7 gap-1 px-2 text-[11px] font-semibold border-emerald-400/60 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30 hover:text-white shrink-0',
          className
        )}
        onClick={() => exitViewAsToDashboard()}
      >
        חזרה לתצוגת מנהל
      </Button>
    ) : null;

  const UtilityCluster = () => (
    <>
      <PwaInstallButton />
      <ThemeToggle />
      <LanguageSwitcher />
      <OrgSwitcher />
    </>
  );

  /** כפתורי ניהול זהב — שורת ניווט דסקטופ: תווית מלאה ורוחב אחיד */
  const GoldManagementNavLinks = () => (
    <div className="relative z-[9998] flex flex-nowrap items-center gap-2">
      {availableActions
        .filter((a) => a.showOn === 'both' || a.showOn === 'desktop')
        .filter((a) => a.key !== 'logout')
        .map((a) => {
          const Icon = a.icon;
          if (!('to' in a)) return null;
          const isMgmt = a.key === 'manage_org' || a.key === 'manage_team';
          if (!isMgmt) return null;
          return (
            <Link
              key={a.key}
              to={a.to}
              title={a.label}
              aria-label={a.label}
              className={cn(
                'relative z-[9999] flex h-10 min-h-10 min-w-[9rem] items-center justify-center gap-2 rounded-lg border-2 px-6 text-sm font-medium transition-colors',
                managementNavClass
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-amber-200" />
              <span className="whitespace-nowrap">{a.label}</span>
            </Link>
          );
        })}
    </div>
  );

  const handleGoHomeNav = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (viewAsEmail) {
      exitViewAsToDashboard();
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('app:go-home'));
    } catch {
      /* ignore */
    }
    void navigate('/');
  };

  /** מובייל: שורה ייעודית — בית עדין, ניהול בזהב */
  const MobilePrimaryNav = () => (
    <nav
      className="flex w-full min-w-0 flex-wrap items-stretch justify-around gap-2 rounded-lg border border-white/10 bg-black/30 px-0.5 py-1 md:hidden"
      aria-label="ניווט ראשי"
    >
      <Link
        to="/"
        onClick={handleGoHomeNav}
        className={cn(
          'flex min-h-[48px] min-w-0 flex-1 touch-manipulation basis-0 items-center justify-center gap-1.5 rounded-md px-2 text-base font-medium transition-colors active:opacity-90',
          isHomeActive
            ? 'bg-white/10 text-cyan-100 ring-1 ring-cyan-400/35'
            : 'bg-white/[0.05] text-white/75 hover:bg-white/10'
        )}
      >
        <Home className="h-5 w-5 shrink-0 opacity-90" />
        <span className="truncate">בית</span>
      </Link>
      {canManageOrgUi ? (
        <Link
          to="/admin/org-settings"
          className={cn(
            'flex min-h-[48px] min-w-0 flex-1 touch-manipulation basis-0 items-center justify-center gap-1 rounded-md border-2 px-2 text-sm font-medium transition-colors active:opacity-90',
            managementNavClass
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-amber-200" />
          <span className="truncate">ניהול</span>
        </Link>
      ) : null}
      {canManageTeamUi ? (
        <Link
          to="/team"
          className={cn(
            'flex min-h-[48px] min-w-0 flex-1 touch-manipulation basis-0 items-center justify-center gap-1 rounded-md border-2 px-2 text-sm font-medium transition-colors active:opacity-90',
            managementNavClass
          )}
        >
          <UserCog className="h-4 w-4 shrink-0 text-amber-200" />
          <span className="truncate">ניהול צוות</span>
        </Link>
      ) : null}
    </nav>
  );

  const HomeNavLinkDesktop = () => (
    <Link
      to="/"
      onClick={handleGoHomeNav}
      className={cn(
        'hidden md:inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-5 text-sm font-medium transition-colors',
        isHomeActive
          ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
          : 'border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white/90'
      )}
    >
      <Home className="h-4 w-4 shrink-0 opacity-90" />
      <span>{t('navigation.home')}</span>
    </Link>
  );

  const BrandMarkBlock = () => (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 min-w-0 lg:min-w-[150px]',
        isRtl && 'flex-row-reverse'
      )}
    >
      <div className="flex h-9 min-w-fit w-[3.15rem] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0a1525] p-1.5 md:h-12 md:w-16 md:min-w-[4rem] md:p-2">
        <img
          src={getBrandLogoUrl()}
          alt=""
          className="max-h-[1.65rem] w-full min-w-0 object-contain object-center md:max-h-12"
        />
      </div>
      <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
        <span className="block max-w-[min(100%,70vw)] truncate text-sm font-bold leading-tight text-white md:max-w-[min(100%,28rem)]">
          {t('navigation.fleetManager')}
        </span>
        <span className="hidden truncate text-[10px] text-cyan-400/55 md:block">{orgName || 'הצי הראשי - רועי'}</span>
        <span className="hidden items-baseline gap-1 text-xs font-medium text-white/65 md:flex">
          <span className="min-w-0 truncate">גרסה v{headerDisplayVersion}</span>
        </span>
      </div>
    </div>
  );

  const MobileUserRow = () => null;

  /* דסקטופ: מייל + התנתקות — min-w-0 מונע חפיפה עם כפתורי זהב */
  const UserInline = () =>
    user ? (
      <div
        className={cn(
          'relative z-[10000] hidden min-w-0 max-w-full items-center gap-2 rounded-full bg-black/40 px-2 py-1 text-xs md:flex md:shrink md:px-3',
          isRtl ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-[10px] font-bold text-cyan-200"
          title={name || email}
        >
          {initials}
        </div>
        {email ? (
          <span
            className="min-w-0 max-w-[10rem] truncate text-[11px] text-white/70 sm:max-w-[14rem]"
            title={email}
          >
            {email}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-red-300 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
          onClick={handleLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden text-[11px] font-medium sm:inline">התנתקות</span>
        </Button>
      </div>
    ) : null;

  /* Mobile: dropdown trigger (avatar only); content = email + logout */
  const UserDropdown = () =>
    user ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden h-10 min-h-[44px] w-10 min-w-[44px] rounded-full border border-cyan-400/30 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 hover:text-cyan-100 cursor-pointer touch-manipulation shrink-0"
            style={{ touchAction: 'manipulation' }}
            aria-label={email || 'תפריט משתמש'}
          >
            <span className="text-xs font-bold">{initials}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isRtl ? 'start' : 'end'}
          side={isRtl ? 'left' : 'right'}
          className="min-w-[220px] z-[100]"
        >
          <div className={cn('px-2 py-2 border-b border-border', isRtl ? 'text-right' : 'text-left')}>
            <p className="text-xs font-medium text-foreground truncate" title={email}>
              {email}
            </p>
            {name && name !== email && (
              <p className="text-[11px] text-muted-foreground truncate" title={name}>
                {name}
              </p>
            )}
          </div>
          <DropdownMenuItem
            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-500/10 gap-2"
            onSelect={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            התנתקות
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const BackButton = () => {
    const handleBack = () => {
      // ניווט "אחורה" לנתיב האחרון ששמור בקונטקסט, עם טעינה מלאה כדי למנוע תקיעות
      const last = getLastPath();
      const targetPath =
        last && last !== `${location.pathname}${location.search}` ? last : '/';
      const fullUrl = targetPath.startsWith('http')
        ? targetPath
        : `${window.location.origin}${
            targetPath.startsWith('/') ? '' : '/'
          }${targetPath}`;
      window.location.assign(fullUrl);
    };

    return (
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 hover:bg-black/60 hover:text-white transition-colors"
      >
        {/* ב־RTL חץ לימין הוא חזור אחורה */}
        <ArrowRight className="h-3.5 w-3.5" />
        <span>חזרה</span>
      </button>
    );
  };

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#020617]',
        showFleetEnvironmentBanner && 'pt-6'
      )}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {fleetEnvBannerKind === 'staging' ? (
        <div
          className="fixed left-0 right-0 top-0 z-[999] flex h-6 min-h-[1.5rem] items-center justify-center border-b border-red-500/45 bg-red-600 px-2 py-0.5 text-center"
          role="banner"
          aria-label="סביבת טסט"
        >
          <span className="text-[10px] font-semibold leading-tight tracking-wide text-white sm:text-[11px]">
            סביבת טסט · גרסת בדיקה · Staging
          </span>
        </div>
      ) : fleetEnvBannerKind === 'production-local' ? (
        <div
          className="fixed left-0 right-0 top-0 z-[999] flex h-6 min-h-[1.5rem] items-center justify-center border-b border-emerald-600/50 bg-emerald-900/95 px-2 py-0.5 text-center"
          role="banner"
          aria-label="גרסת עבודה"
        >
          <span className="text-[10px] font-semibold leading-tight tracking-wide text-emerald-50 sm:text-[11px]">
            גרסת עבודה · נתוני ייצור · Production DB
          </span>
        </div>
      ) : null}
      {(isMainAdmin || isRavid) && viewAsEmail && (
        <div
          className={cn('sticky z-50 w-full bg-amber-500 text-black shadow-md', viewAsStickyTopClass)}
        >
          <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-2 px-3 py-1 text-[11px] sm:text-xs sm:px-4">
            <span className="font-medium">
              אתה נמצא כרגע בתצוגת משתמש:{' '}
              <span className="font-bold">{viewAsProfile?.full_name || viewAsEmail}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs font-semibold border-black/40 bg-black/80 text-amber-50 hover:bg-black/90"
              onClick={() => exitViewAsToDashboard()}
            >
              חזור לתצוגת מנהל
            </Button>
          </div>
        </div>
      )}
      <header
        className={cn(
          'sticky z-40 border-b border-white/10 bg-[#0d1b2e] min-h-0 md:h-auto md:border-gray-800',
          headerStickyTopClass
        )}
      >
        {/* דסקטופ (md+): שתי שורות — (כלים+משתמש / מותג) ואז ניווט מרכזי */}
        <div className="hidden w-full max-w-full flex-col overflow-hidden px-4 md:flex md:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between gap-3 py-2 md:pt-3 md:pb-2">
            <div
              className={cn(
                'relative z-[9998] flex min-w-0 shrink-0 flex-nowrap items-center gap-2 md:gap-3',
                isRtl ? 'order-2' : 'order-1'
              )}
            >
              <UtilityCluster />
              <ViewAsExitButton />
              <UserInline />
            </div>
            <div className={cn('flex shrink-0 items-center', isRtl ? 'order-1' : 'order-2')}>
              <BrandMarkBlock />
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 border-t border-white/10 py-2 md:pb-3 lg:gap-x-4">
            <div className={cn('flex shrink-0 items-center', isRtl ? 'order-1' : 'order-2')}>
              <HomeNavLinkDesktop />
            </div>
            {canAccessGoldenManagementLinks ? (
              <div className={cn('flex min-w-0 shrink-0 items-center', isRtl ? 'order-2' : 'order-1')}>
                <GoldManagementNavLinks />
              </div>
            ) : null}
          </div>
        </div>

        {/* מובייל (מתחת ל־768px): עמודה — שורת לוגו+משתמש, אחריה פס ניווט מלא רוחב */}
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-2 px-4 py-2 md:hidden">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 basis-[55%]">
              <BrandMarkBlock />
            </div>
            <div className="relative z-[10001] flex shrink-0 items-center gap-2">
              <MobileNavDrawer />
              <UserDropdown />
            </div>
          </div>
          <MobilePrimaryNav />
          {viewAsEmail ? (
            <div className="flex w-full min-w-0 justify-end">
              <ViewAsExitButton className="min-h-11 w-full justify-center sm:w-auto" />
            </div>
          ) : null}
        </div>
      </header>

      <main
        key={location.pathname + location.search}
        className="relative flex-1 overflow-y-auto bg-transparent px-6 py-6"
      >
        {profile?.status === 'pending_approval' ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="max-w-lg w-full rounded-2xl border border-yellow-400/40 bg-yellow-950/40 px-6 py-8 text-center shadow-lg">
              <h2 className="text-xl font-semibold text-yellow-100 mb-2">
                החשבון שלך ממתין לאישור מנהל
              </h2>
              <p className="text-sm text-yellow-100/85 mb-4 leading-relaxed">
                חשבונך נוצר בהצלחה, אך עדיין ממתין לאישור מנהל המערכת.
                <br />
                תקבל הודעת דוא״ל ברגע שהחשבון יאושר ותוכל להתחבר למערכת המלאה.
              </p>
            </div>
          </div>
        ) : (
          <>
            {location.pathname !== '/' && (
              <div className={cn('mb-4 flex', isRtl ? 'justify-start' : 'justify-end')}>
                <BackButton />
              </div>
            )}
            {children}
          </>
        )}
      </main>

      {profile?.status === 'active' && <AIChatAssistant />}
    </div>
  );
}
