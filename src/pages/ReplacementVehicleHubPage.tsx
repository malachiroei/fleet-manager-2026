import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, RotateCcw, Truck, Sparkles, ChevronLeft, Car, User, Gauge, Calendar, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useActiveReplacementHandovers } from '@/hooks/useHandovers';

function formatHandoverDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHandoverTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function ReplacementVehicleHubPage() {
  const { data: activeReplacements = [], isLoading, isError } = useActiveReplacementHandovers();
  const [showActiveList, setShowActiveList] = useState(false);

  useEffect(() => {
    if (activeReplacements.length > 0) {
      setShowActiveList(true);
    }
  }, [activeReplacements.length]);

  const activeCount = activeReplacements.length;

  return (
    <div className="relative text-slate-900 dark:text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.12),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />
      <main className="container relative space-y-4 py-4 md:space-y-6 md:py-6">
        <Card className="overflow-hidden border-slate-200 bg-white text-slate-900 shadow-md dark:border-cyan-400/25 dark:bg-[#08162a] dark:text-white dark:shadow-none">
          <CardHeader className="border-b border-slate-200 bg-slate-50 text-slate-950 dark:border-cyan-400/15 dark:bg-gradient-to-r dark:from-cyan-950/80 dark:to-[#08162a] dark:text-white">
            <CardTitle className="flex items-center gap-2 text-xl text-slate-950 dark:text-white">
              <Repeat className="h-6 w-6 shrink-0 text-cyan-600 dark:text-cyan-300" />
              פעולות רכב חליפי
            </CardTitle>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-cyan-100/85">
              <Sparkles className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-200" />
              בחרי פעולה והמשיכי לטופס המותאם לרכב חליפי
            </p>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
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

            <button
              type="button"
              onClick={() => setShowActiveList((prev) => !prev)}
              className="group block w-full text-right"
            >
              <div
                className={cn(
                  'status-card relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-300',
                  'border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-md hover:-translate-y-1 hover:shadow-lg',
                  'dark:border-amber-300/35 dark:from-[#2a2210] dark:to-[#08182d] dark:shadow-[0_18px_40px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_24px_60px_rgba(245,158,11,0.35)]',
                  showActiveList && 'ring-2 ring-amber-400/50 dark:ring-amber-300/40',
                )}
              >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 via-transparent to-slate-100/30 opacity-90 dark:from-white/[0.05] dark:via-transparent dark:to-white/[0.02] dark:opacity-80" />

                <div className="relative z-10 mt-1 flex flex-col items-center gap-3 text-center">
                  <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md dark:from-amber-400 dark:to-orange-500 dark:shadow-[0_0_18px_rgba(245,158,11,0.55)]">
                    <Car className="h-7 w-7 text-white" />
                    {activeCount > 0 && (
                      <Badge className="absolute -left-2 -top-2 h-5 min-w-5 justify-center rounded-full border-0 bg-white px-1.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        {activeCount}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">רכבים חליפים בשימוש</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-amber-100/70">
                      {activeCount > 0
                        ? `${activeCount} רכבים חליפים פעילים כרגע`
                        : 'אין רכב חליפי פעיל כרגע'}
                    </p>
                  </div>
                </div>

                <div className="relative z-10 mb-1 mt-4 flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-white/80">
                  <div className="status-card-entry-btn flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-slate-100 dark:border-white/25 dark:bg-white/5 dark:backdrop-blur-sm">
                    <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', showActiveList && 'rotate-90')} />
                  </div>
                  <span className="tracking-wide">{showActiveList ? 'הסתר פירוט' : 'הצג פירוט'}</span>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>

        {showActiveList && (
          <Card className="overflow-hidden border-slate-200 bg-white text-slate-900 shadow-md dark:border-cyan-400/25 dark:bg-[#08162a] dark:text-white dark:shadow-none">
            <CardHeader className="border-b border-slate-200 bg-slate-50 dark:border-cyan-400/15 dark:bg-[#0a1a30]">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                רכבים חליפים בשימוש
                {activeCount > 0 && (
                  <Badge variant="secondary" className="mr-1 text-xs">
                    {activeCount}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-slate-600 dark:text-cyan-100/70">
                פירוט מסירות חליפיות פעילות — מסירה אחרונה לכל רכב ללא החזרה
              </p>
            </CardHeader>

            <CardContent className="p-4 md:p-5">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  טוען רכבים חליפים פעילים...
                </div>
              )}

              {isError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  לא ניתן לטעון את רשימת הרכבים החליפים. נסו שוב מאוחר יותר.
                </p>
              )}

              {!isLoading && !isError && activeCount === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-cyan-400/20 dark:text-cyan-100/60">
                  אין כרגע רכב חליפי בשימוש. לאחר מסירת רכב חליפי, הפרטים יופיעו כאן.
                </p>
              )}

              {!isLoading && !isError && activeCount > 0 && (
                <div className="space-y-3">
                  {activeReplacements.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-cyan-400/20 dark:bg-[#0d233b]/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:bg-amber-400/15 dark:text-amber-200">
                              רכב חליפי פעיל
                            </Badge>
                            <Link
                              to={`/vehicles/${item.vehicle_id}`}
                              className="text-base font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                            >
                              {item.vehicle_label} ({item.plate_number})
                            </Link>
                          </div>

                          <div className="grid gap-2 text-sm text-slate-700 dark:text-cyan-50/85 sm:grid-cols-2">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 shrink-0 text-slate-500 dark:text-cyan-300/70" />
                              <span>
                                נהג: <strong>{item.driver_label}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 shrink-0 text-slate-500 dark:text-cyan-300/70" />
                              <span>
                                מסירה: <strong>{formatHandoverDate(item.handover_date)}</strong>
                                {formatHandoverTime(item.handover_date) && (
                                  <span className="text-muted-foreground"> · {formatHandoverTime(item.handover_date)}</span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Gauge className="h-4 w-4 shrink-0 text-slate-500 dark:text-cyan-300/70" />
                              <span>
                                ק״מ במסירה:{' '}
                                <strong>
                                  {item.odometer_reading != null
                                    ? item.odometer_reading.toLocaleString('he-IL')
                                    : '—'}
                                </strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 shrink-0 text-slate-500 dark:text-cyan-300/70" />
                              <span>סוג: <strong>מסירת רכב חליפי</strong></span>
                            </div>
                          </div>
                        </div>

                        <Link
                          to={`/vehicles/${item.vehicle_id}#handover-history`}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-500/10 dark:text-cyan-300"
                        >
                          פרטי רכב
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
