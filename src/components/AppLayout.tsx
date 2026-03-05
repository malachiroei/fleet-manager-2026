import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AIChatAssistant } from './AIChatAssistant';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Car } from 'lucide-react';

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
    <div className="flex h-screen overflow-hidden bg-[#020617]">
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <header className="flex h-16 items-center border-b border-white/10 bg-[#0d1b2e] px-4 justify-between">
            <div className="flex items-center gap-3">
              <MobileNav />
              <div className="flex items-center gap-3 ml-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                  <Car className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-base leading-tight">{t('navigation.fleetManager')}</h1>
                  <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </header>
        )}

        {/* Desktop Header with Language Switcher */}
        {!isMobile && (
          <div className="flex h-16 items-center border-b border-white/10 bg-[#0d1b2e] px-6 justify-end gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
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
  );
}
