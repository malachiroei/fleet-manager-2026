import { ReactNode } from 'react';
import { VehicleSpecDirtyProvider } from '@/contexts/VehicleSpecDirtyContext';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AIChatAssistant } from './AIChatAssistant';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import { PwaInstallButton } from './PwaInstallButton';

/** לוגו בשורת הכותרת בדסקטופ בלבד — הסיידבר בלי תמונה כדי למנוע כפילות */
const appLogo = '/og-image.png';
const logoWrapClassName =
  'h-16 w-24 shrink-0 bg-[#0a1525] rounded-xl p-1.5 overflow-hidden flex items-center justify-center';
const logoImgClassName =
  'h-full w-full object-contain object-center scale-[2.1] transform origin-center';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const ThemeToggle = () => (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
      className="h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  return (
    <VehicleSpecDirtyProvider>
    <div className="flex min-h-[100dvh] overflow-x-hidden bg-[#020617]">
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}

      {/* Main Content Area */}
      <div className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <header className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#0d1b2e] px-3 py-2 sm:px-4">
            <div className="flex items-center gap-3">
              <MobileNav />
              <div className="ml-2 flex items-center gap-2 sm:ml-4 sm:gap-3">
                <div className={logoWrapClassName}>
                  <img src={appLogo} alt="Fleet Manager logo" className={logoImgClassName} />
                </div>
                <div>
                  <h1 className="font-bold text-base leading-tight">{t('navigation.fleetManager')}</h1>
                  <p className="hidden text-xs text-cyan-400/60 sm:block">{t('navigation.proDashboard')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PwaInstallButton />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </header>
        )}

        {/* Desktop Header — לוגו + כותרת כמו קודם (תמונה רק כאן; בסיידבר בלי תמונה) */}
        {!isMobile && (
          <div className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#0d1b2e] px-6 py-2">
            <div className="flex items-center gap-3">
              <div className={logoWrapClassName}>
                <img src={appLogo} alt="Fleet Manager logo" className={logoImgClassName} />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">{t('navigation.fleetManager')}</h1>
                <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PwaInstallButton />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-transparent">
          {children}
        </main>
      </div>

      {/* AI Chat Assistant — floating button available on all pages */}
      <AIChatAssistant />
    </div>
    </VehicleSpecDirtyProvider>
  );
}
