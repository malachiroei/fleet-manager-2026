import { Link } from 'react-router-dom';
import { ArrowRight, Repeat, RotateCcw, Truck, Sparkles, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReplacementVehicleHubPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">רכב חליפי</h1>
          </div>
        </div>
      </header>

      <main className="container relative py-6">
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
              <div className="rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-cyan-400/15 via-[#0c223a] to-[#0a1a2d] p-5 shadow-[0_12px_28px_rgba(0,255,255,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(0,255,255,0.18)]">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/45 bg-cyan-500/20">
                    <Truck className="h-5 w-5 text-cyan-200" />
                  </div>
                  <ChevronLeft className="h-5 w-5 text-cyan-200/70 transition-transform duration-300 group-hover:-translate-x-1" />
                </div>
                <p className="text-lg font-semibold text-white">מסירת רכב חליפי</p>
                <p className="mt-1 text-sm text-cyan-100/70">פתיחת טופס קבלת רכב חליפי לנהג</p>
              </div>
            </Link>

            <Link to="/handover/return?mode=replacement" className="group block">
              <div className="rounded-2xl border border-emerald-300/35 bg-gradient-to-br from-emerald-400/14 via-[#0d2435] to-[#0a1c2a] p-5 shadow-[0_12px_28px_rgba(16,185,129,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(16,185,129,0.18)]">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/45 bg-emerald-500/20">
                    <RotateCcw className="h-5 w-5 text-emerald-200" />
                  </div>
                  <ChevronLeft className="h-5 w-5 text-emerald-200/70 transition-transform duration-300 group-hover:-translate-x-1" />
                </div>
                <p className="text-lg font-semibold text-white">החזרת רכב חליפי</p>
                <p className="mt-1 text-sm text-emerald-100/70">פתיחת טופס החזרה ובדיקת מצב הרכב</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
