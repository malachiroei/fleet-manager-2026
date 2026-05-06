import {
  type ElementType,
  type MouseEvent,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganizations';
import { useTenantFleetAdminsForPlatformSwitcher } from '@/hooks/useTeam';
import { AIChatAssistant } from './AIChatAssistant';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Building2, LogOut, Home, ArrowRight, ChevronDown, Settings, UserCog, Menu, Download, Smartphone, Eye } from 'lucide-react';
import { setLanguageDirection } from '@/i18n/config';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { toast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { getBrandLogoUrl } from '@/components/BrandLogo';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
} from '@/constants/version';
import { isFleetManagerProHostname } from '@/lib/versionManifest';
import {
  isFleetOrgAdminFallbackEmail,
  isPlatformSuperOwnerEmail,
  isRavidManagerEmail,
  resolveSessionEmail,
} from '@/lib/fleetBootstrapEmails';
import { FALLBACK_MAIN_FLEET_ORG_ID, RAVID_FLEET_ORG_ID } from '@/lib/fleetDefaultOrg';
import { isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';
import { resolveLogicalBackTarget } from '@/lib/appBackNavigation';
import { isLikelyUuid } from '@/lib/fleetUuid';

/** קישור מנהל ראשי ↔ מנהל צי ↔ נהג — כש־RLS לא מחזיר את כל ה־profiles במחליף */
const MAIN_ADMIN_SWITCHER_EMAIL = 'malachiroei@gmail.com';

/** ניווט מלא לדף הבית: מסכים צרים, מגע גס (טאבלטים), או WebView. */
function shouldUseHardNavigationToHome(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(max-width: 767px)').matches) return true;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const mainScrollRef = useRef<HTMLElement>(null);

  /** גלילה לראש בעת ניווט — בלי key על main (שגרם ל-unmount מלא והאטה חזקה). */
  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [location.pathname, location.search]);
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { isInstalled: pwaInstalled, canPrompt: pwaCanPrompt, isIos: pwaIsIos, promptInstall: pwaPromptInstall } =
    usePwaInstall();
  const {
    user,
    signOut,
    profile,
    activeOrgId,
    memberOrganizations,
    setActiveOrgId,
    setPlatformFleetViewAdminId,
    platformFleetViewAdminId,
    isAdmin,
    isManager,
    isDriver,
    hasPermission,
  } = useAuth();
  const isDriverOnlyHeader = Boolean(isDriver && !isManager && !isAdmin);
  /** כולל bootstrap / is_system_admin כש־user_roles ריק בפרו */
  /** רביד (מנהל ארגון) + חשבון על — לא תלוי בלבד ב-user_roles */
  const isElevatedHeader =
    isAdmin ||
    isManager ||
    profile?.is_system_admin === true ||
    isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user)) ||
    isFleetOrgAdminFallbackEmail(resolveSessionEmail(profile, user));
  /** מנהל ארגון / מנהל צי — כפתורי ניהול בכותרת (ארגון, צוות) */
  const isOrgAdminOrManager = isElevatedHeader && !isDriverOnlyHeader;
  /** בולטים בזהב/ענבר כדי שלא יפספסו */
  const managementNavClass =
    'relative z-[9999] !flex items-center justify-center border-2 !border-solid !border-[gold] bg-amber-500/25 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.45)] hover:bg-amber-500/40 hover:text-white hover:!border-[#ffd700]';
  const email = (user?.email ?? '').toLowerCase();
  const name = (profile?.full_name?.trim()) || user?.user_metadata?.full_name || email.split('@')[0] || '';
  const initials = (name || email || '?').slice(0, 2).toUpperCase();
  const isRtl = i18n.dir() === 'rtl';
  const { tryNavigate } = useVehicleSpecDirty();
  const isHomeActive = location.pathname === '/';
  const { data: organization } = useOrganization(activeOrgId ?? null);
  const orgName = organization?.name?.trim() ?? '';
  const { data: tenantFleetAdmins = [] } = useTenantFleetAdminsForPlatformSwitcher();

  /** בלי דליפת «צי ראשי» / ארגון מנהל-העל למשתמשים שאינם מנהל-העל */
  const memberOrgsForSwitcher = useMemo(() => {
    if (isSuperAdminPermissionBypass(profile)) return memberOrganizations;
    return memberOrganizations.filter((o) => o.id !== FALLBACK_MAIN_FLEET_ORG_ID);
  }, [memberOrganizations, profile]);

  /** קיר קשיח ייצור: fleet-manager-pro.com + www (גרסה בכותרת וכו') */
  const isProduction = isFleetManagerProHostname();
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

  const isMainAdmin = email === MAIN_ADMIN_SWITCHER_EMAIL;
  const canManageTeamUi = isMainAdmin || hasPermission('manage_team') || isOrgAdminOrManager;
  const canManageOrgUi = isMainAdmin || hasPermission('admin_access') || isOrgAdminOrManager;

  /** Gold header buttons (Roei Admin + Ravid Manager). */
  const canAccessGoldenManagementLinks = !isDriverOnlyHeader && (canManageOrgUi || canManageTeamUi);
  const isRavid = isRavidManagerEmail(email);

  /** נעילת org לרביד: תמיד UUID הצי של רביד (2bb0f9c3-… ברירת מחדל) — מנהל בלעדי, בלי נדידה לפי profile שגוי */
  const ravidLockedTargetOrgId = useMemo(() => {
    if (!isRavid) return null;
    return RAVID_FLEET_ORG_ID;
  }, [isRavid]);

  const mainFleetOrgId = useMemo(() => {
    const explicitMainFleet = memberOrganizations.find((o) => o.id === FALLBACK_MAIN_FLEET_ORG_ID);
    if (explicitMainFleet) return explicitMainFleet.id;

    const mainFleet = memberOrganizations.find((o) => {
      const name = (o.name ?? '').toLowerCase();
      return (
        (name.includes('main') && name.includes('fleet')) ||
        name.includes('רביד צי') ||
        (name.includes('ראשי') && name.includes('רועי'))
      );
    });
    return mainFleet?.id ?? memberOrganizations[0]?.id ?? null;
  }, [memberOrganizations]);

  /** ברירת מחדל בלבד — לא לכפות אחרי שהמשתמש בחר ארגון אחר במתג (מנהל על) */
  useEffect(() => {
    if (!isMainAdmin) return;
    if (activeOrgId) return;
    if (mainFleetOrgId) {
      setActiveOrgId(mainFleetOrgId);
    }
  }, [isMainAdmin, activeOrgId, mainFleetOrgId, setActiveOrgId]);

  // Ensure Ravid is locked to his org and cannot switch orgs
  useEffect(() => {
    if (!isRavid) return;
    const targetOrgId = ravidLockedTargetOrgId;
    if (targetOrgId && activeOrgId !== targetOrgId) {
      setActiveOrgId(targetOrgId);
    }
  }, [isRavid, ravidLockedTargetOrgId, activeOrgId, setActiveOrgId]);

  /** bootstrap בלי org בפרופיל — רק חשבון על: UUID הצי הראשי */
  useEffect(() => {
    if (!isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user))) return;
    if (activeOrgId) return;
    setActiveOrgId(mainFleetOrgId ?? FALLBACK_MAIN_FLEET_ORG_ID);
  }, [profile, user, activeOrgId, mainFleetOrgId, setActiveOrgId]);

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

  const handlePwaNativeInstall = async () => {
    const accepted = await pwaPromptInstall();
    if (accepted) {
      toast({
        title: 'האפליקציה הותקנה',
        description: 'תוכלו לפתוח אותה מהמסך הראשי או מתפריט האפליקציות.',
      });
    }
  };

  /** שפה, מצב בהיר/כהה, התקנת PWA והתנתקות — כפתור מסגרת אחד */
  const HeaderSettingsMenu = ({
    className,
    alwaysShowLabel,
  }: {
    className?: string;
    /** בתפריט המבורגר — להציג תמיד את המילה «הגדרות» גם במסכים צרים */
    alwaysShowLabel?: boolean;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="הגדרות"
          aria-label="הגדרות"
          className={cn(
            'h-8 gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white shrink-0',
            className
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              'text-xs font-semibold',
              alwaysShowLabel ? 'inline' : 'hidden sm:inline'
            )}
          >
            הגדרות
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[220px] z-[10001]">
        <DropdownMenuLabel className="text-xs font-semibold">הגדרות</DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer text-xs"
          onClick={() => {
            i18n.changeLanguage('he');
            setLanguageDirection('he');
          }}
        >
          🇮🇱 {t('common.hebrew')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-xs"
          onClick={() => {
            i18n.changeLanguage('en');
            setLanguageDirection('en');
          }}
        >
          🇬🇧 {t('common.english')}
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => toggleTheme()}>
          <span className="flex w-full items-center justify-between gap-2">
            <span>{theme === 'dark' ? 'מסך בהיר' : 'מסך כהה'}</span>
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 shrink-0" /> : <Moon className="h-3.5 w-3.5 shrink-0" />}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!pwaInstalled ? (
          pwaCanPrompt ? (
            <DropdownMenuItem className="cursor-pointer text-xs gap-2" onClick={() => void handlePwaNativeInstall()}>
              <Download className="h-3.5 w-3.5 shrink-0" />
              התקן אפליקציה על המכשיר
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs gap-2">
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                התקנת אפליקציה…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 border-white/10 bg-popover p-3 text-popover-foreground">
                <p className="text-sm font-semibold mb-2">התקנת Fleet Manager</p>
                {pwaIsIos ? (
                  <ol className="text-xs space-y-2 list-decimal list-inside rtl:text-right text-muted-foreground">
                    <li>
                      לחצו על כפתור השיתוף <span className="font-medium text-foreground">״שתף״</span> בסרגל התחתון
                    </li>
                    <li>
                      גללו ובחרו <span className="font-medium text-foreground">״הוסף למסך הבית״</span>
                    </li>
                    <li>אשרו – האייקון יופיע במסך הבית כאפליקציה</li>
                  </ol>
                ) : (
                  <ol className="text-xs space-y-2 list-decimal list-inside rtl:text-right text-muted-foreground">
                    <li>בכרום או אדג&apos;: פתחו את התפריט (⋮) בפינה</li>
                    <li>
                      בחרו <span className="font-medium text-foreground">״התקן אפליקציה…״</span> או{' '}
                      <span className="font-medium text-foreground">״התקן Fleet Manager״</span>
                    </li>
                    <li>במחשב: אפשר גם דרך סרגל הכתובות (אייקון מחשב+חץ)</li>
                  </ol>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-xs text-red-500 focus:text-red-500 focus:bg-red-500/10 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          התנתקות
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const platformOwnerFleetScopeLabel = useMemo(() => {
    if (!isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user))) return '';
    const selfOrg = mainFleetOrgId ?? FALLBACK_MAIN_FLEET_ORG_ID;
    if (!activeOrgId) return 'צפייה בצי';
    if (selfOrg && activeOrgId === selfOrg) {
      return 'הצי שלי · רועי';
    }
    const adm =
      (platformFleetViewAdminId
        ? tenantFleetAdmins.find((a) => a.id === platformFleetViewAdminId)
        : null) ?? tenantFleetAdmins.find((a) => a.org_id === activeOrgId);
    if (adm) {
      const n = adm.full_name?.trim();
      const local = (adm.email ?? '').split('@')[0]?.trim();
      return n || local || 'מנהל צי';
    }
    return (organization?.name ?? orgName) || 'צפייה בצי';
  }, [
    profile,
    user,
    mainFleetOrgId,
    activeOrgId,
    platformFleetViewAdminId,
    tenantFleetAdmins,
    organization?.name,
    orgName,
  ]);

  const platformOwnerFleetScopeValue = useMemo(() => {
    if (!isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user))) return '';
    const selfOrg = mainFleetOrgId ?? FALLBACK_MAIN_FLEET_ORG_ID;
    if (!activeOrgId) return 'self';
    if (selfOrg && activeOrgId === selfOrg) return 'self';
    const adm =
      (platformFleetViewAdminId
        ? tenantFleetAdmins.find((a) => a.id === platformFleetViewAdminId)
        : null) ?? tenantFleetAdmins.find((a) => a.org_id === activeOrgId);
    return adm?.id ?? activeOrgId;
  }, [profile, user, mainFleetOrgId, activeOrgId, platformFleetViewAdminId, tenantFleetAdmins]);

  const OrgSwitcher = () => {
    /** מתג צפייה בצי — רק למנהל הפלטפורמה: «הצי שלי» + אדמינים (לא שמות ארגון DB) */
    if (!isPlatformSuperOwnerEmail(resolveSessionEmail(profile, user))) return null;

    const selfOrg = mainFleetOrgId ?? FALLBACK_MAIN_FLEET_ORG_ID;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            title="בחירת היקף צפייה לפי מנהל צי"
            className="h-8 gap-1.5 border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline max-w-[140px] truncate">{platformOwnerFleetScopeLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[240px] z-[10001]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">צפייה בצי לפי מנהל</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={platformOwnerFleetScopeValue}
            onValueChange={(id) => {
              if (!id) return;
              if (id === 'self') {
                setPlatformFleetViewAdminId(null);
                setActiveOrgId(selfOrg);
                return;
              }
              const adm = tenantFleetAdmins.find((a) => a.id === id);
              if (adm?.org_id) {
                setPlatformFleetViewAdminId(adm.id);
                setActiveOrgId(adm.org_id);
                return;
              }
              setPlatformFleetViewAdminId(null);
              if (isLikelyUuid(id)) {
                setActiveOrgId(id);
              }
            }}
          >
            <DropdownMenuRadioItem value="self" className="text-xs">
              <span className="truncate font-medium">הצי שלי · רועי</span>
            </DropdownMenuRadioItem>
            {tenantFleetAdmins.map((a) => {
              const label =
                a.full_name?.trim() ||
                (a.email ?? '').split('@')[0]?.trim() ||
                'מנהל צי';
              const sub = (a.email ?? '').trim();
              return (
                <DropdownMenuRadioItem key={a.id} value={a.id} className="text-xs">
                  <span className="flex flex-col gap-0.5 text-right rtl:text-right">
                    <span className="truncate font-medium">{label}</span>
                    {sub ? (
                      <span className="truncate text-[10px] text-muted-foreground opacity-90">{sub}</span>
                    ) : null}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
            {(() => {
              const v = platformOwnerFleetScopeValue;
              if (v === 'self' || tenantFleetAdmins.some((a) => a.id === v)) return null;
              if (!isLikelyUuid(v)) return null;
              const org = memberOrganizations.find((o) => o.id === v);
              return (
                <DropdownMenuRadioItem key={`other-org-${v}`} value={v} className="text-xs">
                  <span className="truncate">{org?.name ?? 'ארגון נוסף'}</span>
                </DropdownMenuRadioItem>
              );
            })()}
          </DropdownMenuRadioGroup>
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
            <p className="px-1 text-[11px] font-medium text-muted-foreground">ארגון והגדרות</p>
            <div className="flex flex-col gap-2">
              <OrgSwitcher />
              <HeaderSettingsMenu
                className="w-full justify-center border-cyan-400/30"
                alwaysShowLabel
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  };

  const UtilityCluster = () => (
    <>
      <HeaderSettingsMenu />
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
    try {
      window.dispatchEvent(new CustomEvent('app:go-home'));
    } catch {
      /* ignore */
    }
    if (shouldUseHardNavigationToHome()) {
      window.location.assign(`${window.location.origin}/`);
      return;
    }
    tryNavigate('/');
  };

  /** מובייל: שורה ייעודית — בית + חזרה צמודים, ניהול בזהב */
  const MobilePrimaryNav = () => (
    <div className="md:hidden">
      <nav
        className="flex w-full min-w-0 flex-wrap items-stretch justify-around gap-2 rounded-lg border border-white/10 bg-black/30 px-0.5 py-1"
        aria-label="ניווט ראשי"
      >
        <div className="flex min-h-[48px] min-w-0 flex-1 touch-manipulation basis-0 items-center justify-center gap-1.5">
          <Link
            to="/"
            onClick={handleGoHomeNav}
            className={cn(
              'flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-base font-medium transition-colors active:opacity-90',
              isHomeActive
                ? 'bg-white/10 text-cyan-100 ring-1 ring-cyan-400/35'
                : 'bg-white/[0.05] text-white/75 hover:bg-white/10'
            )}
          >
            <Home className="h-5 w-5 shrink-0 opacity-90" />
            <span className="truncate">בית</span>
          </Link>
          {location.pathname !== '/' ? (
            <div className="flex shrink-0 items-center pr-0.5">
              <BackButton />
            </div>
          ) : null}
        </div>
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

      {/* דף הבית במובייל/מסכים קטנים: כותרת קומפקטית במקום כרטיס Hero גדול */}
      {isHomeActive ? (
        <div className="pt-2 pb-1">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">לוח בקרה</div>
              <div className="text-[11px] text-white/60 truncate">ניהול צי — תצוגה מהירה</div>
            </div>
            <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-[#0a1525]">
              <img
                src={getBrandLogoUrl()}
                alt=""
                className="h-full w-full object-contain object-center scale-[1.8]"
                loading="lazy"
                decoding="async"
                aria-hidden
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
        'flex shrink-0 items-center min-w-0 lg:min-w-[150px]',
        isRtl && 'flex-row-reverse'
      )}
    >
      {/* מסכים קטנים: לוגו הרכב ליד "מנהל צי" בסרגל העליון */}
      <div className="md:hidden mr-2 ml-0 rtl:ml-2 rtl:mr-0 h-9 w-14 shrink-0 overflow-hidden rounded-md bg-[#0a1525]">
        <img
          src={getBrandLogoUrl()}
          alt=""
          className="h-full w-full object-contain object-center scale-[1.9]"
          loading="lazy"
          decoding="async"
          aria-hidden
        />
      </div>
      <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
        <span className="block max-w-[min(100%,70vw)] truncate text-sm font-bold leading-tight text-white md:max-w-[min(100%,28rem)]">
          {t('navigation.fleetManager')}
        </span>
        <span className="hidden truncate text-[10px] text-cyan-400/55 md:block">{orgName || 'הצי הראשי - רועי'}</span>
      </div>
    </div>
  );

  const MobileUserRow = () => null;

  /* דסקטופ: מייל + אווטאר — התנתקות מתפריט ההגדרות */
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
      </div>
    ) : null;

  /** מובייל: אווטאר + מייל ב־title — התנתקות מתפריט ההגדרות */
  const MobileUserBadge = () =>
    user ? (
      <div
        className="md:hidden flex h-10 min-h-[44px] w-10 min-w-[44px] shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-cyan-200 touch-manipulation"
        style={{ touchAction: 'manipulation' }}
        title={email ? `${name ? `${name} · ` : ''}${email}` : name || ''}
        aria-label={email || name || 'משתמש'}
      >
        <span className="text-xs font-bold">{initials}</span>
      </div>
    ) : null;

  const BackButton = () => {
    const handleBack = () => {
      const target = resolveLogicalBackTarget(location.pathname);
      tryNavigate(target);
    };

    return (
      <button
        type="button"
        onClick={handleBack}
        className="relative z-20 inline-flex cursor-pointer items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs text-white/80 hover:bg-black/60 hover:text-white transition-colors touch-manipulation"
        style={{ touchAction: 'manipulation' }}
      >
        {/* ב־RTL חץ לימין הוא חזור אחורה */}
        <ArrowRight className="h-3.5 w-3.5" />
        <span>חזרה</span>
      </button>
    );
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-transparent"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <header
        className={cn(
          'sticky top-0 z-40 border-b border-white/10 bg-[#0d1b2e] min-h-0 md:h-auto md:border-gray-800'
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
              <UserInline />
            </div>
            <div className={cn('flex shrink-0 items-center', isRtl ? 'order-1' : 'order-2')}>
              <BrandMarkBlock />
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-2 border-t border-white/10 py-2 md:pb-3 lg:gap-x-4">
            <div
              className={cn(
                'flex shrink-0 flex-nowrap items-center gap-2',
                isRtl ? 'order-1' : 'order-2',
              )}
            >
              <HomeNavLinkDesktop />
              {location.pathname !== '/' ? <BackButton /> : null}
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
              <HeaderSettingsMenu />
              <MobileUserBadge />
            </div>
          </div>
          <MobilePrimaryNav />
        </div>
      </header>

      <main
        ref={mainScrollRef}
        className="fleet-app-main-scene relative min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-x-none bg-transparent px-4 py-4 sm:px-6 sm:py-5"
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
        ) : profile?.status === 'suspended' ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="max-w-lg w-full rounded-2xl border border-red-500/50 bg-red-950/50 px-6 py-8 text-center shadow-lg">
              <h2 className="text-xl font-semibold text-red-100 mb-2">החשבון הושבת</h2>
              <p className="text-sm text-red-100/85 mb-6 leading-relaxed">
                אין גישה לאפליקציה. פנה למנהל המערכת אם לדעתך מדובר בטעות.
              </p>
              <Button type="button" variant="secondary" onClick={() => void signOut()}>
                התנתקות
              </Button>
            </div>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex min-h-[35vh] items-center justify-center gap-3 text-sm text-white/75">
                <div
                  className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400/25 border-t-cyan-300"
                  aria-hidden
                />
                <span>טוען…</span>
              </div>
            }
          >
            {children}
          </Suspense>
        )}
      </main>

      {profile?.status === 'active' && <AIChatAssistant />}
    </div>
  );
}
