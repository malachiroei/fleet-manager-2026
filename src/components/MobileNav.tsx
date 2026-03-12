import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Home, Menu } from 'lucide-react';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { BrandLogo } from './BrandLogo';

export function MobileNav() {
  const { tryNavigate, getIsDirty } = useVehicleSpecDirty();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const isRtl = i18n.dir() === 'rtl';
  const sheetSide = isRtl ? 'right' : 'left';
  const isDirty = getIsDirty();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={sheetSide}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="flex w-72 flex-col border-white/10 bg-[#020617] p-4 text-white sm:w-80"
      >
        <SheetHeader>
          <SheetTitle className={cn('flex items-center gap-3', isRtl ? 'text-right' : 'text-left')}>
            <BrandLogo size="sidebar" className="drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]" />
            <div>
              <h1 className="font-bold text-base leading-tight text-white">{t('navigation.fleetManager')}</h1>
              <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 py-4">
          <div className="space-y-4">
            <nav className="px-1">
              <Link
                to="/"
                onClick={(e) => {
                  if (isDirty) {
                    e.preventDefault();
                    tryNavigate('/');
                  }
                  setOpen(false);
                }}
                className="block"
              >
                <Button
                  variant={location.pathname === '/' ? 'default' : 'ghost'}
                  className={cn(
                    'w-full gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left',
                    location.pathname === '/'
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                      : 'text-white/70 hover:bg-cyan-500/10 hover:text-white'
                  )}
                >
                  <Home className="h-5 w-5" />
                  {t('navigation.home')}
                </Button>
              </Link>
            </nav>
            <p className="mx-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/50">
              שאר הפריטים — בפעולות מהירות בדשבורד. מצב כהה, שפה, התנתקות — בשורת הכותרת.
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
