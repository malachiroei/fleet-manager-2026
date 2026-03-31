import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import { Sun, Moon, Building2, LogOut, Home, ArrowRight, ChevronDown, Building, Settings, UserCog } from 'lucide-react';
import { PwaInstallButton } from './PwaInstallButton';
import { Button } from './ui/button';
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
  FLEET_PRO_DEFAULT_HEADER_VERSION,
} from '@/constants/version';
import {
  compareSemverExtended,
  isFleetManagerProHostname,
  normalizeVersion,
  showFleetStagingEnvironmentBanner,
  toCanonicalThreePartVersion,
} from '@/lib/versionManifest';

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
  } = useAuth();
  const isDriverOnlyHeader = Boolean(isDriver && !isManager && !isAdmin);
  /** מנהל ארגון / מנהל צי — כפתורי ניהול בכותרת (ארגון, צוות) */
  const isOrgAdminOrManager = (isAdmin || isManager) && !isDriverOnlyHeader;
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
  /** באנר "גרסת בדיקה": מוצג רק בסביבת staging */
  const isStaging =
    (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) ||
    (import.meta as any).env?.MODE === 'staging';
  const showStagingWarningBar = isStaging;

  /** ריענון כותרת אחרי כתיבת fleet-pro-acknowledged-version (לפני reload) */
  const [proAckBump, setProAckBump] = useState(0);
  useEffect(() => {
    if (!isProduction) return;
    const bump = () => setProAckBump((n) => n + 1);
    window.addEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, bump);
    return () => window.removeEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, bump);
  }, [isProduction]);

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

  /** מוצג בכותרת — בטסט = גרסת בנדל; בייצור = מאושרת או ברירת מחדל עד "עדכן עכשיו" */
  const headerDisplayVersion = useMemo(() => {
    if (!isProduction) return normalizeVersion(bundleVersion);
    let ack = FLEET_PRO_DEFAULT_HEADER_VERSION;
    try {
      const stored = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY);
      if (stored?.trim()) ack = stored.trim();
    } catch {
      // ignore
    }
    const ackN = toCanonicalThreePartVersion(normalizeVersion(ack)) || normalizeVersion(ack);
    const bundleN = toCanonicalThreePartVersion(normalizeVersion(bundleVersion)) || normalizeVersion(bundleVersion);
    /** בנדל חדש יותר מהמאושר — מציגים את המאושר עד "עדכן עכשיו" (semver מורחב) */
    if (compareSemverExtended(bundleN, ackN) > 0) return ackN;
    return bundleN;
  }, [isProduction, bundleVersion, proAckBump]);

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

  const isMainAdmin = email === 'malachiroei@gmail.com';
  const canAccessGoldenManagementLinks = isOrgAdminOrManager && isMainAdmin;
  const isDriverRoei = email === 'roeima21@gmail.com';
  const isRavid = email === 'ravidmalachi@gmail.com';

  const viewAsBannerVisible = (isMainAdmin || isRavid) && Boolean(viewAsEmail);
  const headerStickyTopClass = showStagingWarningBar
    ? viewAsBannerVisible
      ? 'top-24'
      : 'top-12'
    : 'top-0';
  const viewAsStickyTopClass = showStagingWarningBar ? 'top-12' : 'top-0';

  const mainFleetOrgId = useMemo(() => {
    // Prefer explicit Main Fleet org id when present.
    const explicitMainFleet = memberOrganizations.find((o) => o.id === '857f2311-2ec5-41d3-8e32-dacd450a9a77');
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

  const handleLogout = () => {
    void signOut();
  };

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
    let mobileMembers = teamMembers.filter(
      (m) =>
        m.email &&
        m.email.toLowerCase() !== email &&
        m.email.toLowerCase() !== 'malachiroei@gmail.com'
    );
    mobileMembers = mobileMembers.filter((m) => (m.full_name || '').trim() !== 'רביד צי רכבים');

    if (isMainAdmin) {
      const allowedEmails = new Set(['ravidmalachi@gmail.com']);
      mobileMembers = mobileMembers.filter(
        (m) => m.email && allowedEmails.has(m.email.toLowerCase())
      );
    }

    if (isRavid && mobileMembers.length === 0) {
      mobileMembers = [
        {
          id: 'synthetic-roeima21',
          full_name: 'ROEIMA21',
          email: 'roeima21@gmail.com',
          org_id: profile?.org_id ?? null,
          source: 'profile',
        },
      ] as any;
    }

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
    // Hide switcher רק עבור משתמש קצה (Roei)
    if (isDriverRoei) return null;

    // אם אין ארגונים משויכים בכלל, נסתיר רק למשתמשים רגילים – אבל לא למנהל הראשי ולא לרביד
    if (memberOrganizations.length === 0 && !isMainAdmin && !isRavid) return null;
    // For the org list at the top: for main admin, prefer only the primary org "רביד צי רכבים"
    const orgItems = isMainAdmin
      ? (mainFleetOrgId ? memberOrganizations.filter((org) => org.id === mainFleetOrgId) : memberOrganizations)
      : memberOrganizations;

    // Team members view:
    // - For main admin: רק רביד (sub-admin)
    // - עבור משתמשים אחרים (כולל רביד): כל מי שנמצא באותו org חוץ מעצמם
    let visibleMembers = teamMembers.filter(
      (m) =>
        m.email &&
        m.email.toLowerCase() !== email && // לא להציג את המשתמש עצמו
        m.email.toLowerCase() !== 'malachiroei@gmail.com' // לא להציג את רועי כ"חבר צוות" אצל רביד או אחרים
    );
    // Remove any member that duplicates the org-level "רביד צי רכבים"
    visibleMembers = visibleMembers.filter((m) => (m.full_name || '').trim() !== 'רביד צי רכבים');

    if (isMainAdmin) {
      const allowedEmails = new Set(['ravidmalachi@gmail.com']);
      visibleMembers = visibleMembers.filter(
        (m) => m.email && allowedEmails.has(m.email.toLowerCase())
      );
    }

    // Safety net: when logged in as Ravid and no members found, ensure Roei appears
    if (isRavid && visibleMembers.length === 0) {
      visibleMembers = [
        {
          id: 'synthetic-roeima21',
          full_name: 'ROEIMA21',
          email: 'roeima21@gmail.com',
          org_id: profile?.org_id ?? null,
          source: 'profile',
        },
      ] as any;
    }
    console.log('DEBUG SWITCHER:', {
      activeOrgId,
      teamMembersCount: teamMembers.length,
      visibleCount: visibleMembers.length,
      emails: teamMembers.map((m) => m.email),
      orgItems: orgItems.map((o) => o.name),
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
            <span className="hidden sm:inline max-w-[120px] truncate">
              {organization?.name ??
                (orgName || (isMainAdmin ? 'הצי הראשי - רועי' : 'החלף צי'))}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px]">
          {viewAsEmail && (
            <DropdownMenuItem
              onClick={() => setViewAsEmail(null)}
              className="text-xs font-semibold text-emerald-200 bg-emerald-950/60 cursor-pointer mb-1"
            >
              חזרה לתצוגת מנהל
            </DropdownMenuItem>
          )}
          <DropdownMenuRadioGroup
            value={activeOrgId ?? ''}
            onValueChange={(id) => {
              if (!id) return;
              if (isMainAdmin && id === '857f2311-2ec5-41d3-8e32-dacd450a9a77') {
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

  const TopToolsBlock = () => (
    <div
      className={cn(
        'relative z-[9999] flex items-center gap-2 sm:gap-3 shrink-0',
        isRtl ? 'flex-row-reverse' : ''
      )}
    >
      {/* Mobile: ניהול צוות (מנהל/מנהל צי) + תפריט הגדרות */}
      <div className="relative z-[9999] flex items-center gap-2 sm:hidden">
        {canAccessGoldenManagementLinks ? (
          <Link
            to="/team"
            className={cn(
              'flex h-8 items-center gap-1 rounded-lg border px-2 transition-colors',
              managementNavClass
            )}
          >
            <UserCog className="h-3.5 w-3.5 shrink-0 text-amber-200" />
            <span className="text-[11px] font-semibold leading-none text-amber-50">ניהול</span>
          </Link>
        ) : null}
        <MobileSettingsMenu />
      </div>

      {/* Desktop: שורת הכלים המלאה כמו קודם */}
      <div className="relative z-[9999] hidden sm:flex items-center gap-3">
        <PwaInstallButton />
            <ThemeToggle />
            <LanguageSwitcher />
        <OrgSwitcher />
        {canAccessGoldenManagementLinks ? (
          <Link
            to="/admin/org-settings"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
              managementNavClass
            )}
          >
            <Building2 className="h-3.5 w-3.5 text-amber-200" />
            <span className="hidden sm:inline">ארגון</span>
          </Link>
        ) : null}
        {canAccessGoldenManagementLinks ? (
          <Link
            to="/team"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
              managementNavClass
            )}
          >
            <UserCog className="h-3.5 w-3.5 text-amber-200" />
            <span className="hidden sm:inline">ניהול</span>
            <span className="hidden sm:inline text-amber-200/90">·</span>
            <span className="hidden sm:inline">צוות</span>
          </Link>
        ) : null}
        {viewAsEmail && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] font-semibold border-emerald-400/60 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30 hover:text-white"
            onClick={() => setViewAsEmail(null)}
          >
            חזרה לתצוגת מנהל
          </Button>
        )}
        <UserDropdown />
      </div>
    </div>
  );

  const MobileUserRow = () =>
    user ? (
      <div className="flex sm:hidden w-full items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-[10px] font-bold text-cyan-200"
            title={name || email}
          >
            {initials}
          </div>
          {email && (
            <span className="max-w-[160px] truncate text-[11px] text-white/70" title={email}>
              {email}
            </span>
          )}
        </div>
      </div>
    ) : null;

  /* Desktop: full inline email + logout */
  const UserInline = () =>
    user ? (
      <div
        className={cn(
          'hidden sm:flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs',
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
            className="max-w-[160px] truncate text-[11px] text-white/70"
            title={email}
          >
            {email}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-red-300 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
          onClick={handleLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[11px] font-medium">התנתקות</span>
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
            className="sm:hidden h-9 w-9 rounded-full border border-cyan-400/30 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 hover:text-cyan-100 cursor-pointer touch-manipulation shrink-0"
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

  /* קצה ימין: בית הכי ימני, אחריו לוגו + כותרת (ב־RTL פריט ראשון = ימין) */
  const BrandAndHome = () => (
    <div
      className={cn(
        'flex min-w-0 items-center gap-4 sm:gap-6',
        isRtl ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      <Link
        to="/"
        onClick={(e) => {
          e.preventDefault();
          try {
            window.dispatchEvent(new CustomEvent('app:go-home'));
          } catch {
            // ignore
          }
          window.location.assign(`${window.location.origin}/`);
        }}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
          isHomeActive
            ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/40'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
        )}
      >
        <Home className="h-4 w-4" />
        {t('navigation.home')}
      </Link>
      <div className={cn('flex min-w-0 items-center gap-2 sm:gap-3', isRtl && 'flex-row-reverse')}>
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[#0a1525] p-2 flex items-center justify-center">
          <img
            src={getBrandLogoUrl()}
            alt=""
            className="max-h-12 w-full object-contain object-center"
          />
        </div>
        <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
          <span className="block truncate text-sm font-bold leading-tight text-white">
            {t('navigation.fleetManager')}
          </span>
          <span className="block truncate text-[10px] text-cyan-400/55">
            {orgName || 'הצי הראשי - רועי'}
          </span>
          <span className="flex min-w-0 max-w-full items-baseline gap-1 text-xs text-white/65 font-medium">
            <span className="min-w-0 truncate">גרסה v{headerDisplayVersion}</span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#020617]',
        showStagingWarningBar && 'pt-12'
      )}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {showStagingWarningBar ? (
        <div
          className="fixed left-0 right-0 top-0 z-[999] flex h-12 items-center justify-center border-b border-red-400/60 bg-red-600 px-4 text-center shadow-md"
          role="banner"
          aria-label="גרסת בדיקה"
        >
          <span className="text-sm font-bold tracking-wide text-white sm:text-base">
            גרסת בדיקה / Test Version
          </span>
        </div>
      ) : null}
      {(isMainAdmin || isRavid) && viewAsEmail && (
        <div
          className={cn('sticky z-50 w-full bg-amber-500 text-black shadow-md', viewAsStickyTopClass)}
        >
          <div className="mx-auto flex max-w-[1920px] items-center justify-between px-4 py-2 text-xs sm:text-sm">
            <span className="font-medium">
              אתה נמצא כרגע בתצוגת משתמש:{' '}
              <span className="font-bold">{viewAsProfile?.full_name || viewAsEmail}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs font-semibold border-black/40 bg-black/80 text-amber-50 hover:bg-black/90"
              onClick={() => {
                // Manual override: reset impersonation and org to admin defaults for main admin
                if (isMainAdmin) {
                  setViewAsEmail(null);
                  if (mainFleetOrgId) setActiveOrgId(mainFleetOrgId);
                } else {
                  setViewAsEmail(null);
                }
              }}
            >
              חזור לתצוגת מנהל
            </Button>
          </div>
        </div>
      )}
      <header
        className={cn(
          'sticky z-40 border-b border-white/10 bg-[#0d1b2e] min-h-[4.25rem] sm:min-h-0',
          headerStickyTopClass
        )}
      >
        <div className="mx-auto flex max-w-[1920px] w-full flex-col gap-0 sm:gap-1 px-4 sm:px-6 py-3 sm:py-3">
          {/* Row 1: לוגו + בית + גלגל שיניים */}
          <div className="flex w-full items-center justify-between gap-2 sm:gap-4 min-h-10 sm:min-h-0">
            <BrandAndHome />
            <TopToolsBlock />
          </div>
          {/* Row 2: מידע משתמש במובייל + שורת משתמש בדסקטופ */}
          <MobileUserRow />
          <div className={cn('hidden sm:block pt-1', isRtl ? 'flex w-full justify-end' : 'flex w-full justify-start')}>
            <UserInline />
          </div>
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
