import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * אותה מעטפת ויזואלית כמו לוח הבקרה: רקע HUD, רשת, עדשות, כרטיס כותרת עם טיפוגרפיית hero.
 */
export function FleetHudPageShell({
  title,
  subtitle,
  headerAside,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  headerAside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'dashboard-cyber-page dashboard-page-hud relative isolate z-[1] -mx-6 w-[calc(100%+3rem)] max-w-none shrink-0 px-6 pt-1 pb-8 md:pb-10',
        className,
      )}
    >
      <div className="dashboard-cyber-lens dashboard-cyber-lens--top select-none" aria-hidden />
      <div className="dashboard-cyber-lens dashboard-cyber-lens--bottom select-none" aria-hidden />
      <div className="dashboard-cyber-vignette select-none" aria-hidden />
      <div className="dashboard-cyber-grid select-none" aria-hidden />

      <div className="container relative z-[2] mx-auto max-w-[1920px] space-y-6 md:space-y-8 py-5 md:py-7 pb-24 sm:pb-10">
        <div className="dashboard-hud-header-card rounded-3xl border-t border-l border-white/[0.16] border-b border-r border-black/55 p-5 md:p-8 relative overflow-hidden">
          <div className="hud-status-card-carbon pointer-events-none absolute inset-0 rounded-3xl opacity-50" aria-hidden />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="dashboard-cyber-hero-title text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white">
                {title}
              </h1>
              {subtitle ? (
                <p className="relative mt-2 text-xs sm:text-sm md:text-base hud-dashboard-label max-w-2xl leading-relaxed">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {headerAside ? (
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">{headerAside}</div>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
