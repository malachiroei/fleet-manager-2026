import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, Car, Search, Truck, RotateCcw, Filter } from 'lucide-react';
import { useHandoverHistory } from '@/hooks/useHandovers';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPE_LABEL: Record<string, { text: string; icon: React.ReactNode; variant: string }> = {
  delivery: {
    text: 'מסירה',
    icon: <Truck className="h-3.5 w-3.5" />,
    variant: 'delivery',
  },
  return: {
    text: 'החזרה',
    icon: <RotateCcw className="h-3.5 w-3.5" />,
    variant: 'return',
  },
};

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function TransfersPage() {
  const { data: handovers = [], isLoading } = useHandoverHistory();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'delivery' | 'return'>('all');
  const [sort, setSort] = useState<'date_desc' | 'date_asc'>('date_desc');

  const filtered = useMemo(() => {
    let list = [...handovers];

    if (typeFilter !== 'all') {
      list = list.filter((h) => h.handover_type === typeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (h) =>
          h.vehicle_label.toLowerCase().includes(q) ||
          h.driver_label.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const diff = new Date(a.handover_date).getTime() - new Date(b.handover_date).getTime();
      return sort === 'date_desc' ? -diff : diff;
    });

    return list;
  }, [handovers, search, typeFilter, sort]);

  const deliveryCount = handovers.filter((h) => h.handover_type === 'delivery').length;
  const returnCount = handovers.filter((h) => h.handover_type === 'return').length;

  return (
    <div className="min-h-screen p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/vehicles">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">העברות רכבים</h1>
          <p className="text-sm text-muted-foreground">כל מסירות והחזרות הרכבים במערכת</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
            <Car className="h-4 w-4 text-sky-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">סה"כ העברות</p>
            <p className="text-lg font-bold text-foreground">{handovers.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Truck className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">מסירות</p>
            <p className="text-lg font-bold text-foreground">{deliveryCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <RotateCcw className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">החזרות</p>
            <p className="text-lg font-bold text-foreground">{returnCount}</p>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש רכב או נהג..."
            className="pr-9 h-9 text-sm"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="h-9 w-36 text-sm gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="delivery">מסירות בלבד</SelectItem>
            <SelectItem value="return">החזרות בלבד</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 text-sm"
          onClick={() => setSort((s) => (s === 'date_desc' ? 'date_asc' : 'date_desc'))}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort === 'date_desc' ? 'חדש → ישן' : 'ישן → חדש'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Car className="h-12 w-12 opacity-25" />
            <p className="text-sm">לא נמצאו העברות תואמות</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground w-10">#</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">תאריך ושעה</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">מספר רכב</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">שם נהג</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">סוג פעולה</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">מסמך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((h, idx) => {
                  const typeInfo = TYPE_LABEL[h.handover_type] ?? TYPE_LABEL.delivery;
                  return (
                    <tr
                      key={h.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{formatDate(h.handover_date)}</span>
                        <span className="block text-[11px] text-muted-foreground">{formatTime(h.handover_date)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/vehicles/${h.vehicle_id}`}
                          className="font-bold text-primary hover:underline"
                        >
                          {h.vehicle_label}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{h.driver_label || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={[
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                            h.handover_type === 'delivery'
                              ? 'bg-emerald-500/12 text-emerald-600 border border-emerald-500/20'
                              : 'bg-amber-500/12 text-amber-600 border border-amber-500/20',
                          ].join(' ')}
                        >
                          {typeInfo.icon}
                          {typeInfo.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {h.form_url ? (
                          <a
                            href={h.form_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted/40 transition-colors inline-block"
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer count */}
        {!isLoading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground text-left">
            מציג {filtered.length} מתוך {handovers.length} העברות
          </div>
        )}
      </div>
    </div>
  );
}
