import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Car } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

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
            <LanguageSwitcher />
          </header>
        )}

        {/* Desktop Header with Language Switcher */}
        {!isMobile && (
          <div className="flex h-16 items-center border-b border-white/10 bg-[#0d1b2e] px-6 justify-end">
            <LanguageSwitcher />
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}
