import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, AlertTriangle, Phone, MapPin, Car, Calendar, User, MessageSquare } from 'lucide-react';
import { useComplaints, useCreateComplaints, useUpdateComplaint, type Complaint } from '@/hooks/useComplaints';

function parseXmlComplaints(xmlText: string): Omit<Complaint, 'id' | 'created_at' | 'updated_at'>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const records = doc.querySelectorAll('Record');
  const complaints: Omit<Complaint, 'id' | 'created_at' | 'updated_at'>[] = [];

  records.forEach((record) => {
    const get = (tag: string) => record.querySelector(tag)?.textContent?.trim() || null;

    complaints.push({
      vehicle_number: get('VehicleNumber') ?? '',
      report_id: get('ReportID'),
      report_type: get('ReportType'),
      location: get('Location'),
      description: get('Description'),
      report_date_time: get('ReportDateTime'),
      reporter_name: get('ReporterName'),
      reporter_cell_phone: get('ReporterCellPhone'),
      received_time: get('RecievedTime') || get('ReceivedTime'),
      receiver_name: get('RecieverName') || get('ReceiverName'),
      driver_response: get('DriverResponse'),
      driver_name: get('DriverName'),
      action_taken: get('ActionTaken'),
      first_update_time: get('FirstUpdateTime'),
      last_update_time: get('LastUpdateTime'),
      status: 'open',
    });
  });

  return complaints;
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'פתוח', variant: 'destructive' },
  in_progress: { label: 'בטיפול', variant: 'default' },
  closed: { label: 'סגור', variant: 'secondary' },
};

export default function Procedure6ComplaintsPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: complaints = [], isLoading } = useComplaints();
  const createComplaints = useCreateComplaints();
  const updateComplaint = useUpdateComplaint();
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [preview, setPreview] = useState<Omit<Complaint, 'id' | 'created_at' | 'updated_at'>[] | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseXmlComplaints(text);
    if (parsed.length === 0) {
      return;
    }
    setPreview(parsed);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = () => {
    if (!preview) return;
    createComplaints.mutate(preview, {
      onSuccess: () => setPreview(null),
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">
            {t('navigation.procedure6Complaints', 'תלונות נוהל 6')}
          </h1>
          <p className="text-muted-foreground">ניהול תלונות נוהל 6 — טעינת קובץ XML ומעקב אירועים</p>
        </div>

        {/* Upload Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                <Upload className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle>טעינת קובץ תלונות</CardTitle>
                <CardDescription>העלה קובץ XML שהתקבל ממערכת נוהל 6</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileText className="h-4 w-4 ml-2" />
                בחר קובץ XML
              </Button>
              {preview && (
                <span className="text-sm text-muted-foreground">
                  נמצאו {preview.length} תלונות בקובץ
                </span>
              )}
            </div>

            {/* Preview */}
            {preview && preview.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                  <h4 className="font-semibold text-sm">תצוגה מקדימה:</h4>
                  {preview.map((c, i) => (
                    <div key={i} className="text-sm border-b last:border-0 pb-2 last:pb-0 space-y-1">
                      <div className="flex gap-4 flex-wrap">
                        <span><Car className="inline h-3.5 w-3.5 ml-1" />רכב: {c.vehicle_number}</span>
                        <span><User className="inline h-3.5 w-3.5 ml-1" />מדווח: {c.reporter_name || '—'}</span>
                        <span><MapPin className="inline h-3.5 w-3.5 ml-1" />מיקום: {c.location || '—'}</span>
                        <span><Calendar className="inline h-3.5 w-3.5 ml-1" />{formatDateTime(c.report_date_time)}</span>
                      </div>
                      {c.description && (
                        <p className="text-muted-foreground">{c.description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <Button onClick={handleUpload} disabled={createComplaints.isPending}>
                  {createComplaints.isPending ? 'טוען...' : `טען ${preview.length} תלונות`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Complaints List */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <CardTitle>רשימת תלונות</CardTitle>
                <CardDescription>{complaints.length} תלונות במערכת</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">טוען...</p>
            ) : complaints.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">אין תלונות במערכת. העלה קובץ XML להתחלה.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>תאריך</TableHead>
                      <TableHead>מס׳ רכב</TableHead>
                      <TableHead>מדווח</TableHead>
                      <TableHead>טלפון</TableHead>
                      <TableHead>מיקום</TableHead>
                      <TableHead>תיאור</TableHead>
                      <TableHead>סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complaints.map((c) => {
                      const st = statusMap[c.status] || statusMap.open;
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedComplaint(c)}
                        >
                          <TableCell className="whitespace-nowrap">{formatDateTime(c.report_date_time)}</TableCell>
                          <TableCell className="font-mono">{c.vehicle_number}</TableCell>
                          <TableCell>{c.reporter_name || '—'}</TableCell>
                          <TableCell dir="ltr">{c.reporter_cell_phone || '—'}</TableCell>
                          <TableCell>{c.location || '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{c.description || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <ComplaintDetailDialog
          complaint={selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
          onUpdate={(id, updates) => {
            updateComplaint.mutate({ id, ...updates }, {
              onSuccess: () => setSelectedComplaint(null),
            });
          }}
          isPending={updateComplaint.isPending}
        />
      </div>
    </div>
  );
}

function ComplaintDetailDialog({
  complaint,
  onClose,
  onUpdate,
  isPending,
}: {
  complaint: Complaint | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Complaint>) => void;
  isPending: boolean;
}) {
  const [driverResponse, setDriverResponse] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [status, setStatus] = useState('open');
  const [lastId, setLastId] = useState<string | null>(null);

  if (complaint && complaint.id !== lastId) {
    setLastId(complaint.id);
    setDriverResponse(complaint.driver_response || '');
    setActionTaken(complaint.action_taken || '');
    setStatus(complaint.status);
  }

  if (!complaint) return null;

  return (
    <Dialog open={!!complaint} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            תלונה — רכב {complaint.vehicle_number}
          </DialogTitle>
          <DialogDescription>
            דיווח מס׳ {complaint.report_id || '—'} | {formatDateTime(complaint.report_date_time)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">מס׳ רכב:</span>
              <span className="font-medium font-mono">{complaint.vehicle_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">מדווח:</span>
              <span className="font-medium">{complaint.reporter_name || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">טלפון:</span>
              <span className="font-medium" dir="ltr">{complaint.reporter_cell_phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">מיקום:</span>
              <span className="font-medium">{complaint.location || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">תאריך דיווח:</span>
              <span className="font-medium">{formatDateTime(complaint.report_date_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">תאריך קבלה:</span>
              <span className="font-medium">{formatDateTime(complaint.received_time)}</span>
            </div>
            {complaint.driver_name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">נהג:</span>
                <span className="font-medium">{complaint.driver_name}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {complaint.description && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-sm font-semibold mb-1 flex items-center gap-1">
                <MessageSquare className="h-4 w-4" /> תיאור הפנייה:
              </p>
              <p className="text-sm">{complaint.description}</p>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">סטטוס</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">פתוח</SelectItem>
                  <SelectItem value="in_progress">בטיפול</SelectItem>
                  <SelectItem value="closed">סגור</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">תגובת נהג</label>
              <Textarea
                value={driverResponse}
                onChange={(e) => setDriverResponse(e.target.value)}
                placeholder="הזן תגובת הנהג..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">פעולה שננקטה</label>
              <Textarea
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="תאר את הפעולה שננקטה..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button
              disabled={isPending}
              onClick={() => onUpdate(complaint.id, {
                status,
                driver_response: driverResponse || null,
                action_taken: actionTaken || null,
              })}
            >
              {isPending ? 'שומר...' : 'שמור שינויים'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
