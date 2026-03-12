import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useVehicleSpecDirty } from '@/contexts/VehicleSpecDirtyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Home } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

/**
 * סרגל צד מצומצם: רק בית. שאר הניווט בפעולות מהירות בדשבורד ובכותרת עליונה.
 */
export function Sidebar() {
  const location = useLocation();
  const { tryNavigate, getIsDirty } = useVehicleSpecDirty();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === 'rtl';

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="glass flex h-full w-64 flex-col text-white">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div className={cn('min-w-0 flex-1', isRtl ? 'text-right' : 'text-left')}>
          <h1 className="text-base font-bold leading-tight text-white">{t('navigation.fleetManager')}</h1>
          <p className="text-xs text-cyan-400/60">{t('navigation.proDashboard')}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-4">
          <Link
            to="/"
            className="block"
            onClick={(e) => {
              if (!getIsDirty()) return;
              e.preventDefault();
              tryNavigate('/');
            }}
          >
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
          <p className="px-3 text-xs text-cyan-400/50 leading-relaxed">
            שאר הפריטים — בפעולות מהירות בדשבורד ובכותרת למעלה.
          </p>
        </nav>
      </ScrollArea>
    </div>
  );
}
