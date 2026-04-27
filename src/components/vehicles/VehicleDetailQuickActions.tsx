import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Vehicle } from '@/types/fleet';
import { useUpdateVehicle } from '@/hooks/useVehicles';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IdCard, Shield, Gauge, Wrench, CircleDot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { sendFleetFieldUpdateNotification } from '@/lib/sendFleetFieldUpdateNotification';
import { compressImageFileForUpload } from '@/lib/mobilePhotoIngest';
import { TireWheelDiagramSelector, TIRE_WHEEL_VALUES } from '@/components/vehicles/TireWheelDiagramSelector';

const DOCS_BUCKET = 'vehicle-documents';

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

function storageFailureHint(err: unknown): string | undefined {
  let raw = '';
  if (err instanceof Error) raw = err.message;
  else if (err && typeof err === 'object' && 'message' in err) {
    raw = String((err as { message: unknown }).message ?? '');
  } else raw = String(err ?? '');
  const low = raw.toLowerCase();
  if (
    low.includes('failed to fetch') ||
    low.includes('network') ||
    low.includes('http2') ||
    low.includes('err_http2') ||
    low.includes('protocol_error')
  ) {
    return 'רשת: נסו שוב; תמונות מכווצות לפני העלאה. אם זה נמשך — נסו PDF קטן או שמירה בלי קובץ.';
  }
  return raw.trim() ? raw.slice(0, 220) : undefined;
}

/** העלאה ל-bucket — דחיסת תמונה + ניסיונות חוזרים נגד HTTP2 / Failed to fetch */
async function uploadToVehicleBucket(vehicleId: string, prefix: string, file: File): Promise<string> {
  let fileToUpload = file;
  const mime = file.type || '';
  if (mime.startsWith('image/') || mime === 'application/octet-stream') {
    try {
      fileToUpload = await compressImageFileForUpload(file);
    } catch (compressErr) {
      console.warn('[VehicleDetailQuickActions] image compress skipped', compressErr);
    }
  }

  const ext = sanitizeFileExt(fileToUpload.name);
  const uid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `vehicle-files/${vehicleId}/${prefix}_${uid}.${ext}`;
  const contentType =
    fileToUpload.type ||
    (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg');

  let uploadError: { message: string; name?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const up = await supabase.storage.from(DOCS_BUCKET).upload(path, fileToUpload, {
      upsert: true,
      contentType,
    });
    const err = up.error as { message: string; name?: string } | null;
    if (!err) {
      uploadError = null;
      break;
    }
    uploadError = err;
    const msg = String(err.message ?? '').toLowerCase();
    const retriable =
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('fetch') ||
      err.name === 'StorageUnknownError';
    if (!retriable || attempt === 2) break;
    await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
  }
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function insertVehicleDocument(
  vehicleId: string,
  title: string,
  fileUrl: string,
  documentType: string,
): Promise<void> {
  const { error } = await supabase.from('vehicle_documents' as any).insert({
    vehicle_id: vehicleId,
    title,
    file_url: fileUrl,
    document_type: documentType,
  });
  if (error) throw error;
}

export type VehicleDetailQuickActionsProps = {
  vehicle: Vehicle;
  showReportMileage: boolean;
  showServiceUpdate: boolean;
};

export function VehicleDetailQuickActions({ vehicle, showReportMileage, showServiceUpdate }: VehicleDetailQuickActionsProps) {
  const updateVehicle = useUpdateVehicle();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'license' | 'insurance' | 'tire' | null>(null);
  const [saving, setSaving] = useState(false);

  const [licenseDate, setLicenseDate] = useState('');
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [insuranceDate, setInsuranceDate] = useState('');
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [tirePositions, setTirePositions] = useState<string[]>([]);
  const [tireDate, setTireDate] = useState('');
  const [tireNextDate, setTireNextDate] = useState('');
  const [tireFile, setTireFile] = useState<File | null>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['vehicle', vehicle.id] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-documents', vehicle.id] });
  }, [queryClient, vehicle.id]);

  const openLicense = () => {
    setLicenseDate(vehicle.test_expiry ? String(vehicle.test_expiry).slice(0, 10) : '');
    setLicenseFile(null);
    setDialog('license');
  };
  const openInsurance = () => {
    setInsuranceDate(vehicle.insurance_expiry ? String(vehicle.insurance_expiry).slice(0, 10) : '');
    setInsuranceFile(null);
    setDialog('insurance');
  };
  const openTire = () => {
    setTirePositions([]);
    setTireDate(vehicle.last_tire_change_date ? String(vehicle.last_tire_change_date).slice(0, 10) : '');
    setTireNextDate(vehicle.next_tire_change_date ? String(vehicle.next_tire_change_date).slice(0, 10) : '');
    setTireFile(null);
    setDialog('tire');
  };

  const saveLicense = async () => {
    if (!licenseDate.trim()) {
      toast.error('נא לבחור תאריך תוקף לטסט');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Vehicle> & { id: string } = { id: vehicle.id, test_expiry: licenseDate };
      let docUrl: string | null = null;
      if (licenseFile) {
        const licenseUrl = await uploadToVehicleBucket(vehicle.id, 'license', licenseFile);
        await insertVehicleDocument(vehicle.id, 'רישיון רכב (טסט)', licenseUrl, 'annual_license');
        payload.license_image_url = licenseUrl;
        docUrl = licenseUrl;
      }
      await updateVehicle.mutateAsync(payload);
      const notify = await sendFleetFieldUpdateNotification({
        subject: `עדכון טסט — ${vehicle.plate_number}`,
        headline: 'תוקף טסט עודכן במערכת',
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        rows: [
          { label: 'תאריך תוקף טסט', value: licenseDate },
          { label: 'צילום / מסמך', value: licenseFile ? 'הועלה' : 'לא צורף' },
        ],
        documentUrl: docUrl,
      });
      toast.success('תוקף טסט עודכן' + (licenseFile ? ' והמסמך נשמר במסמכים' : ''));
      if (!notify.ok) {
        console.warn('[VehicleDetailQuickActions] email טסט', notify.message);
        toast.warning('שליחת המייל נכשלה', {
          description: `${notify.message} — המייל נשלח דרך send-service-update-notification (כמו טיפול). פרסו גרסה עדכנית של הפונקציה ובדקו RESEND_API_KEY ב-Secrets.`,
        });
      }
      setDialog(null);
      invalidate();
    } catch (e) {
      console.error(e);
      const hint = storageFailureHint(e);
      if (hint) toast.error('שמירה נכשלה', { description: hint });
      else toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const saveInsurance = async () => {
    if (!insuranceDate.trim()) {
      toast.error('נא לבחור תאריך תוקף לביטוח');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Vehicle> & { id: string } = { id: vehicle.id, insurance_expiry: insuranceDate };
      let docUrl: string | null = null;
      if (insuranceFile) {
        const insUrl = await uploadToVehicleBucket(vehicle.id, 'insurance', insuranceFile);
        await insertVehicleDocument(vehicle.id, 'פוליסת ביטוח', insUrl, 'insurance_policy');
        payload.insurance_pdf_url = insUrl;
        docUrl = insUrl;
      }
      await updateVehicle.mutateAsync(payload);
      const notify = await sendFleetFieldUpdateNotification({
        subject: `עדכון ביטוח — ${vehicle.plate_number}`,
        headline: 'תוקף ביטוח עודכן במערכת',
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        rows: [
          { label: 'תאריך תוקף ביטוח', value: insuranceDate },
          { label: 'מסמך', value: insuranceFile ? 'הועלה' : 'לא צורף' },
        ],
        documentUrl: docUrl,
      });
      toast.success('תוקף ביטוח עודכן' + (insuranceFile ? ' והמסמך נשמר במסמכים' : ''));
      if (!notify.ok) {
        console.warn('[VehicleDetailQuickActions] email ביטוח', notify.message);
        toast.warning('שליחת המייל נכשלה', {
          description: `${notify.message} — פרסו send-service-update-notification עדכנית ובדקו RESEND_API_KEY ב-Secrets.`,
        });
      }
      setDialog(null);
      invalidate();
    } catch (e) {
      console.error(e);
      const hint = storageFailureHint(e);
      if (hint) toast.error('שמירה נכשלה', { description: hint });
      else toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const saveTire = async () => {
    if (!tireDate.trim()) {
      toast.error('נא לבחור תאריך החלפת צמיגים');
      return;
    }
    if (tirePositions.length === 0) {
      toast.error('נא לסמן לפחות מיקום צמיג אחד בתמונה');
      return;
    }
    const orderIndex = (p: string) => {
      const i = TIRE_WHEEL_VALUES.indexOf(p as (typeof TIRE_WHEEL_VALUES)[number]);
      return i === -1 ? 999 : i;
    };
    const sortedPositions = [...tirePositions].sort((a, b) => orderIndex(a) - orderIndex(b));
    const titleSuffix = sortedPositions.join(' · ');
    setSaving(true);
    try {
      let docUrl: string | null = null;
      if (tireFile) {
        const url = await uploadToVehicleBucket(vehicle.id, 'tire', tireFile);
        await insertVehicleDocument(vehicle.id, `החלפת צמיגים — ${titleSuffix}`, url, 'tire_change');
        docUrl = url;
      }
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        last_tire_change_date: tireDate,
        next_tire_change_date: tireNextDate.trim() || null,
      });
      const notify = await sendFleetFieldUpdateNotification({
        subject: `עדכון צמיגים — ${vehicle.plate_number}`,
        headline: 'הוחלפו צמיגים (רישום במערכת)',
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        rows: [
          { label: 'מיקומים', value: titleSuffix },
          { label: 'תאריך החלפה', value: tireDate },
          { label: 'תאריך החלפה הבאה', value: tireNextDate.trim() || '—' },
          { label: 'צילום', value: tireFile ? 'הועלה' : 'לא צורף' },
        ],
        documentUrl: docUrl,
      });
      toast.success('פרטי צמיגים עודכנו' + (tireFile ? ' והמסמך נשמר במסמכים' : ''));
      if (!notify.ok) {
        console.warn('[VehicleDetailQuickActions] email צמיגים', notify.message);
        toast.warning('שליחת המייל נכשלה', {
          description: `${notify.message} — פרסו send-service-update-notification עדכנית ובדקו RESEND_API_KEY ב-Secrets.`,
        });
      }
      setDialog(null);
      invalidate();
    } catch (e) {
      console.error(e);
      const hint = storageFailureHint(e);
      if (hint) toast.error('שמירה נכשלה', { description: hint });
      else toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const tileClass =
    'flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-cyan-500/25 bg-slate-900/70 px-2 py-3 text-center text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.08)] transition hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-white sm:text-sm';

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button type="button" className={tileClass} onClick={openLicense}>
          <IdCard className="h-5 w-5 text-cyan-400" />
          <span>רישוי שנתי</span>
          <span className="text-[10px] font-normal text-slate-400">תאריך + צילום</span>
        </button>
        <button type="button" className={tileClass} onClick={openInsurance}>
          <Shield className="h-5 w-5 text-emerald-400" />
          <span>ביטוח</span>
          <span className="text-[10px] font-normal text-slate-400">תאריך + מסמך</span>
        </button>
        <button type="button" className={tileClass} onClick={openTire}>
          <CircleDot className="h-5 w-5 text-amber-400" />
          <span>צמיגים</span>
          <span className="text-[10px] font-normal text-slate-400">תמונה + תאריך</span>
        </button>
        {showServiceUpdate ? (
          <Link
            to={`/vehicles/service-update?vehicle=${encodeURIComponent(vehicle.id)}`}
            className={tileClass}
          >
            <Wrench className="h-5 w-5 text-purple-400" />
            <span>טיפול</span>
            <span className="text-[10px] font-normal text-slate-400">עדכון + חשבונית</span>
          </Link>
        ) : (
          <div className={`${tileClass} cursor-not-allowed opacity-40`} title="אין הרשאה או התכונה כבויה">
            <Wrench className="h-5 w-5 text-purple-400" />
            <span>טיפול</span>
          </div>
        )}
        {showReportMileage ? (
          <Link
            to={`/report-mileage?vehicle=${encodeURIComponent(vehicle.id)}`}
            className={tileClass}
          >
            <Gauge className="h-5 w-5 text-sky-400" />
            <span>קילומטראז׳</span>
            <span className="text-[10px] font-normal text-slate-400">דיווח כמו בראשי</span>
          </Link>
        ) : (
          <Link to={`/vehicles/odometer`} className={tileClass}>
            <Gauge className="h-5 w-5 text-sky-400" />
            <span>קילומטראז׳</span>
            <span className="text-[10px] font-normal text-slate-400">עדכון מד</span>
          </Link>
        )}
      </div>

      <Dialog open={dialog === 'license'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עדכון רישוי שנתי (טסט)</DialogTitle>
            <DialogDescription>תאריך התוקף יעודכן בכרטיס הרכב; הקובץ יישמר במסמכים תחת הכותרת &quot;רישיון רכב (טסט)&quot;.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <FleetDatePicker
              id="qd-license-date"
              label="תאריך תוקף טסט"
              value={licenseDate}
              onChange={setLicenseDate}
            />
            <div className="space-y-1">
              <Label htmlFor="qd-license-file">צילום רישיון / PDF (אופציונלי)</Label>
              <Input
                id="qd-license-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveLicense()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'insurance'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עדכון ביטוח</DialogTitle>
            <DialogDescription>תאריך התוקף יעודכן בכרטיס; הקובץ יישמר במסמכים תחת &quot;פוליסת ביטוח&quot;.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <FleetDatePicker
              id="qd-ins-date"
              label="תאריך תוקף ביטוח"
              value={insuranceDate}
              onChange={setInsuranceDate}
            />
            <div className="space-y-1">
              <Label htmlFor="qd-ins-file">צילום פוליסה / PDF (אופציונלי)</Label>
              <Input
                id="qd-ins-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setInsuranceFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveInsurance()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'tire'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>עדכון צמיגים</DialogTitle>
            <DialogDescription>
              סמני על תרשים הרכב איזה גלגלים הוחלפו (כמו במסירת רכב); ניתן לצרף צילום — יישמר במסמכים.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(85vh,720px)] space-y-3 overflow-y-auto py-2">
            <TireWheelDiagramSelector value={tirePositions} onChange={setTirePositions} minSelection={1} />
            <FleetDatePicker id="qd-tire-date" label="תאריך החלפה" value={tireDate} onChange={setTireDate} />
            <FleetDatePicker
              id="qd-tire-next"
              label="תאריך החלפה הבאה (אופציונלי)"
              value={tireNextDate}
              onChange={setTireNextDate}
            />
            <div className="space-y-1">
              <Label htmlFor="qd-tire-file">צילום (אופציונלי)</Label>
              <Input id="qd-tire-file" type="file" accept="image/*,application/pdf" onChange={(e) => setTireFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveTire()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
