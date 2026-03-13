import { Link } from 'react-router-dom';
import { Repeat, RotateCcw, Truck, Sparkles, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReplacementVehicleHubPage() {
  return (
    <div className="relative text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />
      <main className="container relative py-4 md:py-6">
        <Card className="overflow-hidden border-cyan-400/25 bg-[#08162a]">
          <CardHeader className="border-b border-cyan-400/15 bg-gradient-to-r from-cyan-500/10 to-transparent">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Repeat className="h-6 w-6 text-cyan-300" />
              פעולות רכב חליפי
            </CardTitle>
            <p className="flex items-center gap-2 text-sm text-cyan-100/75">
              <Sparkles className="h-4 w-4" />
              בחרי פעולה והמשיכי לטופס המותאם לרכב חליפי
            </p>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Link to="/handover/delivery?mode=replacement" className="group block">
              <div className="status-card relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border border-cyan-300/35 bg-gradient-to-b from-[#0d233b] to-[#08182d] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(34,211,238,0.45)]">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.05] via-transparent to-white/[0.02] opacity-80 pointer-events-none" />

                <div className="relative z-10 mt-1 flex flex-col items-center gap-3 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 shadow-[0_0_18px_rgba(34,211,238,0.55)]">
                    <Truck className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">מסירת רכב חליפי</p>
                    <p className="mt-1 text-xs text-cyan-100/70">פתיחת טופס קבלת רכב חליפי לנהג</p>
                  </div>
                </div>

                <div className="relative z-10 mb-1 mt-4 flex items-center gap-1 text-[11px] font-medium text-white/80">
                  <div className="status-card-entry-btn flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 backdrop-blur-sm">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </div>
                  <span className="tracking-wide">כניסה</span>
                </div>
              </div>
            </Link>

            <Link to="/handover/return?mode=replacement" className="group block">
              <div className="status-card relative flex h-full flex-col items-center justify-between overflow-hidden rounded-2xl border border-emerald-300/35 bg-gradient-to-b from-[#0d2435] to-[#08182d] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(16,185,129,0.45)]">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.05] via-transparent to-white/[0.02] opacity-80 pointer-events-none" />

                <div className="relative z-10 mt-1 flex flex-col items-center gap-3 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-[0_0_18px_rgba(16,185,129,0.55)]">
                    <RotateCcw className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">החזרת רכב חליפי</p>
                    <p className="mt-1 text-xs text-emerald-100/70">פתיחת טופס החזרה ובדיקת מצב הרכב</p>
                  </div>
                </div>

                <div className="relative z-10 mb-1 mt-4 flex items-center gap-1 text-[11px] font-medium text-white/80">
                  <div className="status-card-entry-btn flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/5 backdrop-blur-sm">
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
