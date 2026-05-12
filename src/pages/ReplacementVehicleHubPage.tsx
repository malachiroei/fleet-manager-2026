import { Link } from 'react-router-dom';
import { Repeat, RotateCcw, Truck, Sparkles, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function ReplacementVehicleHubPage() {
  return (
    <div className="relative text-foreground dark:text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.12),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />
      <main className="container relative py-4 md:py-6">
        <Card className="overflow-hidden border-slate-200 bg-white shadow-md dark:border-cyan-400/25 dark:bg-[#08162a] dark:shadow-none">
          <CardHeader className="border-b border-slate-200 bg-slate-50 dark:border-cyan-400/15 dark:bg-gradient-to-r dark:from-cyan-500/10 dark:to-transparent">
            <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
              <Repeat className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
              פעולות רכב חליפי
            </CardTitle>
            <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-cyan-100/75">
              <Sparkles className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-200" />
              בחרי פעולה והמשיכי לטופס המותאם לרכב חליפי
            </p>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Link to="/handover/delivery?mode=replacement" className="group block">
              <div
                className={cn(
                  'status-card relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-300',
                  'border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-md hover:-translate-y-1 hover:shadow-lg',
                  'dark:border-cyan-300/35 dark:from-[#0d233b] dark:to-[#08182d] dark:shadow-[0_18px_40px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_24px_60px_rgba(34,211,238,0.45)]',
                )}
              >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 via-transparent to-slate-100/30 opacity-90 dark:from-white/[0.05] dark:via-transparent dark:to-white/[0.02] dark:opacity-80" />

                <div className="relative z-10 mt-1 flex flex-col items-center gap-3 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 shadow-md dark:from-cyan-400 dark:to-sky-500 dark:shadow-[0_0_18px_rgba(34,211,238,0.55)]">
                    <Truck className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">מסירת רכב חליפי</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-cyan-100/70">פתיחת טופס קבלת רכב חליפי לנהג</p>
                  </div>
                </div>

                <div className="relative z-10 mb-1 mt-4 flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-white/80">
                  <div className="status-card-entry-btn flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-slate-100 dark:border-white/25 dark:bg-white/5 dark:backdrop-blur-sm">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </div>
                  <span className="tracking-wide">כניסה</span>
                </div>
              </div>
            </Link>

            <Link to="/handover/return?mode=replacement" className="group block">
              <div
                className={cn(
                  'status-card relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-300',
                  'border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-md hover:-translate-y-1 hover:shadow-lg',
                  'dark:border-emerald-300/35 dark:from-[#0d2435] dark:to-[#08182d] dark:shadow-[0_18px_40px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_24px_60px_rgba(16,185,129,0.45)]',
                )}
              >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 via-transparent to-slate-100/30 opacity-90 dark:from-white/[0.05] dark:via-transparent dark:to-white/[0.02] dark:opacity-80" />

                <div className="relative z-10 mt-1 flex flex-col items-center gap-3 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md dark:from-emerald-400 dark:to-teal-500 dark:shadow-[0_0_18px_rgba(16,185,129,0.55)]">
                    <RotateCcw className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">החזרת רכב חליפי</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/70">פתיחת טופס החזרה ובדיקת מצב הרכב</p>
                  </div>
                </div>

                <div className="relative z-10 mb-1 mt-4 flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-white/80">
                  <div className="status-card-entry-btn flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-slate-100 dark:border-white/25 dark:bg-white/5 dark:backdrop-blur-sm">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </div>
                  <span className="tracking-wide">כניסה</span>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
