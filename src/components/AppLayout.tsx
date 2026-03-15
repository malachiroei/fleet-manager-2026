import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganizations';
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

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, profile, activeOrgId, memberOrganizations, setActiveOrgId } = useAuth();
  const email = user?.email ?? '';
  const name = (profile?.full_name?.trim()) || user?.user_metadata?.full_name || email.split('@')[0] || '';
  const initials = (name || email || '?').slice(0, 2).toUpperCase();
  const isRtl = i18n.dir() === 'rtl';
  const { tryNavigate, getIsDirty, getLastPath } = useVehicleSpecDirty();
  const isHomeActive = location.pathname === '/';
  const { data: organization } = useOrganization(activeOrgId ?? null);
  const orgName = organization?.name?.trim() ?? '';

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
    if (memberOrganizations.length === 0) return null;
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
        <DropdownMenuContent align={isRtl ? 'start' : 'end'} className="min-w-[180px]">
          <DropdownMenuRadioGroup value={activeOrgId ?? ''} onValueChange={(id) => id && setActiveOrgId(id)}>
            {memberOrganizations.map((org) => (
              <DropdownMenuRadioItem key={org.id} value={org.id}>
                <span className="truncate">{org.name || org.id}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const TopToolsBlock = () => (
    <div
      className={cn(
        'flex h-8 sm:h-9 items-center gap-2 sm:gap-3 shrink-0',
        isRtl ? 'flex-row-reverse' : ''
      )}
    >
      <PwaInstallButton />
      <ThemeToggle />
      <LanguageSwitcher />
      <OrgSwitcher />
      <Link
        to="/admin/org-settings"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">ארגון</span>
      </Link>
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
        'flex min-w-0 items-center gap-2 sm:gap-3',
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
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d1b2e] min-h-16 sm:min-h-0">
        <div className="mx-auto flex max-w-[1920px] w-full flex-col gap-0 sm:gap-1 px-4 sm:px-6 py-3 sm:py-3">
          <div className="flex w-full items-center justify-between gap-2 min-h-10 sm:min-h-0">
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
        {location.pathname !== '/' && (
          <div className={cn('mb-4 flex', isRtl ? 'justify-start' : 'justify-end')}>
            <BackButton />
          </div>
        )}
        {children}
      </main>

      <AIChatAssistant />
    </div>
  );
}
