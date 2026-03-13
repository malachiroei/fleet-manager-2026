import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useDriverIncidents,
  useCreateDriverIncident,
  useDeleteDriverIncident,
  useDriverFamilyMembers,
  useCreateDriverFamilyMember,
  useDeleteDriverFamilyMember,
  type DriverIncidentType,
} from '@/hooks/useDriverFolders';
import { useComplaints } from '@/hooks/useComplaints';
import { useHandoverHistory } from '@/hooks/useHandovers';
import { useDriverDocuments } from '@/hooks/useDriverDocuments';
import { useDriverStorageFiles } from '@/hooks/useDriverStorageFiles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Car,
  Users,
  ArrowLeftRight,
  MessageSquareWarning,
  FileText,
  ExternalLink,
  Eye,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  FolderOpen,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Driver } from '@/types/fleet';

// ─── Types ────────────────────────────────────────────────────────────────────

type FolderTab = 'events' | 'accidents' | 'complaints' | 'transfers' | 'family' | 'documents';

interface Props {
  driver: Driver;
  /** When true, folders are hidden behind a trigger button (less clutter on detail page) */
  collapsible?: boolean;
  /** Initial open state when collapsible (default false) */
  defaultOpen?: boolean;
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-primary text-primary bg-primary/5'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ─── Incidents tab (events & accidents) ──────────────────────────────────────

function IncidentsTab({
  driver,
  incidentType,
}: {
  driver: Driver;
  incidentType: DriverIncidentType;
}) {
  const { data: incidents = [], isLoading } = useDriverIncidents(driver.id, incidentType);
  const createIncident = useCreateDriverIncident();
  const deleteIncident = useDeleteDriverIncident();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    incident_date: '',
    description: '',
    location: '',
    vehicle_id: '',
    damage_desc: '',
    police_report_no: '',
    insurance_claim: '',
    notes: '',
    status: 'open' as 'open' | 'closed',
  });

  const isAccident = incidentType === 'accident';

  const handleCreate = () => {
    if (!form.incident_date || !form.description) return;
    createIncident.mutate(
      {
        driver_id: driver.id,
        vehicle_id: form.vehicle_id || null,
        incident_type: incidentType,
        incident_date: form.incident_date,
        description: form.description,
        location: form.location || null,
        damage_desc: form.damage_desc || null,
        police_report_no: form.police_report_no || null,
        insurance_claim: form.insurance_claim || null,
        photo_urls: null,
        status: form.status,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({
            incident_date: '',
            description: '',
            location: '',
            vehicle_id: '',
            damage_desc: '',
            police_report_no: '',
            insurance_claim: '',
            notes: '',
            status: 'open',
          });
        },
      }
    );
  };

  const labelSingle = isAccident ? 'תאונה' : 'אירוע';
  const labelPlural = isAccident ? 'תאונות' : 'אירועים';

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {incidents.length} {labelPlural}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 ml-1" />
          הוסף {labelSingle}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{labelSingle} חדש/ה</p>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">תאריך *</label>
                <Input
                  type="date"
                  value={form.incident_date}
                  onChange={(e) => setForm((f) => ({ ...f, incident_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מיקום</label>
                <Input
                  placeholder="מיקום"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">תיאור *</label>
                <Input
                  placeholder="תיאור"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              {isAccident && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">תיאור נזק</label>
                    <Input
                      placeholder="תיאור נזק"
                      value={form.damage_desc}
                      onChange={(e) => setForm((f) => ({ ...f, damage_desc: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">מס' תיק משטרה</label>
                    <Input
                      placeholder="מס' תיק"
                      value={form.police_report_no}
                      onChange={(e) => setForm((f) => ({ ...f, police_report_no: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תביעת ביטוח</label>
                    <Input
                      placeholder="מס' תביעה"
                      value={form.insurance_claim}
                      onChange={(e) => setForm((f) => ({ ...f, insurance_claim: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'open' | 'closed' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">פתוח</SelectItem>
                    <SelectItem value="closed">סגור</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">הערות</label>
                <Input
                  placeholder="הערות"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createIncident.isPending || !form.incident_date || !form.description}
              >
                {createIncident.isPending ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {incidents.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          אין {labelPlural} רשומות
        </div>
      )}

      {incidents.map((inc) => (
        <Card key={inc.id} className="overflow-hidden">
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setExpanded(expanded === inc.id ? null : inc.id)}
          >
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  inc.status === 'open'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-green-500/20 text-green-400 border-green-500/30'
                }`}>
                {inc.status === 'open' ? 'פתוח' : 'סגור'}
              </span>
              <div>
                <p className="font-medium text-sm">{inc.description}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(inc.incident_date).toLocaleDateString('he-IL')}
                  {inc.location ? ` · ${inc.location}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteIncident.mutate({ id: inc.id, driverId: driver.id });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {expanded === inc.id ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
          {expanded === inc.id && (
            <CardContent className="pt-0 pb-4 px-4 border-t border-border bg-muted/20 space-y-2 text-sm">
              {inc.damage_desc && (
                <div>
                  <span className="text-muted-foreground">נזק: </span>
                  {inc.damage_desc}
                </div>
              )}
              {inc.police_report_no && (
                <div>
                  <span className="text-muted-foreground">תיק משטרה: </span>
                  {inc.police_report_no}
                </div>
              )}
              {inc.insurance_claim && (
                <div>
                  <span className="text-muted-foreground">תביעת ביטוח: </span>
                  {inc.insurance_claim}
                </div>
              )}
              {inc.notes && (
                <div>
                  <span className="text-muted-foreground">הערות: </span>
                  {inc.notes}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Complaints tab ───────────────────────────────────────────────────────────

function ComplaintsTab({ driver }: { driver: Driver }) {
  const { data: allComplaints = [], isLoading } = useComplaints();
  const complaints = allComplaints.filter(
    (c) =>
      c.driver_name?.trim().toLowerCase() === driver.full_name.trim().toLowerCase()
  );

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  if (complaints.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <MessageSquareWarning className="h-8 w-8 mx-auto mb-2 opacity-30" />
        אין תלונות נוהל 6 לנהג זה
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{complaints.length} תלונות</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">תאריך</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">מס' רכב</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">סוג</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">תיאור</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-2">
                  {c.report_date_time
                    ? new Date(c.report_date_time).toLocaleDateString('he-IL')
                    : '—'}
                </td>
                <td className="py-2 pr-2">{c.vehicle_number}</td>
                <td className="py-2 pr-2">{c.report_type ?? '—'}</td>
                <td className="py-2 pr-2 max-w-[200px] truncate">{c.description ?? '—'}</td>
              <td className="py-2 pr-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    c.status === 'closed'
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {c.status === 'closed' ? 'סגור' : 'פתוח'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Transfers tab ────────────────────────────────────────────────────────────

function TransfersTab({ driver }: { driver: Driver }) {
  const { data: allHandovers = [], isLoading } = useHandoverHistory();
  const forDriver = allHandovers.filter((h) => h.driver_id === driver.id);
  // מניעת כפילויות ברשימה (אותו id לא מופיע פעמיים)
  const seen = new Set<string>();
  const handovers = forDriver.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });
  // איחוד שורות זהות (אותו רכב + תאריך + סוג) — משאירים את הרשומה האחרונה בלבד כדי שלא ייראה "פעמיים"
  const deduped: typeof handovers = [];
  const keySet = new Set<string>();
  for (let i = handovers.length - 1; i >= 0; i--) {
    const h = handovers[i];
    const key = `${h.vehicle_id}|${h.handover_date}|${h.handover_type}`;
    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.unshift(h);
  }
  const displayHandovers = deduped.length < handovers.length ? deduped : handovers;

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  if (displayHandovers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
        אין העברות לנהג זה
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {displayHandovers.length} העברות
        {deduped.length < handovers.length && (
          <span className="mr-2 text-xs opacity-70"> (מאוחד לפי רכב+תאריך+סוג)</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">תאריך</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">רכב</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">סוג</th>
              <th className="text-right py-2 pr-2 text-muted-foreground font-medium">מסמך</th>
            </tr>
          </thead>
          <tbody>
            {displayHandovers.map((h) => (
              <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-2">
                  {new Date(h.handover_date).toLocaleDateString('he-IL')}
                </td>
                <td className="py-2 pr-2">
                  {h.vehicle_label ? (
                    <Link
                      to={`/vehicles/${h.vehicle_id}`}
                      className="text-primary hover:underline"
                      dir="ltr"
                    >
                      {h.vehicle_label}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 pr-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    h.handover_type === 'delivery'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {h.handover_type === 'delivery' ? 'מסירה' : 'החזרה'}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  {h.form_url ? (
                    <a
                      href={h.form_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      PDF
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Family Members tab ───────────────────────────────────────────────────────

function FamilyTab({ driver }: { driver: Driver }) {
  const { data: members = [], isLoading } = useDriverFamilyMembers(driver.id);
  const createMember = useCreateDriverFamilyMember();
  const deleteMember = useDeleteDriverFamilyMember();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    relationship: '',
    phone: '',
    id_number: '',
    birth_date: '',
    address: '',
    city: '',
    notes: '',
  });

  const RELATIONSHIPS = [
    { value: 'spouse', label: 'בן/בת זוג' },
    { value: 'child', label: 'ילד/ה' },
    { value: 'parent', label: 'הורה' },
    { value: 'sibling', label: 'אח/אחות' },
    { value: 'other', label: 'אחר' },
  ];

  const relationshipLabel = (v: string) =>
    RELATIONSHIPS.find((r) => r.value === v)?.label ?? v;

  const handleCreate = () => {
    if (!form.full_name || !form.relationship) return;
    createMember.mutate(
      {
        driver_id: driver.id,
        full_name: form.full_name,
        relationship: form.relationship,
        phone: form.phone || null,
        id_number: form.id_number || null,
        birth_date: form.birth_date || null,
        address: form.address || null,
        city: form.city || null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({
            full_name: '',
            relationship: '',
            phone: '',
            id_number: '',
            birth_date: '',
            address: '',
            city: '',
            notes: '',
          });
        },
      }
    );
  };

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} בני משפחה</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 ml-1" />
          הוסף בן/בת משפחה
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">בן/בת משפחה חדש/ה</p>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">שם מלא *</label>
                <Input
                  placeholder="שם מלא"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קירבה *</label>
                <Select
                  value={form.relationship}
                  onValueChange={(v) => setForm((f) => ({ ...f, relationship: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="בחר קירבה" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">טלפון</label>
                <Input
                  placeholder="טלפון"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ת.ז.</label>
                <Input
                  placeholder="ת.ז."
                  value={form.id_number}
                  onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך לידה</label>
                <Input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עיר</label>
                <Input
                  placeholder="עיר"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">רחוב</label>
                <Input
                  placeholder="רחוב"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">הערות</label>
                <Input
                  placeholder="הערות"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMember.isPending || !form.full_name || !form.relationship}
              >
                {createMember.isPending ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {members.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          לא נרשמו בני משפחה
        </div>
      )}

      <div className="grid gap-3">
        {members.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{m.full_name}</p>
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{relationshipLabel(m.relationship)}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
                    {m.phone && <p>טלפון: {m.phone}</p>}
                    {m.id_number && <p>ת.ז.: {m.id_number}</p>}
                    {m.birth_date && (
                      <p>ת. לידה: {new Date(m.birth_date).toLocaleDateString('he-IL')}</p>
                    )}
                    {(m.address || m.city) && (
                      <p>{[m.address, m.city].filter(Boolean).join(', ')}</p>
                    )}
                    {m.notes && <p>הערות: {m.notes}</p>}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMember.mutate({ id: m.id, driverId: driver.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Documents tab ───────────────────────────────────────────────────────────

/** שם תצוגה לקובץ — שם הקובץ בלי סיומת או מלא */
function displayFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base || fileName;
}

function DocumentsTab({ driver }: { driver: Driver }) {
  const { data: docs = [], isLoading } = useDriverDocuments(driver.id);
  const { data: storageFiles = [], isLoading: storageLoading } = useDriverStorageFiles(driver.id);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const getUrl = (path: string | null): string | undefined => {
    if (!path) return undefined;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return path.replace('/src/assets/documents', 'http://localhost:3000/assets/documents');
  };

  const dbUrls = new Set(docs.map((d) => d.file_url));
  const legacyDocs: { id: string; title: string; file_url: string }[] = [];
  if ((driver as any).license_front_url && !dbUrls.has((driver as any).license_front_url))
    legacyDocs.push({ id: 'leg-front', title: 'רישיון נהיגה (קדמי)', file_url: (driver as any).license_front_url });
  if ((driver as any).license_back_url && !dbUrls.has((driver as any).license_back_url))
    legacyDocs.push({ id: 'leg-back', title: 'רישיון נהיגה (אחורי)', file_url: (driver as any).license_back_url });
  if ((driver as any).health_declaration_url && !dbUrls.has((driver as any).health_declaration_url))
    legacyDocs.push({ id: 'leg-health', title: 'הצהרת בריאות', file_url: (driver as any).health_declaration_url });
  const allDocs = [...docs, ...legacyDocs];

  const formatStorageDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('he-IL');
  };

  if (isLoading && storageLoading)
    return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  const hasStorage = storageFiles.length > 0;
  const hasDbDocs = allDocs.length > 0;

  if (!hasStorage && !hasDbDocs)
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground mb-1">תיקיית Storage</p>
          <p className="text-xs text-muted-foreground">
            נתיב: Documents/Drivers/{driver.id}/
          </p>
          <p className="text-sm text-muted-foreground mt-2">אין קבצים בתיקייה זו.</p>
        </div>
        <div className="text-center py-6 text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          אין מסמכים רשומים לנהג זה
        </div>
      </div>
    );

  return (
    <>
      {/* רשימה מקובצי Storage */}
      {hasStorage && (
        <div className="mb-6">
          <p className="text-sm font-medium text-foreground mb-2">
            קבצים מתיקיית מסמכים ({storageFiles.length})
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Storage: Documents/Drivers/{driver.id}/
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-3 py-2 font-medium">שם הטופס</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">תאריך העלאה</th>
                  <th className="px-3 py-2 font-medium w-[1%]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {storageFiles.map((file) => (
                  <tr key={file.path} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 align-middle">
                      <span className="font-medium">{displayFileName(file.name)}</span>
                      <span className="text-xs text-muted-foreground mr-2">({file.name})</span>
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">
                      {formatStorageDate(file.createdAt || file.updatedAt)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-1 justify-end">
                        <a
                          href={file.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          צפייה
                        </a>
                        <a
                          href={file.publicUrl}
                          download={file.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                        >
                          <Download className="h-3.5 w-3.5" />
                          הורדה
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasStorage && !storageLoading && !hasDbDocs && (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            אין מסמכים בתיקיית הנהג.
          </p>
        </div>
      )}

      {/* מסמכים רשומים (טבלה + קבצים ישנים) */}
      {hasDbDocs && (
        <>
          <p className="text-sm text-muted-foreground mb-3">{allDocs.length} מסמכים רשומים במערכת</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {allDocs.map((doc) => {
          const src = getUrl(doc.file_url);
          if (!src) return null;
          const isPdf = /\.pdf(\?|$)/i.test(src) || src.includes('/pdf') || src.includes('content-type=application%2Fpdf');
          if (isPdf)
            return (
              <a key={doc.id} href={src} target="_blank" rel="noopener noreferrer"
                className="group relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden flex flex-col items-center justify-center gap-2 p-3 no-underline hover:shadow-md transition-all">
                <FileText className="h-10 w-10 text-red-400" />
                <p className="text-xs font-medium truncate text-center w-full text-foreground">{doc.title}</p>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground absolute top-2 left-2" />
              </a>
            );
          return (
            <div key={doc.id}
              className="group relative aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden cursor-pointer hover:shadow-md transition-all"
              onClick={() => setLightbox({ src, title: doc.title })}>
              <img src={src} alt={doc.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Eye className="text-white h-8 w-8" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                <p className="text-white text-xs font-medium truncate text-center">{doc.title}</p>
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white" onClick={() => setLightbox(null)}>
              <X className="h-5 w-5" />
            </button>
            <img src={lightbox.src} alt={lightbox.title} className="max-h-[85vh] w-full object-contain rounded-lg" />
            <p className="text-white text-center mt-2 font-medium">{lightbox.title}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DriverFolders({ driver, collapsible = false, defaultOpen = false }: Props) {
  const [activeTab, setActiveTab] = useState<FolderTab>('events');
  const [open, setOpen] = useState(defaultOpen);

  const tabs: { id: FolderTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'events', label: 'אירועים', icon: AlertTriangle },
    { id: 'accidents', label: 'תאונות', icon: Car },
    { id: 'complaints', label: 'תלונות נוהל 6', icon: MessageSquareWarning },
    { id: 'transfers', label: 'העברות', icon: ArrowLeftRight },
    { id: 'family', label: 'בני משפחה', icon: Users },
    { id: 'documents', label: 'מסמכים', icon: FileText },
  ];

  const tabBar = (
    <div className="border-b border-border px-4">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const tabContent = (
    <CardContent className="pt-4">
      {activeTab === 'events' && <IncidentsTab driver={driver} incidentType="event" />}
      {activeTab === 'accidents' && <IncidentsTab driver={driver} incidentType="accident" />}
      {activeTab === 'complaints' && <ComplaintsTab driver={driver} />}
      {activeTab === 'transfers' && <TransfersTab driver={driver} />}
      {activeTab === 'family' && <FamilyTab driver={driver} />}
      {activeTab === 'documents' && <DocumentsTab driver={driver} />}
    </CardContent>
  );

  if (collapsible) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-right transition-colors hover:bg-muted/40"
              >
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  תיקיות ניהול נהג
                </span>
                {open ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            {tabBar}
            {tabContent}
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">תיקיות ניהול נהג</CardTitle>
      </CardHeader>
      {tabBar}
      {tabContent}
    </Card>
  );
}
