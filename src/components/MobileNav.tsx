import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  Home,
  Car,
  Truck,
  AlertTriangle,
  AlertCircle,
  MapPin,
  Gauge,
  BarChart3,
  FileText,
  Calculator,
  Droplet,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  Building2,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';

interface NavItem {
  title: string;
  titleKey: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
}

interface NavGroup {
  title: string;
  titleKey: string;
  items: NavItem[];
}

export function MobileNav() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isRtl = i18n.dir() === 'rtl';

  const email = user?.email ?? '';
  const name = user?.user_metadata?.full_name || email.split('@')[0] || 'משתמש';
  const initials = name.slice(0, 2).toUpperCase();
  const toggleLang = () => {
    const next = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(next);
  };
  const sheetSide = isRtl ? 'right' : 'left';

  const navigationGroups: NavGroup[] = [
    {
      title: t('navigation.vehicles'),
      titleKey: 'navigation.vehicles',
      items: [
        { title: t('navigation.fleetManagement'), titleKey: 'navigation.fleetManagement', href: '/vehicles', icon: Car },
        { title: t('navigation.vehicleDelivery'), titleKey: 'navigation.vehicleDelivery', href: '/handover/delivery', icon: Truck },
        { title: 'רכב חליפי', titleKey: 'navigation.replacementVehicle', href: '/handover/replacement', icon: Truck },
        { title: t('navigation.exceptionAlerts'), titleKey: 'navigation.exceptionAlerts', href: '/compliance', icon: AlertTriangle },
      ],
    },
    {
      title: t('navigation.operational'),
      titleKey: 'navigation.operational',
      items: [
        { title: t('navigation.drivers'), titleKey: 'navigation.drivers', href: '/drivers', icon: Car },
        { title: 'טפסים', titleKey: 'navigation.forms', href: '/forms', icon: FileText },
        { title: t('navigation.mileageUpdate'), titleKey: 'navigation.mileageUpdate', href: '/vehicles/odometer', icon: Gauge },
        { title: 'הפקת דוחות', titleKey: 'navigation.reportGeneration', href: '/reports', icon: BarChart3 },
      ],
    },
    {
      title: t('navigation.events'),
      titleKey: 'navigation.events',
      items: [
        { title: t('navigation.accidents'), titleKey: 'navigation.accidents', href: '/maintenance/add', icon: AlertCircle },
        { title: t('navigation.parkingReports'), titleKey: 'navigation.parkingReports', href: '/reports/scan', icon: MapPin },
        { title: t('navigation.procedure6Complaints'), titleKey: 'navigation.procedure6Complaints', href: '/procedure6-complaints', icon: AlertTriangle },
      ],
    },
    {
      title: t('navigation.finance'),
      titleKey: 'navigation.finance',
      items: [
        { title: t('navigation.accounting'), titleKey: 'navigation.accounting', href: '#', icon: Calculator, disabled: true },
        { title: t('navigation.fuel'), titleKey: 'navigation.fuel', href: '#', icon: Droplet, disabled: true },
      ],
    },
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setUserMenuOpen(false);
      }}
    >
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/15 shadow-[0_0_14px_rgba(0,255,255,0.2)]">
              <Car className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight text-white">{t('navigation.fleetManager')}</h1>
              <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 py-4">
          <div className="space-y-6">
            <nav className="space-y-4">
            {/* Home Button */}
            <Link to="/" onClick={() => setOpen(false)} className="block px-3">
              <Button
                variant={location.pathname === '/' ? 'default' : 'ghost'}
                className={cn(
                  'w-full gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left',
                  location.pathname === '/'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                    : 'text-white/70 hover:bg-cyan-500/10 hover:text-white'
                )}
              >
                <Home className="h-5 w-5" />
                {t('navigation.home')}
              </Button>
            </Link>

            {navigationGroups.map((group) => (
              <div key={group.titleKey}>
                <h3 className={cn('mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-cyan-400/60', isRtl ? 'text-right' : 'text-left')}>
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || 
                                     location.pathname.startsWith(item.href + '/');
                    
                    if (item.disabled) {
                      return (
                        <div
                          key={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-not-allowed opacity-50 mx-3',
                            isRtl ? 'flex-row-reverse text-right' : 'text-left',
                            'text-white/40'
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.title}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors mx-3',
                          isRtl ? 'flex-row-reverse text-right' : 'text-left',
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                            : 'text-white/70 hover:bg-cyan-500/10 hover:text-white'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            </nav>

            <div className="mx-3 rounded-2xl border border-cyan-400/20 bg-[#0d1b2e] p-3">
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-cyan-500/10',
                  isRtl ? 'flex-row-reverse text-right' : 'text-left'
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/20 text-xs font-bold text-cyan-300">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{name}</p>
                  <p className="truncate text-[11px] text-white/55">{email}</p>
                </div>
                {userMenuOpen ? (
                  <ChevronUp className="h-4 w-4 text-white/55" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/55" />
                )}
              </button>

              {userMenuOpen && (
                <div className={cn('mt-2 space-y-1 border-t border-white/10 pt-3', isRtl ? 'text-right' : 'text-left')}>
                  <button
                    onClick={toggleTheme}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white',
                      isRtl ? 'flex-row-reverse text-right' : 'text-left'
                    )}
                  >
                    <span className={cn('flex items-center gap-2', isRtl ? 'flex-row-reverse text-right' : 'text-left')}>
                      {theme === 'dark' ? <Moon className="h-4 w-4 text-cyan-300" /> : <Sun className="h-4 w-4 text-amber-400" />}
                      {theme === 'dark' ? 'מצב כהה' : 'מצב בהיר'}
                    </span>
                    <span className="text-xs text-white/50">{theme === 'dark' ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    onClick={toggleLang}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white',
                      isRtl ? 'flex-row-reverse text-right' : 'text-left'
                    )}
                  >
                    <span className={cn('flex items-center gap-2', isRtl ? 'flex-row-reverse text-right' : 'text-left')}>
                      <Globe className="h-4 w-4 text-cyan-300" />
                      {i18n.language === 'he' ? 'שפה: עברית' : 'Language: English'}
                    </span>
                  </button>

                  <Link to="/admin/org-settings" onClick={() => setOpen(false)} className="block">
                    <Button
                      variant="ghost"
                      className={cn(
                        'w-full gap-2 px-3 text-white/85 hover:bg-cyan-500/10 hover:text-white',
                        isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left'
                      )}
                    >
                      <Building2 className="h-4 w-4 text-cyan-300" />
                      הגדרות ארגון
                    </Button>
                  </Link>

                  <Link to="/admin/settings" onClick={() => setOpen(false)} className="block">
                    <Button
                      variant="ghost"
                      className={cn(
                        'w-full gap-2 px-3 text-white/85 hover:bg-cyan-500/10 hover:text-white',
                        isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left'
                      )}
                    >
                      <Settings className="h-4 w-4" />
                      {t('common.settings')}
                    </Button>
                  </Link>

                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full gap-2 px-3 text-red-300 hover:bg-red-500/10 hover:text-red-200',
                      isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left'
                    )}
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('common.logout')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
