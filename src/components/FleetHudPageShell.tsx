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

      <div className="container relative z-[2] mx-auto max-w-[1920px] space-y-4 py-3 pb-24 sm:space-y-5 sm:pb-10 md:py-4">
        <div className="dashboard-hud-header-card relative overflow-hidden rounded-2xl border-t border-l border-white/[0.16] border-b border-r border-black/55 p-4 md:rounded-3xl md:p-5">
          <div className="hud-status-card-carbon pointer-events-none absolute inset-0 rounded-2xl opacity-50 md:rounded-3xl" aria-hidden />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="min-w-0 shrink">
              <h1 className="dashboard-cyber-hero-title text-lg font-bold tracking-tight text-white sm:text-xl md:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="relative mt-1 max-w-2xl text-xs leading-relaxed hud-dashboard-label sm:text-sm">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {headerAside ? (
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{headerAside}</div>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
