import React from 'react';
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
  Calculator,
  Droplet,
  Settings,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';
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

export function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { t } = useTranslation();

  const navigationGroups: NavGroup[] = [
    {
      title: t('navigation.vehicles'),
      titleKey: 'navigation.vehicles',
      items: [
        { title: t('navigation.fleetManagement'), titleKey: 'navigation.fleetManagement', href: '/vehicles', icon: Car },
        { title: t('navigation.vehicleDelivery'), titleKey: 'navigation.vehicleDelivery', href: '/handover/delivery', icon: Truck },
        { title: t('navigation.exceptionAlerts'), titleKey: 'navigation.exceptionAlerts', href: '/compliance', icon: AlertTriangle },
      ],
    },
    {
      title: t('navigation.operational'),
      titleKey: 'navigation.operational',
      items: [
        { title: t('navigation.drivers'), titleKey: 'navigation.drivers', href: '/drivers', icon: Car },
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
    <div className="glass flex h-full w-64 flex-col text-white">
      {/* Logo/Header */}
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/15 shadow-[0_0_14px_rgba(0,255,255,0.2)]">
            <Car className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight text-white">{t('navigation.fleetManager')}</h1>
            <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-4">
          {/* Home Button */}
          <Link to="/" className="block">
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300',
                location.pathname === '/'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                  : 'text-white/70 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]'
              )}
            >
              <Home className="h-5 w-5" />
              {t('navigation.home')}
            </Button>
          </Link>

          {navigationGroups.map((group) => (
            <div key={group.titleKey}>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-cyan-400/60">
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
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed opacity-40 text-white/50"
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
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300',
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                          : 'text-white/70 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.title}
                      {isActive && <ChevronRight className="ml-auto h-4 w-4 text-cyan-400" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="border-t border-white/10 p-3 space-y-2">
        <Link to="/admin/settings" className="block">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-white/70 transition-all duration-300 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]"
          >
            <Settings className="h-5 w-5" />
            {t('common.settings')}
          </Button>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-white/70 transition-all duration-300 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]"
          onClick={signOut}
        >
          <LogOut className="h-5 w-5" />
          {t('common.logout')}
        </Button>
      </div>
    </div>
  );
}
