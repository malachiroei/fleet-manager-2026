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
  FileText,
  Calculator,
  Droplet,
  ArrowLeftRight,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { useLabel, useIsVisible } from '@/hooks/useUiLabels';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { SidebarUserMenu } from './SidebarUserMenu';
import { BrandLogo } from './BrandLogo';

interface NavItem {
  title: string;
  titleKey: string;
  uiKey?: string;
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
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const isVis = useIsVisible();
  const isRtl = i18n.dir() === 'rtl';

  const navigationGroups: NavGroup[] = [
    {
      title: t('navigation.vehicles'),
      titleKey: 'navigation.vehicles',
      items: [
        { title: t('navigation.fleetManagement'), titleKey: 'navigation.fleetManagement', uiKey: 'nav.fleet_management', href: '/vehicles', icon: Car },
        { title: 'העברות', titleKey: 'navigation.transfers', uiKey: 'nav.transfers', href: '/vehicles/transfers', icon: ArrowLeftRight },
        { title: t('navigation.vehicleDelivery'), titleKey: 'navigation.vehicleDelivery', uiKey: 'nav.vehicle_delivery', href: '/handover/delivery', icon: Truck },
        { title: 'רכב חליפי', titleKey: 'navigation.replacementVehicle', href: '/handover/replacement', icon: Truck },
        { title: t('navigation.exceptionAlerts'), titleKey: 'navigation.exceptionAlerts', uiKey: 'nav.compliance', href: '/compliance', icon: AlertTriangle },
      ],
    },
    {
      title: t('navigation.operational'),
      titleKey: 'navigation.operational',
      items: [
        { title: t('navigation.drivers'), titleKey: 'navigation.drivers', uiKey: 'nav.drivers', href: '/drivers', icon: Car },
        { title: 'טפסים', titleKey: 'navigation.forms', uiKey: 'nav.forms', href: '/forms', icon: FileText },
        { title: t('navigation.mileageUpdate'), titleKey: 'navigation.mileageUpdate', uiKey: 'nav.mileage_update', href: '/vehicles/odometer', icon: Gauge },
        { title: 'הפקת דוחות', titleKey: 'navigation.reportGeneration', uiKey: 'nav.reports', href: '/reports', icon: BarChart3 },
      ],
    },
    {
      title: t('navigation.events'),
      titleKey: 'navigation.events',
      items: [
        { title: t('navigation.accidents'), titleKey: 'navigation.accidents', uiKey: 'nav.accidents', href: '/maintenance/add', icon: AlertCircle },
        { title: t('navigation.parkingReports'), titleKey: 'navigation.parkingReports', uiKey: 'nav.parking', href: '/reports/scan', icon: MapPin },
        { title: t('navigation.procedure6Complaints'), titleKey: 'navigation.procedure6Complaints', uiKey: 'nav.complaints', href: '/procedure6-complaints', icon: AlertTriangle },
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
    <div dir={isRtl ? 'rtl' : 'ltr'} className="glass flex h-full w-64 flex-col text-white">
      {/* Logo/Header */}
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div className="flex items-center gap-3">
          <BrandLogo
            size="sidebar"
            className="drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]"
          />
          <div className={cn(isRtl ? 'text-right' : 'text-left')}>
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
                'w-full gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300',
                isRtl ? 'flex-row-reverse justify-end text-right' : 'justify-start text-left',
                location.pathname === '/'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                  : 'text-white/70 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]'
              )}
            >
              <Home className="h-5 w-5" />
              {t('navigation.home')}
            </Button>
          </Link>

          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => {
              if (item.uiKey === 'nav.forms') return true;
              return !item.uiKey || isVis(item.uiKey);
            });
            if (visibleItems.length === 0) return null;
            return (
            <div key={group.titleKey}>
              <h3 className={cn('mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-cyan-400/60', isRtl ? 'text-right' : 'text-left')}>
                {group.title}
              </h3>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const isActive = location.pathname === item.href || 
                                   location.pathname.startsWith(item.href + '/');
                  const ActiveChevron = isRtl ? ChevronLeft : ChevronRight;
                  
                  if (item.disabled) {
                    return (
                      <div
                        key={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed opacity-40 text-white/50',
                          isRtl ? 'flex-row-reverse text-right' : 'text-left'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.uiKey ? label(item.uiKey, item.title) : item.title}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300',
                        isRtl ? 'flex-row-reverse text-right' : 'text-left',
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                          : 'text-white/70 hover:bg-cyan-500/10 hover:text-white hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.uiKey ? label(item.uiKey, item.title) : item.title}
                      {isActive && <ActiveChevron className={cn('h-4 w-4 text-cyan-400', isRtl ? 'mr-auto' : 'ml-auto')} />}
                    </Link>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer — User Menu */}
      <div className="border-t border-white/10 p-3">
        <SidebarUserMenu />
      </div>
    </div>
  );
}
