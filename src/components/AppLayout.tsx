import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { VehicleSpecDirtyProvider, useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AIChatAssistant } from './AIChatAssistant';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Building2, LogOut, Home } from 'lucide-react';
import { PwaInstallButton } from './PwaInstallButton';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const appLogo = '/og-image.png';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const email = user?.email ?? '';
  const name = user?.user_metadata?.full_name || email.split('@')[0] || '';
  const initials = (name || email || '?').slice(0, 2).toUpperCase();
  const isRtl = i18n.dir() === 'rtl';
  const { tryNavigate, getIsDirty } = useVehicleSpecDirty();
  const isHomeActive = location.pathname === '/';

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

  const ToolsBlock = () => (
    <div
      className={cn(
        'flex h-8 flex-wrap items-center gap-2 sm:gap-3',
        isRtl ? 'flex-row-reverse' : ''
      )}
    >
      <PwaInstallButton />
      <ThemeToggle />
      <LanguageSwitcher />
      <Link
        to="/admin/org-settings"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">ארגון</span>
      </Link>
      {user && (
        <>
          <div className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-[11px] font-bold text-cyan-200"
            title={name || email}
          >
            {initials}
          </div>
          {email ? (
            <span
              className="hidden max-w-[180px] truncate text-[11px] text-white/50 sm:inline"
              title={email}
            >
              {email}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden text-xs font-medium sm:inline">התנתקות</span>
          </Button>
        </>
      )}
    </div>
  );

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
            {t('navigation.proDashboard')}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <VehicleSpecDirtyProvider>
      <div
        className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#020617]"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0d1b2e]">
          {/* בלי flex-row-reverse: ב־RTL האלמנט הראשון נצמד לימין המסך */}
          <div className="mx-auto flex max-w-[1920px] w-full items-center justify-between gap-4 px-6 py-3">
            {/* RTL: פריט ראשון = ימין המסך — מותג+בית; שני = שמאל — כלים */}
            <BrandAndHome />
            <ToolsBlock />
          </div>
        </header>

        <main
          key={location.pathname + location.search}
          className="relative flex-1 overflow-y-auto bg-transparent px-6 py-6"
        >
          {children}
        </main>

        <AIChatAssistant />
      </div>
    </VehicleSpecDirtyProvider>
  );
}
