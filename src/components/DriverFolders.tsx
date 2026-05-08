import React, { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  useDriverIncidents,
  useDeleteDriverIncident,
  useDriverFamilyMembers,
  useDeleteDriverFamilyMember,
  useCreateDriverIncident,
  useCreateDriverFamilyMember,
  type DriverIncidentType,
} from '@/hooks/useDriverFolders';
import { useComplaints, useCreateComplaint, type Complaint } from '@/hooks/useComplaints';
import { useDriverHandoverHistory, handoverFormDocumentLinks, type HandoverHistoryItem } from '@/hooks/useHandovers';
import { useDriverDocuments } from '@/hooks/useDriverDocuments';
import { useDriverStorageFiles } from '@/hooks/useDriverStorageFiles';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  User,
  ArrowLeftRight,
  MessageSquareWarning,
  FileText,
  ExternalLink,
  Eye,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  FolderOpen,
  Search,
  Plus,
  Loader2,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Driver, DriverDocument } from '@/types/fleet';

/** מיפוי טאבים ↔ טבלאות Supabase (401/404 / RLS): אירועים·תאונות → driver_incidents · תלונות → procedure6_complaints · העברות → vehicle_handovers (+ vehicle_documents ל־PDF) · משפחה → driver_family_members · מסמכים → driver_documents + Storage */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FolderTab = 'events' | 'accidents' | 'complaints' | 'transfers' | 'family' | 'documents';

type MainTab = 'details' | FolderTab;

function FolderLoadErrorMessage() {
  return (
    <p className="px-3 py-4 text-center text-xs leading-relaxed text-amber-200/90">
      לא ניתן לטעון את התיקייה (טבלה או הרשאות בשרת). נסו שוב מאוחר יותר או פנו למנהל המערכת.
    </p>
  );
}

function EmptyFolderHint() {
  return (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground">אין רשומות בתיקייה זו.</p>
  );
}

interface Props {
  driver: Driver;
  /** When true, folders are hidden behind a trigger button (less clutter on detail page) */
  collapsible?: boolean;
  /** Initial open state when collapsible (default false) */
  defaultOpen?: boolean;
  /**
   * embedded — רק שורת טאבים + תוכן (בלי Card חיצוני), למיזוג עם Card אחר (פרטים אישיים).
   * default — Card עוטף כמו קודם (רשימת נהגים וכו').
   */
  variant?: 'default' | 'embedded';
  /**
   * כשמועבר (עמוד עריכת נהג): טאב «פרטים» + החלפה בין טופס לתיקיות.
   * התוכן נשאר ב-DOM (מוסתר ב-CSS) כדי לאפשר שמירה מהפס התחתון.
   */
  detailsSlot?: ReactNode;
}

function complaintMatchesDriver(c: Complaint, driver: Driver): boolean {
  const did = c.driver_id?.trim();
  if (did && driver.id) {
    return did === driver.id;
  }
  const dn = c.driver_name?.trim().toLowerCase() ?? '';
  const fn = driver.full_name.trim().toLowerCase();
  return dn.length > 0 && dn === fn;
}

function AddDriverIncidentDialog({
  driver,
  incidentType,
  open,
  onOpenChange,
}: {
  driver: Driver;
  incidentType: DriverIncidentType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateDriverIncident();
  const [incidentDate, setIncidentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [damageDesc, setDamageDesc] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setLocation('');
    setDamageDesc('');
    setNotes('');
  };

  const submit = () => {
    const desc = description.trim();
    if (!desc) return;
    create.mutate(
      {
        driver_id: driver.id,
        vehicle_id: null,
        incident_type: incidentType,
        incident_date: incidentDate,
        description: desc,
        location: location.trim() || null,
        damage_desc: incidentType === 'accident' ? damageDesc.trim() || null : null,
        police_report_no: null,
        insurance_claim: null,
        photo_urls: null,
        status: 'open',
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{incidentType === 'event' ? 'הוספת אירוע' : 'הוספת תאונה'}</DialogTitle>
          <DialogDescription>הרשומה תישמר ותוצג בתיק הנהג.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <FleetDatePicker id="incident_date" label="תאריך" value={incidentDate} onChange={setIncidentDate} />
          <div className="space-y-2">
            <Label htmlFor="inc-desc">תיאור *</Label>
            <Textarea
              id="inc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="תאר את האירוע או התאונה"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inc-loc">מיקום</Label>
            <Input id="inc-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          {incidentType === 'accident' && (
            <div className="space-y-2">
              <Label htmlFor="inc-dmg">תיאור נזק</Label>
              <Textarea id="inc-dmg" value={damageDesc} onChange={(e) => setDamageDesc(e.target.value)} rows={2} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="inc-notes">הערות</Label>
            <Textarea id="inc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending || !description.trim()}>
            {create.isPending ? 'שומר…' : 'שמירה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDriverComplaintDialog({
  driver,
  open,
  onOpenChange,
}: {
  driver: Driver;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateComplaint();
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState('');

  const reset = () => {
    setVehicleNumber('');
    setDescription('');
    setReportType('');
  };

  const submit = () => {
    const vn = vehicleNumber.trim();
    if (!vn) return;
    create.mutate(
      {
        vehicle_number: vn,
        report_id: null,
        report_type: reportType.trim() || null,
        location: null,
        description: description.trim() || null,
        report_date_time: new Date().toISOString(),
        reporter_name: null,
        reporter_cell_phone: null,
        received_time: null,
        receiver_name: null,
        driver_response: null,
        driver_name: driver.full_name.trim(),
        action_taken: null,
        first_update_time: null,
        last_update_time: null,
        status: 'open',
        driver_id: driver.id,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוספת תלונה נוהל 6</DialogTitle>
          <DialogDescription>שם הנהג יישמר אוטומטית ({driver.full_name}).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="cmp-vn">מספר רכב *</Label>
            <Input
              id="cmp-vn"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              dir="ltr"
              placeholder="למשל 12-345-67"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cmp-type">סוג דיווח</Label>
            <Input id="cmp-type" value={reportType} onChange={(e) => setReportType(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cmp-desc">תיאור</Label>
            <Textarea id="cmp-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending || !vehicleNumber.trim()}>
            {create.isPending ? 'שומר…' : 'שמירה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDriverFamilyMemberDialog({
  driver,
  open,
  onOpenChange,
}: {
  driver: Driver;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateDriverFamilyMember();
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState('spouse');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');

  const reset = () => {
    setFullName('');
    setRelationship('spouse');
    setPhone('');
    setIdNumber('');
  };

  const submit = () => {
    const fn = fullName.trim();
    if (!fn) return;
    create.mutate(
      {
        driver_id: driver.id,
        full_name: fn,
        relationship,
        phone: phone.trim() || null,
        id_number: idNumber.trim() || null,
        birth_date: null,
        address: null,
        city: null,
        notes: null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוספת בן משפחה</DialogTitle>
          <DialogDescription>הפרטים יישמרו בטבלת בני משפחה לנהג זה.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="fam-name">שם מלא *</Label>
            <Input id="fam-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>קירבה</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spouse">בן/בת זוג</SelectItem>
                <SelectItem value="child">ילד/ה</SelectItem>
                <SelectItem value="parent">הורה</SelectItem>
                <SelectItem value="sibling">אח/אחות</SelectItem>
                <SelectItem value="other">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fam-phone">טלפון</Label>
            <Input id="fam-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fam-id">תעודת זהות</Label>
            <Input id="fam-id" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending || !fullName.trim()}>
            {create.isPending ? 'שומר…' : 'שמירה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Incidents tab (events & accidents) ──────────────────────────────────────

function IncidentsTab({ driver, incidentType }: { driver: Driver; incidentType: DriverIncidentType }) {
  const { data: incidents = [], isLoading, isError } = useDriverIncidents(driver.id, incidentType);
  const deleteIncident = useDeleteDriverIncident();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return <p className="text-muted-foreground px-3 py-2 text-xs">טוען…</p>;
  }

  if (isError) {
    return <FolderLoadErrorMessage />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end px-1">
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          {incidentType === 'event' ? 'הוספת אירוע' : 'הוספת תאונה'}
        </Button>
      </div>
      <AddDriverIncidentDialog
        driver={driver}
        incidentType={incidentType}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      {incidents.length === 0 ? (
        <EmptyFolderHint />
      ) : (
        <div className="space-y-2">
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
      )}
    </div>
  );
}

// ─── Complaints tab ───────────────────────────────────────────────────────────

function ComplaintsTab({ driver }: { driver: Driver }) {
  const { data: allComplaints = [], isLoading, isError } = useComplaints();
  const [addOpen, setAddOpen] = useState(false);
  const complaints = allComplaints.filter((c) => complaintMatchesDriver(c, driver));

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">טוען...</p>;

  if (isError) return <FolderLoadErrorMessage />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end px-1">
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          הוספת תלונה
        </Button>
      </div>
      <AddDriverComplaintDialog driver={driver} open={addOpen} onOpenChange={setAddOpen} />
      {complaints.length === 0 ? (
        <EmptyFolderHint />
      ) : (
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
      )}
    </div>
  );
}

// ─── Transfers tab ────────────────────────────────────────────────────────────

function dedupeHandoverHistory(items: HandoverHistoryItem[]): HandoverHistoryItem[] {
  const seen = new Set<string>();
  const filtered = items.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });
  const deduped: HandoverHistoryItem[] = [];
  const keySet = new Set<string>();
  for (let i = filtered.length - 1; i >= 0; i--) {
    const h = filtered[i];
    const key = `${h.vehicle_id}|${h.handover_date}|${h.handover_type}`;
    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.unshift(h);
  }
  return deduped.length < filtered.length ? deduped : filtered;
}

/** כשמסמכי מסירה קיימים ב-driver_documents אך אין התאמה ב-vehicle_handovers (או חסר driver_id בטבלה). */
function handoverItemsFromDriverDocuments(docs: DriverDocument[], driver: Driver): HandoverHistoryItem[] {
  const out: HandoverHistoryItem[] = [];
  for (const doc of docs) {
    const t = doc.title ?? '';
    const isHandoverDoc =
      /טופס\s+(מסירה|החזרה)/.test(t) || /אישור\s+קבלת\s+רכב/.test(t);
    if (!isHandoverDoc) continue;

    let handover_type: 'delivery' | 'return' = 'delivery';
    if (/טופס\s+החזרה/.test(t) || (/\bהחזרה\b/.test(t) && !/מסירה/.test(t))) {
      handover_type = 'return';
    }

    let vehicle_label = 'לפי כותרת המסמך';
    const pipe = t.split('|');
    if (pipe.length >= 2) {
      vehicle_label = pipe.slice(1).join('|').trim() || vehicle_label;
    }

    out.push({
      id: `fallback-doc:${doc.id}`,
      vehicle_id: '',
      driver_id: driver.id,
      handover_type,
      handover_date: doc.created_at,
      driver_label: driver.full_name,
      vehicle_label,
      form_url: doc.file_url,
      photo_urls: [],
    });
  }
  return out.sort((a, b) => new Date(b.handover_date).getTime() - new Date(a.handover_date).getTime());
}

function TransfersTab({ driver }: { driver: Driver }) {
  const { data: fromDb = [], isLoading: loadingH, isError: errH } = useDriverHandoverHistory(driver.id);
  const { data: driverDocs = [], isLoading: loadingD } = useDriverDocuments(driver.id);
  const fallback = useMemo(
    () => handoverItemsFromDriverDocuments(driverDocs, driver),
    [driverDocs, driver]
  );

  if (loadingH) {
    return <p className="text-muted-foreground text-sm p-4">טוען...</p>;
  }

  let rows = dedupeHandoverHistory(fromDb);
  let fromDocumentsOnly = false;

  if (errH) {
    if (loadingD) {
      return <p className="text-muted-foreground text-sm p-4">טוען...</p>;
    }
    if (fallback.length > 0) {
      rows = dedupeHandoverHistory(fallback);
      fromDocumentsOnly = true;
    } else {
      return <FolderLoadErrorMessage />;
    }
  } else if (rows.length === 0 && fallback.length > 0) {
    rows = dedupeHandoverHistory(fallback);
    fromDocumentsOnly = true;
  }

  if (rows.length === 0) {
    if (loadingD && !errH) {
      return <p className="text-muted-foreground text-sm p-4">טוען...</p>;
    }
    return <EmptyFolderHint />;
  }

  return (
    <div className="space-y-2">
      {fromDocumentsOnly && (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-xs leading-snug text-amber-100/90">
          {errH
            ? 'טעינת טבלת ההעברות (vehicle_handovers) נכשלה; מוצג גיבוי לפי מסמכי מסירה/קבלה בתיק הנהג.'
            : 'לא נמצאו העברות רשומות לנהג בטבלה; מוצג לפי מסמכים מהתיק (טופס מסירה / אישור קבלת רכב).'}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{rows.length} העברות</p>
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
            {rows.map((h) => (
              <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-2">
                  {new Date(h.handover_date).toLocaleDateString('he-IL')}
                </td>
                <td className="py-2 pr-2">
                  {h.vehicle_id ? (
                    <Link
                      to={`/vehicles/${h.vehicle_id}`}
                      className="text-primary hover:underline"
                      dir="ltr"
                    >
                      {h.vehicle_label}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground" dir="ltr">
                      {h.vehicle_label}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      h.handover_type === 'delivery'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {h.handover_type === 'delivery' ? 'מסירה' : 'החזרה'}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  {(() => {
                    const links = handoverFormDocumentLinks(h);
                    if (links.length === 0) return '—';
                    if (links.length === 1) {
                      return (
                        <a
                          href={links[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          PDF
                        </a>
                      );
                    }
                    return (
                      <span className="flex flex-wrap gap-1">
                        {links.map((l, i) => (
                          <a
                            key={`${l.url}-${i}`}
                            href={l.url}
                            title={l.title}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-[10px]"
                          >
                            [{i + 1}]
                          </a>
                        ))}
                      </span>
                    );
                  })()}
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

const FAMILY_REL_LABELS: Record<string, string> = {
  spouse: 'בן/בת זוג',
  child: 'ילד/ה',
  parent: 'הורה',
  sibling: 'אח/אחות',
  other: 'אחר',
};

function relationshipLabel(v: string) {
  return FAMILY_REL_LABELS[v] ?? v;
}

function FamilyTab({ driver }: { driver: Driver }) {
  const { data: members = [], isLoading, isError } = useDriverFamilyMembers(driver.id);
  const deleteMember = useDeleteDriverFamilyMember();
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return <p className="text-muted-foreground px-3 py-2 text-xs">טוען…</p>;
  }

  if (isError) return <FolderLoadErrorMessage />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end px-1">
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          הוספת בן משפחה
        </Button>
      </div>
      <AddDriverFamilyMemberDialog driver={driver} open={addOpen} onOpenChange={setAddOpen} />
      {members.length === 0 ? (
        <EmptyFolderHint />
      ) : (
    <div className="grid gap-2">
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
      )}
    </div>
  );
}

// ─── Documents tab ───────────────────────────────────────────────────────────

/** שם תצוגה לקובץ — שם הקובץ בלי סיומת או מלא */
function displayFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base || fileName;
}

function parseDocSortTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isPdfUrl(src: string): boolean {
  return /\.pdf(\?|$)/i.test(src) || src.includes('/pdf') || src.includes('content-type=application%2Fpdf');
}

function DocumentsTab({ driver }: { driver: Driver }) {
  const { data: docs = [], isLoading, isError } = useDriverDocuments(driver.id);
  const { data: storageFiles = [], isLoading: storageLoading } = useDriverStorageFiles(driver.id);
  const { data: reg585ComplianceDocs = [], isLoading: reg585ComplianceLoading } = useQuery({
    queryKey: ['driver-regulation-585-compliance-docs', driver.id],
    enabled: Boolean(String(driver.id ?? '').trim()),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as { from: (name: string) => any }).from('compliance_docs')
        .select('id, file_url, created_at')
        .eq('driver_id', driver.id)
        .eq('task_key', 'regulation_585')
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as { id: string; file_url: string; created_at: string }[];
    },
  });
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [docSearch, setDocSearch] = useState('');
  const [sendingDocKey, setSendingDocKey] = useState<string | null>(null);

  const friendlyEdgeError = async (err: unknown): Promise<string> => {
    const base = err instanceof Error ? err.message : String(err);
    const ctx = (err as { context?: Response } | undefined)?.context;
    if (!ctx) return base;
    try {
      const j = (await ctx.clone().json()) as { error?: string; message?: string };
      const msg = (j?.error || j?.message || '').trim();
      return msg || base;
    } catch {
      try {
        const t = (await ctx.clone().text()).trim();
        return t || base;
      } catch {
        return base;
      }
    }
  };

  const sendDocLinkEmail = async (toEmail: string, docUrl: string, docTitle: string) => {
    setSendingDocKey(docUrl);
    try {
      const { data, error } = await invokeSupabaseEdgeFunction('send-document-link-email', {
        to_email: toEmail,
        doc_url: docUrl,
        doc_title: docTitle,
        driver_name: driver.full_name,
      });
      if (error) throw error;
      const payload = data as { success?: boolean; error?: string };
      if (payload?.error) throw new Error(String(payload.error));
      toast.success('נשלח בהצלחה');
    } catch (e) {
      const msg = await friendlyEdgeError(e);
      toast.error(`שליחה נכשלה: ${msg}`);
    } finally {
      setSendingDocKey(null);
    }
  };

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
  for (const u of legacyDocs.map((x) => x.file_url)) dbUrls.add(u);

  const reg585FromCompliance: DriverDocument[] = [];
  for (const row of reg585ComplianceDocs) {
    const u = String(row.file_url ?? '').trim();
    if (!u || dbUrls.has(u)) continue;
    dbUrls.add(u);
    reg585FromCompliance.push({
      id: `compliance-reg585-${row.id}`,
      driver_id: driver.id,
      title: 'תקנה 585 ב׳ — סריקת בדיקה',
      file_url: u,
      created_at: row.created_at,
    });
  }

  const allDocs = [...docs, ...legacyDocs, ...reg585FromCompliance];

  const formatStorageDate = (iso: string | null) => {
    const effective = iso && String(iso).trim() ? String(iso).trim() : '';
    if (!effective) return 'לא ידוע';
    const d = new Date(effective);
    return Number.isNaN(d.getTime()) ? 'לא ידוע' : d.toLocaleString('he-IL');
  };

  if (isError) {
    return <FolderLoadErrorMessage />;
  }

  if (isLoading || storageLoading || reg585ComplianceLoading) {
    return <p className="text-muted-foreground text-sm p-4">טוען...</p>;
  }

  type UnifiedRow =
    | {
        key: string;
        sortTime: number;
        kind: 'storage';
        displayTitle: string;
        fileLabel: string;
        dateLabel: string;
        publicUrl: string;
        fileName: string;
        isPdf: boolean;
      }
    | {
        key: string;
        sortTime: number;
        kind: 'registered';
        title: string;
        dateLabel: string;
        src: string;
        isPdf: boolean;
      };

  const storageRows: UnifiedRow[] = storageFiles.map((file) => {
    const isPdf = /\.pdf$/i.test(file.name);
    return {
      key: `s-${file.path}`,
      sortTime: parseDocSortTime(file.createdAt || file.updatedAt),
      kind: 'storage',
      displayTitle: displayFileName(file.name),
      fileLabel: file.name,
      dateLabel: formatStorageDate(file.createdAt || file.updatedAt),
      publicUrl: file.publicUrl,
      fileName: file.name,
      isPdf,
    };
  });

  const registeredRows: UnifiedRow[] = [];
  for (const doc of allDocs) {
    const src = getUrl(doc.file_url);
    if (!src) continue;
    const isPdf = isPdfUrl(src);
    const createdAt = 'created_at' in doc ? (doc as { created_at?: string }).created_at : undefined;
    const updatedAt = 'updated_at' in doc ? (doc as { updated_at?: string }).updated_at : undefined;
    const effectiveIso = String(createdAt ?? updatedAt ?? '').trim();
    const effectiveDate = effectiveIso ? new Date(effectiveIso) : null;
    registeredRows.push({
      key: `d-${doc.id}`,
      sortTime: parseDocSortTime(effectiveIso || null),
      kind: 'registered',
      title: doc.title,
      dateLabel:
        effectiveDate && !Number.isNaN(effectiveDate.getTime())
          ? effectiveDate.toLocaleString('he-IL')
          : 'לא ידוע',
      src,
      isPdf,
    });
  }

  const q = docSearch.trim().toLowerCase();
  const matchesName = (parts: string[]) => {
    if (!q) return true;
    return parts.some((p) => p.toLowerCase().includes(q));
  };

  const combined = [...storageRows, ...registeredRows]
    .filter((row) => {
      if (row.kind === 'storage') {
        return matchesName([row.displayTitle, row.fileLabel]);
      }
      return matchesName([row.title]);
    })
    .sort((a, b) => b.sortTime - a.sortTime);

  const totalCount = storageRows.length + registeredRows.length;
  const hasAnyDocs = totalCount > 0;

  if (!hasAnyDocs) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4">
        <p className="text-sm text-muted-foreground text-center">אין מסמכים בתיקיית הנהג.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount} מסמכים · אחסון ({storageRows.length}) · רשומים במערכת ({registeredRows.length})
        </p>
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={docSearch}
            onChange={(e) => setDocSearch(e.target.value)}
            placeholder="חיפוש לפי שם מסמך…"
            className="h-9 pr-9 text-sm"
            type="search"
            autoComplete="off"
          />
        </div>
      </div>

      {combined.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">לא נמצאו מסמכים התואמים לחיפוש.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-3 py-2 font-medium">שם</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">מקור</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">סוג</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">תאריך סריקה</th>
                  <th className="px-3 py-2 font-medium w-[1%]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {combined.map((row) => {
                  if (row.kind === 'storage') {
                    return (
                      <tr key={row.key} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            {row.isPdf ? (
                              <FileText className="h-8 w-8 shrink-0 text-red-400" aria-hidden />
                            ) : (
                              <img
                                src={row.publicUrl}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded border border-border/60 object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium leading-tight">{row.displayTitle}</p>
                              <p className="truncate text-xs text-muted-foreground" title={row.fileLabel}>
                                {row.fileLabel}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">אחסון</td>
                        <td className="px-3 py-2 align-middle whitespace-nowrap">
                          {row.isPdf ? 'PDF' : 'תמונה'}
                        </td>
                        <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">
                          {row.dateLabel}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap items-center gap-1 justify-end">
                            <a
                              href={row.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              צפייה
                            </a>
                            <a
                              href={row.publicUrl}
                              download={row.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              <Download className="h-3.5 w-3.5" />
                              הורדה
                            </a>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                              disabled={sendingDocKey === row.publicUrl || !String(driver.email ?? '').trim()}
                              onClick={() => void sendDocLinkEmail(String(driver.email ?? '').trim(), row.publicUrl, row.displayTitle)}
                              title={!String(driver.email ?? '').trim() ? 'לנהג אין מייל בכרטיס' : 'שלח קישור לעובד'}
                            >
                              {sendingDocKey === row.publicUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              שלח לעובד
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                              disabled={sendingDocKey === row.publicUrl}
                              onClick={() => {
                                const input = window.prompt('לאיזה מייל לשלוח?');
                                const to = String(input ?? '').trim();
                                if (!to) return;
                                void sendDocLinkEmail(to, row.publicUrl, row.displayTitle);
                              }}
                              title="שליחה למייל ידני"
                            >
                              {sendingDocKey === row.publicUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              שלח למייל
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.key} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          {row.isPdf ? (
                            <FileText className="h-8 w-8 shrink-0 text-red-400" aria-hidden />
                          ) : (
                            <button
                              type="button"
                              className="shrink-0 rounded border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary"
                              onClick={() => setLightbox({ src: row.src, title: row.title })}
                            >
                              <img
                                src={row.src}
                                alt=""
                                className="h-8 w-8 rounded object-cover"
                              />
                            </button>
                          )}
                          <span className="min-w-0 font-medium leading-tight">{row.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">מערכת</td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">{row.isPdf ? 'PDF' : 'תמונה'}</td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap text-muted-foreground">
                        {row.dateLabel}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-wrap items-center gap-1 justify-end">
                          {row.isPdf ? (
                            <a
                              href={row.src}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              פתיחה
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                              onClick={() => setLightbox({ src: row.src, title: row.title })}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              צפייה
                            </button>
                          )}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                            disabled={sendingDocKey === row.src || !String(driver.email ?? '').trim()}
                            onClick={() => void sendDocLinkEmail(String(driver.email ?? '').trim(), row.src, row.title)}
                            title={!String(driver.email ?? '').trim() ? 'לנהג אין מייל בכרטיס' : 'שלח קישור לעובד'}
                          >
                            {sendingDocKey === row.src ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            שלח לעובד
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                            disabled={sendingDocKey === row.src}
                            onClick={() => {
                              const input = window.prompt('לאיזה מייל לשלוח?');
                              const to = String(input ?? '').trim();
                              if (!to) return;
                              void sendDocLinkEmail(to, row.src, row.title);
                            }}
                            title="שליחה למייל ידני"
                          >
                            {sendingDocKey === row.src ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            שלח למייל
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <div className="relative mx-4 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onClick={() => setLightbox(null)}
            >
              <X className="h-5 w-5" />
            </button>
            <img src={lightbox.src} alt={lightbox.title} className="max-h-[85vh] w-full rounded-lg object-contain" />
            <p className="mt-2 text-center font-medium text-white">{lightbox.title}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DriverFolders({
  driver,
  collapsible = false,
  defaultOpen = false,
  variant = 'default',
  detailsSlot,
}: Props) {
  const hasDetailsTab = Boolean(detailsSlot);
  const [mainTab, setMainTab] = useState<MainTab>(() => (hasDetailsTab ? 'details' : 'events'));
  const [open, setOpen] = useState(defaultOpen);

  const folderTabs: { id: FolderTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'events', label: 'אירועים', icon: AlertTriangle },
    { id: 'accidents', label: 'תאונות', icon: Car },
    { id: 'complaints', label: 'תלונות נוהל 6', icon: MessageSquareWarning },
    { id: 'transfers', label: 'העברות', icon: ArrowLeftRight },
    { id: 'family', label: 'בני משפחה', icon: Users },
    { id: 'documents', label: 'מסמכים', icon: FileText },
  ];

  const tabBar = (
    <div className="flex flex-nowrap items-center border-b border-border bg-muted/10 px-1 py-0.5 sm:px-2">
      <div className="scrollbar-thin flex min-h-9 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {hasDetailsTab ? (
          <button
            key="details"
            type="button"
            onClick={() => setMainTab('details')}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap sm:gap-2 sm:px-4 sm:py-2 sm:text-sm',
              mainTab === 'details'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            <User className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            פרטים
          </button>
        ) : null}
        {folderTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMainTab(id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap sm:gap-2 sm:px-4 sm:py-2 sm:text-sm',
              mainTab === id
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const folderPanelInner = (
    <>
      {mainTab === 'events' && <IncidentsTab driver={driver} incidentType="event" />}
      {mainTab === 'accidents' && <IncidentsTab driver={driver} incidentType="accident" />}
      {mainTab === 'complaints' && <ComplaintsTab driver={driver} />}
      {mainTab === 'transfers' && <TransfersTab driver={driver} />}
      {mainTab === 'family' && <FamilyTab driver={driver} />}
      {mainTab === 'documents' && <DocumentsTab driver={driver} />}
    </>
  );

  const folderPanelWrapped =
    variant === 'embedded' ? (
      <div className="min-h-0 px-2 pb-2 pt-2 sm:px-3">{folderPanelInner}</div>
    ) : (
      <CardContent className="px-3 pt-3 pb-3 sm:px-4">{folderPanelInner}</CardContent>
    );

  const embeddedBody =
    hasDetailsTab ? (
      <>
        <div className={cn(mainTab !== 'details' && 'hidden')}>
          <div className="border-t border-border/80 pt-1">{detailsSlot}</div>
        </div>
        <div className={cn(mainTab === 'details' && 'hidden')}>{folderPanelWrapped}</div>
      </>
    ) : (
      folderPanelWrapped
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
                  תיקיות
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
            {embeddedBody}
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  if (variant === 'embedded') {
    return (
      <>
        {tabBar}
        {embeddedBody}
      </>
    );
  }

  return (
    <Card className="overflow-hidden py-0 shadow-none">
      {tabBar}
      {embeddedBody}
    </Card>
  );
}
