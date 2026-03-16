import { ReactNode, useEffect } from 'react';
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
import { Sun, Moon, Building2, LogOut, Home, ArrowRight, ChevronDown, Building } from 'lucide-react';
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

const appLogo = '/og-image.png';

interface AppLayoutProps {
  children: ReactNode;
}

const MAIN_ADMIN_ORG_ID = '857f2311-2ec5-4d13-8e32-dacd450a9a77';

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, profile, activeOrgId, memberOrganizations, setActiveOrgId, isAdmin, isManager } = useAuth();
  const email = (user?.email ?? '').toLowerCase();
  const name = (profile?.full_name?.trim()) || user?.user_metadata?.full_name || email.split('@')[0] || '';
  const initials = (name || email || '?').slice(0, 2).toUpperCase();
  const isRtl = i18n.dir() === 'rtl';
  const { tryNavigate, getIsDirty, getLastPath } = useVehicleSpecDirty();
  const isHomeActive = location.pathname === '/';
  const { data: organization } = useOrganization(activeOrgId ?? null);
  const orgName = organization?.name?.trim() ?? '';
  const { data: teamMembers = [], error: teamMembersError } = useTeamMembersForSwitcher(activeOrgId ?? null as any);
  const { viewAsEmail, setViewAsEmail } = useViewAs();

  useEffect(() => {
    console.log('TeamMembers for Org:', activeOrgId, {
      teamMembers,
      teamMembersError,
    });
  }, [activeOrgId, teamMembers, teamMembersError]);

  console.log('CURRENT PROFILE STATUS:', profile?.status);

  const isMainAdmin = email === 'malachiroei@gmail.com';
  const isDriverRoei = email === 'roeima21@gmail.com';

  // Ensure Roei (driver-only) is always locked to his org and cannot switch orgs
  useEffect(() => {
    if (!isDriverRoei) return;
    const targetOrgId = profile?.org_id as string | null | undefined;
    if (targetOrgId && activeOrgId !== targetOrgId) {
      setActiveOrgId(targetOrgId);
    }
  }, [isDriverRoei, profile?.org_id, activeOrgId, setActiveOrgId]);

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

  const OrgSwitcher = () => {
    if (isDriverRoei) return null;
    if (memberOrganizations.length === 0) return null;
    // For the org list at the top: for main admin, prefer only the primary org "רביד צי רכבים"
    const orgItems = isMainAdmin
      ? memberOrganizations.filter((org) => (org.name || '').trim() === 'רביד צי רכבים')
      : memberOrganizations;

    // Team members view: for main admin, show only specific people; for others, keep previous behavior
    let visibleMembers = teamMembers.filter(
      (m) =>
        m.email &&
        m.email.toLowerCase() !== email &&
        m.email.toLowerCase() !== 'malachiroei@gmail.com'
    );
    // Remove any member that duplicates the org-level "רביד צי רכבים"
    visibleMembers = visibleMembers.filter((m) => (m.full_name || '').trim() !== 'רביד צי רכבים');

    if (isMainAdmin) {
      const allowedEmails = new Set(['ravidmalachi@gmail.com', 'malachiroei1@gmail.com']);
      visibleMembers = visibleMembers.filter(
        (m) => m.email && allowedEmails.has(m.email.toLowerCase())
      );
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
              {organization?.name ?? (orgName || 'החלף צי')}
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
              if (isMainAdmin && id === '857f2311-2ec5-4d13-8e32-dacd450a9a77') {
                // Manual override: reset to admin view and main admin org
                setViewAsEmail(null);
                setActiveOrgId('857f2311-2ec5-4d13-8e32-dacd450a9a77');
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
        'flex h-8 sm:h-9 items-center gap-3 sm:gap-4 shrink-0',
        isRtl ? 'flex-row-reverse' : ''
      )}
    >
      <PwaInstallButton />
      <ThemeToggle />
      <div className="hidden sm:block">
        <LanguageSwitcher />
      </div>
      <OrgSwitcher />
      <Link
        to="/admin/org-settings"
        className="hidden sm:flex h-8 items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">ארגון</span>
      </Link>
      {viewAsEmail && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex h-7 gap-1 px-2 text-[11px] font-semibold border-emerald-400/60 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30 hover:text-white"
          onClick={() => setViewAsEmail(null)}
        >
          חזרה לתצוגת מנהל
        </Button>
      )}
      <UserDropdown />
    </div>
  );

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
          if (!getIsDirty()) return;
          e.preventDefault();
          tryNavigate('/');
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
        <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-[#0a1525] p-1 flex items-center justify-center">
          <img
            src={appLogo}
            alt=""
            className="h-full w-full object-contain object-center scale-[2] origin-center"
          />
        </div>
        <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
          <span className="block truncate text-sm font-bold leading-tight text-white">
            {t('navigation.fleetManager')}
          </span>
          <span className="block truncate text-[10px] text-cyan-400/55">
            {orgName || (user ? '—' : t('navigation.proDashboard'))}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#020617]"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {viewAsEmail && (
        <div className="sticky top-0 z-50 w-full bg-amber-500 text-black shadow-md">
          <div className="mx-auto flex max-w-[1920px] items-center justify-between px-4 py-2 text-xs sm:text-sm">
            <span className="font-medium">
              אתה נמצא כרגע בתצוגת נהג: <span className="font-bold">{viewAsEmail}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs font-semibold border-black/40 bg-black/80 text-amber-50 hover:bg-black/90"
              onClick={() => {
                // Manual override: reset impersonation and org to admin defaults for main admin
                if (isMainAdmin) {
                  setViewAsEmail(null);
                  setActiveOrgId('857f2311-2ec5-4d13-8e32-dacd450a9a77');
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0d1b2e] min-h-[4.25rem] sm:min-h-0">
        <div className="mx-auto flex max-w-[1920px] w-full flex-col gap-0 sm:gap-1 px-4 sm:px-6 py-3 sm:py-3">
          <div className="flex w-full items-center justify-between gap-3 sm:gap-4 min-h-10 sm:min-h-0">
            {/* RTL: פריט ראשון = ימין המסך — בית + מנהל הצי */}
            <BrandAndHome />
            <TopToolsBlock />
          </div>
          {/* שורת משתמש — רק בדסקטופ; במובייל המשתמש בתפריט dropdown בשורה הראשונה */}
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

      <AIChatAssistant />
    </div>
  );
}
