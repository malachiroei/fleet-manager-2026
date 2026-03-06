import React, { useState } from 'react';
import {
  DollarSign, AlertCircle, Car, Wrench, Plus, Trash2, ExternalLink,
  ChevronDown, ChevronUp, CalendarDays, Loader2, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useUpdateVehicle } from '@/hooks/useVehicles';
import {
  useVehicleExpenses, useCreateVehicleExpense, useDeleteVehicleExpense,
  useVehicleIncidents, useCreateVehicleIncident, useDeleteVehicleIncident,
  ExpenseCategory,
} from '@/hooks/useVehicleFolders';
import type { Vehicle } from '@/types/fleet';
import { toast } from 'sonner';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}
function currency(n: number) {
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'דלק',
  maintenance: 'תחזוקה',
  insurance: 'ביטוח',
  tire: 'צמיגים',
  fine: 'קנסות',
  wash: 'שטיפה',
  other: 'אחר',
};
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  fuel:        'bg-amber-500/15 text-amber-600 border-amber-500/25',
  maintenance: 'bg-purple-500/15 text-purple-600 border-purple-500/25',
  insurance:   'bg-blue-500/15 text-blue-600 border-blue-500/25',
  tire:        'bg-slate-500/15 text-slate-600 border-slate-500/25',
  fine:        'bg-red-500/15 text-red-600 border-red-500/25',
  wash:        'bg-cyan-500/15 text-cyan-600 border-cyan-500/25',
  other:       'bg-muted text-muted-foreground border-border',
};

// ─── Sub-tab IDs ──────────────────────────────────────────────────────────────
type FolderTab = 'expenses' | 'events' | 'accidents' | 'maintenance';

const FOLDER_TABS: { id: FolderTab; label: string; icon: React.ReactNode }[] = [
  { id: 'expenses',    label: 'הוצאות',  icon: <DollarSign  className="h-4 w-4" /> },
  { id: 'events',      label: 'אירועים', icon: <AlertCircle className="h-4 w-4" /> },
  { id: 'accidents',   label: 'תאונות',  icon: <Car         className="h-4 w-4" /> },
  { id: 'maintenance', label: 'תחזוקה',  icon: <Wrench      className="h-4 w-4" /> },
];

// ═══ Expenses tab ═════════════════════════════════════════════════════════════
function ExpensesTab({ vehicleId }: { vehicleId: string }) {
  const { data: expenses = [], isLoading } = useVehicleExpenses(vehicleId);
  const createExpense = useCreateVehicleExpense();
  const deleteExpense = useDeleteVehicleExpense();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'other' as ExpenseCategory,
    description: '',
    amount: '',
    supplier: '',
    notes: '',
  });

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const submit = async () => {
    if (!form.description || !form.amount) { toast.error('נא למלא תיאור וסכום'); return; }
    await createExpense.mutateAsync({
      vehicle_id: vehicleId,
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount),
      supplier: form.supplier || null,
      invoice_url: null,
      notes: form.notes || null,
    });
    toast.success('הוצאה נוספה');
    setShowForm(false);
    setForm({ expense_date: new Date().toISOString().slice(0, 10), category: 'other', description: '', amount: '', supplier: '', notes: '' });
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">סה"כ הוצאות</p>
            <p className="text-lg font-bold text-foreground">{currency(total)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">רשומות</p>
            <p className="text-lg font-bold text-foreground">{expenses.length}</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" /> הוסף הוצאה
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">הוצאה חדשה</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">תאריך</label>
              <Input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">קטגוריה</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ExpenseCategory }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">סכום (₪)</label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="h-8 text-sm mt-1" />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="text-xs text-muted-foreground">תיאור</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור הוצאה" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ספק</label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="שם ספק" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>ביטול</Button>
            <Button size="sm" onClick={submit} disabled={createExpense.isPending}>
              {createExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <DollarSign className="h-10 w-10 opacity-20" />
          <p className="text-sm">אין הוצאות רשומות לרכב זה</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">תאריך</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">קטגוריה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">תיאור</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">ספק</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs">סכום</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map(exp => (
                <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmt(exp.expense_date)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[exp.category]}`}>
                      {CATEGORY_LABELS[exp.category] ?? exp.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground max-w-[180px] truncate">{exp.description}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{exp.supplier || '—'}</td>
                  <td className="px-3 py-2.5 text-left font-bold text-foreground">{currency(Number(exp.amount))}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => deleteExpense.mutate({ id: exp.id, vehicleId: vehicleId })}
                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-foreground text-right">סה"כ</td>
                <td className="px-3 py-2 text-left font-bold text-foreground text-base">{currency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══ Incidents tab (events or accidents) ══════════════════════════════════════
function IncidentsTab({ vehicleId, type }: { vehicleId: string; type: 'event' | 'accident' }) {
  const { data: incidents = [], isLoading } = useVehicleIncidents(vehicleId, type);
  const createIncident = useCreateVehicleIncident();
  const deleteIncident = useDeleteVehicleIncident();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    incident_date: new Date().toISOString().slice(0, 10),
    description: '',
    location: '',
    damage_desc: '',
    police_report_no: '',
    insurance_claim: '',
    notes: '',
    status: 'open' as 'open' | 'closed',
  });

  const submit = async () => {
    if (!form.description) { toast.error('נא למלא תיאור'); return; }
    await createIncident.mutateAsync({
      vehicle_id: vehicleId,
      incident_type: type,
      incident_date: form.incident_date,
      description: form.description,
      location: form.location || null,
      driver_id: null,
      damage_desc: form.damage_desc || null,
      photo_urls: null,
      police_report_no: form.police_report_no || null,
      insurance_claim: form.insurance_claim || null,
      status: form.status,
      notes: form.notes || null,
    });
    toast.success(type === 'accident' ? 'תאונה נוספה' : 'אירוע נוסף');
    setShowForm(false);
    setForm({ incident_date: new Date().toISOString().slice(0, 10), description: '', location: '', damage_desc: '', police_report_no: '', insurance_claim: '', notes: '', status: 'open' });
  };

  const isAccident = type === 'accident';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{incidents.length} {isAccident ? 'תאונות' : 'אירועים'}</p>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" /> {isAccident ? 'הוסף תאונה' : 'הוסף אירוע'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">{isAccident ? 'תאונה חדשה' : 'אירוע חדש'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">תאריך</label>
              <Input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">מיקום</label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="כתובת / מיקום" className="h-8 text-sm mt-1" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">תיאור {isAccident ? 'התאונה' : 'האירוע'}</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={isAccident ? 'תיאור מהלך התאונה' : 'תיאור האירוע'} className="h-8 text-sm mt-1" />
            </div>
            {isAccident && <>
              <div>
                <label className="text-xs text-muted-foreground">נזק לרכב</label>
                <Input value={form.damage_desc} onChange={e => setForm(f => ({ ...f, damage_desc: e.target.value }))} placeholder="תיאור הנזק" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מס׳ תיק משטרה</label>
                <Input value={form.police_report_no} onChange={e => setForm(f => ({ ...f, police_report_no: e.target.value }))} placeholder="1234567" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תביעת ביטוח</label>
                <Input value={form.insurance_claim} onChange={e => setForm(f => ({ ...f, insurance_claim: e.target.value }))} placeholder="מספר תביעה" className="h-8 text-sm mt-1" />
              </div>
            </>}
            <div>
              <label className="text-xs text-muted-foreground">סטטוס</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">פתוח</SelectItem>
                  <SelectItem value="closed">סגור</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>ביטול</Button>
            <Button size="sm" onClick={submit} disabled={createIncident.isPending}>
              {createIncident.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          {isAccident ? <Car className="h-10 w-10 opacity-20" /> : <AlertCircle className="h-10 w-10 opacity-20" />}
          <p className="text-sm">אין {isAccident ? 'תאונות' : 'אירועים'} רשומים לרכב זה</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map(inc => {
            const open = expandedId === inc.id;
            return (
              <div key={inc.id} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedId(open ? null : inc.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 h-2 w-2 rounded-full ${inc.status === 'open' ? 'bg-amber-400' : 'bg-green-400'}`} />
                    <span className="font-medium text-foreground truncate">{inc.description}</span>
                    {inc.location && <span className="text-muted-foreground text-xs hidden sm:inline">• {inc.location}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mr-3">
                    <span className="text-xs text-muted-foreground">{fmt(inc.incident_date)}</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {open && (
                  <div className="px-4 py-3 space-y-2 border-t border-border bg-card">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">תאריך</p><p className="font-medium">{fmt(inc.incident_date)}</p></div>
                      {inc.location && <div><p className="text-xs text-muted-foreground">מיקום</p><p className="font-medium">{inc.location}</p></div>}
                      {isAccident && inc.damage_desc && <div><p className="text-xs text-muted-foreground">נזק</p><p className="font-medium">{inc.damage_desc}</p></div>}
                      {isAccident && inc.police_report_no && <div><p className="text-xs text-muted-foreground">תיק משטרה</p><p className="font-medium">{inc.police_report_no}</p></div>}
                      {isAccident && inc.insurance_claim && <div><p className="text-xs text-muted-foreground">תביעת ביטוח</p><p className="font-medium">{inc.insurance_claim}</p></div>}
                      <div>
                        <p className="text-xs text-muted-foreground">סטטוס</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${inc.status === 'open' ? 'bg-amber-500/15 text-amber-600 border-amber-500/25' : 'bg-green-500/15 text-green-600 border-green-500/25'}`}>
                          {inc.status === 'open' ? 'פתוח' : 'סגור'}
                        </span>
                      </div>
                    </div>
                    {inc.notes && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">{inc.notes}</p>}
                    <div className="flex justify-end">
                      <button
                        onClick={() => deleteIncident.mutate({ id: inc.id, vehicleId: vehicleId })}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> מחק
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ Maintenance tab ══════════════════════════════════════════════════════════
function MaintenanceTab({ vehicle }: { vehicle: Vehicle }) {
  const updateVehicle = useUpdateVehicle();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    last_service_date:     vehicle.last_service_date ?? '',
    last_service_km:       vehicle.last_service_km?.toString() ?? '',
    next_maintenance_date: vehicle.next_maintenance_date ?? '',
    next_maintenance_km:   vehicle.next_maintenance_km?.toString() ?? '',
    last_tire_change_date: vehicle.last_tire_change_date ?? '',
    next_tire_change_date: vehicle.next_tire_change_date ?? '',
    last_inspection_date:  vehicle.last_inspection_date ?? '',
    next_inspection_date:  vehicle.next_inspection_date ?? '',
  });

  const save = async () => {
    setSaving(true);
    try {
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        last_service_date:     fields.last_service_date || null,
        last_service_km:       fields.last_service_km ? parseInt(fields.last_service_km) : null,
        next_maintenance_date: fields.next_maintenance_date || null,
        next_maintenance_km:   fields.next_maintenance_km ? parseInt(fields.next_maintenance_km) : null,
        last_tire_change_date: fields.last_tire_change_date || null,
        next_tire_change_date: fields.next_tire_change_date || null,
        last_inspection_date:  fields.last_inspection_date || null,
        next_inspection_date:  fields.next_inspection_date || null,
      } as any);
      toast.success('נתוני תחזוקה נשמרו');
      setEditing(false);
    } catch { toast.error('שמירה נכשלה'); }
    finally { setSaving(false); }
  };

  const f = (key: keyof typeof fields) => fields[key] || null;
  const fmtField = (key: keyof typeof fields) => {
    const v = f(key);
    return v ? new Date(v).toLocaleDateString('he-IL') : '—';
  };

  const groups = [
    {
      title: 'טיפול שגרתי',
      color: 'bg-purple-500/10 border-purple-500/20',
      icon: <Wrench className="h-4 w-4 text-purple-600" />,
      rows: [
        { label: 'טיפול אחרון — תאריך', fieldKey: 'last_service_date' as keyof typeof fields, type: 'date' },
        { label: 'טיפול אחרון — ק"מ',   fieldKey: 'last_service_km' as keyof typeof fields,   type: 'number' },
        { label: 'טיפול הבא — תאריך',   fieldKey: 'next_maintenance_date' as keyof typeof fields, type: 'date' },
        { label: 'טיפול הבא — ק"מ',     fieldKey: 'next_maintenance_km' as keyof typeof fields,   type: 'number' },
      ],
    },
    {
      title: 'החלפת צמיגים',
      color: 'bg-slate-500/10 border-slate-500/20',
      icon: <Car className="h-4 w-4 text-slate-500" />,
      rows: [
        { label: 'החלפה אחרונה', fieldKey: 'last_tire_change_date' as keyof typeof fields, type: 'date' },
        { label: 'החלפה הבאה',   fieldKey: 'next_tire_change_date' as keyof typeof fields, type: 'date' },
      ],
    },
    {
      title: 'ביקורת תקופתית',
      color: 'bg-cyan-500/10 border-cyan-500/20',
      icon: <CalendarDays className="h-4 w-4 text-cyan-600" />,
      rows: [
        { label: 'ביקורת אחרונה', fieldKey: 'last_inspection_date' as keyof typeof fields, type: 'date' },
        { label: 'ביקורת הבאה',   fieldKey: 'next_inspection_date' as keyof typeof fields, type: 'date' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>ביטול</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>עריכה</Button>
        )}
      </div>

      {groups.map(g => (
        <div key={g.title} className={`rounded-xl border p-4 space-y-3 ${g.color}`}>
          <div className="flex items-center gap-2">
            {g.icon}
            <h3 className="font-semibold text-sm text-foreground">{g.title}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {g.rows.map(row => (
              <div key={row.fieldKey}>
                <p className="text-xs text-muted-foreground mb-1">{row.label}</p>
                {editing ? (
                  <Input
                    type={row.type === 'date' ? 'date' : 'number'}
                    value={fields[row.fieldKey]}
                    onChange={e => setFields(prev => ({ ...prev, [row.fieldKey]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className={`font-medium text-sm ${fmtField(row.fieldKey) === '—' ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {row.type === 'number' && fields[row.fieldKey]
                      ? `${parseInt(fields[row.fieldKey]).toLocaleString()} ק"מ`
                      : fmtField(row.fieldKey)
                    }
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Main export ══════════════════════════════════════════════════════════════
export function VehicleFolders({ vehicle }: { vehicle: Vehicle }) {
  const [activeTab, setActiveTab] = useState<FolderTab>('expenses');

  return (
    <Card id="vehicle-folders">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>תיקיות ניהול</CardTitle>
        </div>
        {/* Sub-tab pills */}
        <div className="flex gap-1 flex-wrap">
          {FOLDER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {activeTab === 'expenses' && <ExpensesTab vehicleId={vehicle.id} />}
        {activeTab === 'events' && <IncidentsTab vehicleId={vehicle.id} type="event" />}
        {activeTab === 'accidents' && <IncidentsTab vehicleId={vehicle.id} type="accident" />}
        {activeTab === 'maintenance' && <MaintenanceTab vehicle={vehicle} />}
      </CardContent>
    </Card>
  );
}
