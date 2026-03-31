import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Home, Menu, User } from 'lucide-react';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganizations';
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
  const { user, profile, activeOrgId, isAdmin } = useAuth();
  const { data: organization } = useOrganization(activeOrgId ?? null);
  const orgName = organization?.name?.trim() ?? '';
  const email = user?.email ?? '';

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
          <SheetTitle
            className={cn(
              'flex items-center gap-3',
              isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left',
            )}
          >
            <BrandLogo size="sidebar" className="mx-2 drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]" />
            <div>
              <h1 className="font-bold text-base leading-tight text-white">{orgName || t('navigation.fleetManager')}</h1>
              <p className="text-xs text-cyan-400/60 truncate" title={email}>{email || t('navigation.proDashboard')}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 py-4">
          <div className="space-y-4">
            <nav className="px-1">
              <Link
                to="/"
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  try {
                    window.dispatchEvent(new CustomEvent('app:go-home'));
                  } catch {
                    // ignore
                  }
                  if (isDirty) {
                    tryNavigate('/');
                    return;
                  }
                  window.location.assign(`${window.location.origin}/`);
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
            {isAdmin && (profile?.email ?? '').toLowerCase() === 'malachiroei@gmail.com' && (
              <nav className="px-1">
                <Link
                  to="/team"
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  <Button
                    variant={location.pathname === '/team' ? 'default' : 'ghost'}
                    className={cn(
                      'w-full gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left',
                      location.pathname === '/team'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                        : 'text-white/70 hover:bg-cyan-500/10 hover:text-white'
                    )}
                  >
                    <User className="h-5 w-5" />
                    ניהול צוות
                  </Button>
                </Link>
              </nav>
            )}
            <p className="mx-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/50">
              שאר הפריטים — בפעולות מהירות בדשבורד. מצב כהה, שפה, התנתקות — בשורת הכותרת.
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
