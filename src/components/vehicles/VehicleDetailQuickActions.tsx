import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Vehicle } from '@/types/fleet';
import { useAuth } from '@/hooks/useAuth';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  IdCard,
  Shield,
  Gauge,
  Wrench,
  CircleDot,
  Loader2,
  ClipboardCheck,
  Plus,
  Trash2,
  Pencil,
  Camera,
  ImageIcon,
  Droplets,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtDriverDate } from '@/components/DriverCard';
import {
  computeNextInspectionDueAfterVisit,
  computeDisplayNextInspectionDue,
  periodicInspectionRuleSummary,
} from '@/lib/periodicInspection';
import { suggestPeriodicInspectionToast } from '@/lib/periodicInspectionSuggestions';
import {
  countMissingMarks,
  isRowIncludedInForm,
  itemsIncludedInForm,
  newPeriodicRow,
  parsePeriodicInspectionJson,
  rowsFromVehicleJson,
  serializePeriodicRowsForStorage,
  summarizeMarks,
  type PeriodicInspectionMark,
  type PeriodicInspectionRow,
} from '@/lib/periodicInspectionChecklist';
import { resolveSessionEmail } from '@/lib/fleetBootstrapEmails';
import { useQueryClient } from '@tanstack/react-query';
import { sendFleetFieldUpdateNotification } from '@/lib/sendFleetFieldUpdateNotification';
import {
  compressImageFileForUpload,
  isAndroidUserAgent,
  shouldAttachDirectCameraCapture,
  tryMaterializeImageFileFromInput,
} from '@/lib/mobilePhotoIngest';
import { photoPickerActionButtonClassName } from '@/lib/photoPickerUi';
import { TireWheelDiagramSelector, TIRE_WHEEL_VALUES } from '@/components/vehicles/TireWheelDiagramSelector';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { HudPhotoSlot } from '@/components/HudPhotoSlot';
import { MileageUpdateDialog } from '@/components/mileage/MileageUpdateDialog';

const DOCS_BUCKET = 'vehicle-documents';

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** כמו «מד אוץ» בכרטיס הרכב: max(מונה ב-DB, ק״מ מטיפול אחרון) */
function effectiveOdometerBaselineKm(vehicle: Vehicle): number {
  const odo = Number(vehicle.current_odometer);
  const odoNum = Number.isFinite(odo) ? Math.max(0, odo) : 0;
  const rawLast = vehicle.last_service_km;
  const last =
    rawLast != null && !Number.isNaN(Number(rawLast))
      ? Number(rawLast)
      : NaN;
  const lastNum = Number.isFinite(last) ? Math.max(0, last) : 0;
  return Math.max(odoNum, lastNum);
}

function normalizePeriodicKmDigits(raw: string): string {
  return raw.trim().replace(/\s/g, '').replace(/,/g, '');
}

function InlineImagePreview({ file }: { file: File | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !(file.type || '').startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file) return null;
  if (!previewUrl) {
    return (
      <p className="text-xs text-muted-foreground">
        נבחר קובץ: <span className="font-medium">{file.name}</span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <img
        src={previewUrl}
        alt="תצוגה מקדימה"
        className="max-h-40 w-full rounded-md border border-white/10 object-contain bg-black/30"
      />
      <p className="text-xs text-muted-foreground">
        נבחרה תמונה: <span className="font-medium">{file.name}</span>
      </p>
    </div>
  );
}

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

function periodicTemplateDraftKey(vehicleId: string): string {
  return `periodic-template-draft:${vehicleId}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPeriodicSnapshotSvg(params: {
  plateNumber: string;
  vehicleLabel: string;
  date: string;
  submittedAt: string;
  km: number;
  inspectorName: string;
  inspectorSignatureDataUrl?: string | null;
  nextDue: string;
  rows: Array<{ label: string; status: string }>;
}): File {
  const lineH = 34;
  const top = 170;
  const footerSpace = 170;
  const h = top + params.rows.length * lineH + footerSpace;
  const signatureBoxY = h - 120;
  const rowsSvg = params.rows
    .map((r, i) => {
      const y = top + i * lineH;
      return `<rect x="36" y="${y - 22}" width="1128" height="30" rx="7" fill="#0c1e34" stroke="#1d3f63" />
<text x="1138" y="${y - 2}" text-anchor="end" font-size="18" fill="#e7f4ff">${escapeXml(r.label)}</text>
<text x="120" y="${y - 2}" text-anchor="start" font-size="17" fill="#7dd3fc">${escapeXml(r.status)}</text>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${h}" viewBox="0 0 1200 ${h}">
  <rect width="1200" height="${h}" fill="#071428"/>
  <rect x="20" y="20" width="1160" height="${h - 40}" rx="16" fill="#0b1f37" stroke="#1f4a6e"/>
  <text x="1145" y="58" text-anchor="end" font-size="30" fill="#ffffff" font-weight="700">ביקורת תקופתית</text>
  <text x="1145" y="88" text-anchor="end" font-size="19" fill="#bfe7ff">רכב: ${escapeXml(params.vehicleLabel)} | מס' רישוי: ${escapeXml(params.plateNumber)}</text>
  <text x="1145" y="114" text-anchor="end" font-size="18" fill="#bfe7ff">תאריך ביקורת: ${escapeXml(params.date)} | ק"מ: ${escapeXml(String(params.km))}</text>
  <text x="1145" y="138" text-anchor="end" font-size="18" fill="#bfe7ff">שם הבוחן: ${escapeXml(params.inspectorName || '—')}</text>
  <text x="1145" y="160" text-anchor="end" font-size="16" fill="#bfe7ff">תאריך ושעת שליחה: ${escapeXml(params.submittedAt)}</text>
  <text x="1145" y="182" text-anchor="end" font-size="17" fill="#7dd3fc">ביקורת הבאה (מחושב): ${escapeXml(params.nextDue || '—')}</text>
  <rect x="36" y="170" width="1128" height="${params.rows.length * lineH + 10}" rx="10" fill="#0a1a2e" stroke="#174468"/>
  ${rowsSvg}
  <text x="1138" y="${signatureBoxY - 10}" text-anchor="end" font-size="16" fill="#bfe7ff">חתימת בוחן</text>
  <rect x="36" y="${signatureBoxY}" width="360" height="84" rx="8" fill="#ffffff" stroke="#1f4a6e"/>
  ${
    params.inspectorSignatureDataUrl
      ? `<image href="${params.inspectorSignatureDataUrl}" x="44" y="${signatureBoxY + 6}" width="344" height="72" preserveAspectRatio="xMidYMid meet" />`
      : ''
  }
</svg>`;
  return new File([svg], `periodic-inspection-snapshot-${params.plateNumber}-${params.date}.svg`, {
    type: 'image/svg+xml;charset=utf-8',
  });
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
    (ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
        ? 'image/png'
        : ext === 'txt'
          ? 'text/plain;charset=utf-8'
          : ext === 'svg'
            ? 'image/svg+xml'
            : ext === 'json'
              ? 'application/json'
              : 'image/jpeg');

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
  const { user, profile } = useAuth();
  const updateVehicle = useUpdateVehicle();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'license' | 'insurance' | 'tire' | 'periodic' | 'car_wash' | 'mileage' | null>(null);
  const [saving, setSaving] = useState(false);

  const [licenseDate, setLicenseDate] = useState('');
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [insuranceDate, setInsuranceDate] = useState('');
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [tirePositions, setTirePositions] = useState<string[]>([]);
  const [tireDate, setTireDate] = useState('');
  const [tireNextDate, setTireNextDate] = useState('');
  const [tireFile, setTireFile] = useState<File | null>(null);
  const [periodicDate, setPeriodicDate] = useState('');
  const [periodicFile, setPeriodicFile] = useState<File | null>(null);
  const [washPhotoFile, setWashPhotoFile] = useState<File | null>(null);
  const [hasInspectorSignature, setHasInspectorSignature] = useState(false);
  const [signatureMountKey, setSignatureMountKey] = useState(0);
  const [periodicKm, setPeriodicKm] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [piItems, setPiItems] = useState<PeriodicInspectionRow[]>([]);
  const [piMarks, setPiMarks] = useState<Record<string, PeriodicInspectionMark | undefined>>({});
  const [editingPiTemplate, setEditingPiTemplate] = useState(false);
  const [piDeleteOpen, setPiDeleteOpen] = useState(false);
  const [piDeletePwd, setPiDeletePwd] = useState('');
  const [piDeleteVerifying, setPiDeleteVerifying] = useState(false);
  const [piDeleteTargetId, setPiDeleteTargetId] = useState<string | null>(null);
  const [periodicLowKmOpen, setPeriodicLowKmOpen] = useState(false);
  /** ערך מנורמל שאושר בדיאלוג — אם משתמשים בק״מ אחר שנמוך מהבסיס שוב צריך אישור */
  const periodicLowKmAckNormRef = useRef<string | null>(null);
  const licenseGalleryRef = useRef<HTMLInputElement>(null);
  const licenseCameraRef = useRef<HTMLInputElement>(null);
  const insuranceGalleryRef = useRef<HTMLInputElement>(null);
  const insuranceCameraRef = useRef<HTMLInputElement>(null);
  const tireGalleryRef = useRef<HTMLInputElement>(null);
  const tireCameraRef = useRef<HTMLInputElement>(null);
  const periodicGalleryRef = useRef<HTMLInputElement>(null);
  const periodicCameraRef = useRef<HTMLInputElement>(null);
  const inspectorSignatureRef = useRef<SignaturePadRef>(null);
  const android = isAndroidUserAgent();

  const setDocFile = useCallback(
    async (kind: 'license' | 'insurance' | 'tire' | 'periodic', file: File | null) => {
      if (!file) {
        if (kind === 'license') setLicenseFile(null);
        if (kind === 'insurance') setInsuranceFile(null);
        if (kind === 'tire') setTireFile(null);
        if (kind === 'periodic') setPeriodicFile(null);
        return;
      }

      const mime = file.type || '';
      const looksLikeImage = mime.startsWith('image/') || mime === 'application/octet-stream' || mime === '';
      let normalized = file;
      if (looksLikeImage) {
        try {
          const out = await tryMaterializeImageFileFromInput(file);
          normalized = out.file;
        } catch (err) {
          console.warn('[VehicleDetailQuickActions] materialize doc image failed; using original', err);
          normalized = file;
        }
      }

      if (kind === 'license') setLicenseFile(normalized);
      if (kind === 'insurance') setInsuranceFile(normalized);
      if (kind === 'tire') setTireFile(normalized);
      if (kind === 'periodic') setPeriodicFile(normalized);
    },
    [],
  );

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

  const openCarWash = () => {
    setWashPhotoFile(null);
    setDialog('car_wash');
  };

  const openPeriodic = () => {
    periodicLowKmAckNormRef.current = null;
    setPeriodicLowKmOpen(false);
    setPeriodicDate(todayYmdLocal());
    setPeriodicFile(null);
    setHasInspectorSignature(false);
    setSignatureMountKey((k) => k + 1);
    const baselineKm = effectiveOdometerBaselineKm(vehicle);
    setPeriodicKm(baselineKm > 0 ? String(baselineKm) : '');
    setInspectorName('');
    const storageKey = periodicTemplateDraftKey(vehicle.id);
    let draftItems: PeriodicInspectionRow[] | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        draftItems = rowsFromVehicleJson({ items: parsed });
      }
    } catch {
      draftItems = null;
    }
    setPiItems(draftItems && draftItems.length > 0 ? draftItems : rowsFromVehicleJson(vehicle.periodic_inspection_json));
    setPiMarks({});
    setEditingPiTemplate(false);
    setDialog('periodic');
  };

  const removePiRow = (id: string) => {
    setPiItems((prev) => {
      if (prev.length <= 1) {
        toast.error('יש להשאיר לפחות שורת ביקורת אחת בתבנית');
        return prev;
      }
      return prev.filter((r) => r.id !== id);
    });
    setPiMarks((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  };

  const openPiDeleteDialog = (id: string) => {
    setPiDeleteTargetId(id);
    setPiDeletePwd('');
    setPiDeleteOpen(true);
  };

  const togglePiRowInForm = (rowId: string, checked: boolean) => {
    setPiItems((prev) => {
      const row = prev.find((r) => r.id === rowId);
      if (!row) return prev;
      if (!checked) {
        const othersIncluded = prev.filter((r) => r.id !== rowId && isRowIncludedInForm(r));
        if (othersIncluded.length === 0) {
          toast.error('חייבת להישאר לפחות שורה אחת מוצגת בטופס');
          return prev;
        }
      }
      return prev.map((r) =>
        r.id === rowId ? { ...r, includedInForm: checked === true } : r,
      );
    });
    if (!checked) {
      setPiMarks((m) => {
        const next = { ...m };
        delete next[rowId];
        return next;
      });
    }
  };

  const confirmRemovePiRowWithPassword = async () => {
    const emailRaw =
      resolveSessionEmail(profile, user)?.trim().toLowerCase() ?? user?.email?.trim()?.toLowerCase() ?? '';
    if (!emailRaw) {
      toast.error('לא נמצא אימייל לחשבון — התחברו מחדש או פנו למנהל');
      return;
    }
    const pwd = piDeletePwd.trim();
    if (!pwd) {
      toast.error('נא להזין את סיסמת ההתחברות שלך');
      return;
    }
    setPiDeleteVerifying(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailRaw,
        password: pwd,
      });
      if (error) {
        toast.error('הסיסמה שגויה או שהחשבון לא מתחבר עם סיסמה (למשל Google). נסו אימות בסיסמה או איפוס סיסמה.');
        return;
      }
      const idToRemove = piDeleteTargetId;
      if (!idToRemove) return;
      removePiRow(idToRemove);
      toast.success('השורה הוסרה מהתבנית');
      setPiDeleteOpen(false);
      setPiDeleteTargetId(null);
      setPiDeletePwd('');
    } finally {
      setPiDeleteVerifying(false);
    }
  };

  const addPiRow = () => {
    setPiItems((prev) => [...prev, newPeriodicRow()]);
  };

  const savePeriodicTemplateOnly = async () => {
    const cleaned: PeriodicInspectionRow[] = piItems.map((r) => ({
      id: r.id,
      label: String(r.label ?? '').trim() || '—',
      ...(r.includedInForm === false ? { includedInForm: false as const } : {}),
    }));
    if (cleaned.length === 0) {
      toast.error('לא ניתן לשמור טופס ללא שורות');
      return;
    }
    const prevStored = parsePeriodicInspectionJson(vehicle.periodic_inspection_json);
    const payloadJson = {
      items: serializePeriodicRowsForStorage(cleaned),
      ...(prevStored?.last ? { last: prevStored.last } : {}),
    };
    const storageKey = periodicTemplateDraftKey(vehicle.id);
    setSaving(true);
    try {
      if (!canPersistPeriodicJson) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(serializePeriodicRowsForStorage(cleaned)));
        } catch {
          // ignore localStorage quota/capability errors
        }
        toast.success('מבנה הטופס נשמר זמנית בדפדפן (עד לרענון מלא/עדכון schema)');
        return;
      }
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        periodic_inspection_json: payloadJson as unknown as Vehicle['periodic_inspection_json'],
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      toast.success('מבנה הטופס נשמר');
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

  const openGalleryPicker = useCallback((kind: 'license' | 'insurance' | 'tire' | 'periodic') => {
    if (kind === 'license') licenseGalleryRef.current?.click();
    if (kind === 'insurance') insuranceGalleryRef.current?.click();
    if (kind === 'tire') tireGalleryRef.current?.click();
    if (kind === 'periodic') periodicGalleryRef.current?.click();
  }, []);

  const openCameraPicker = useCallback((kind: 'license' | 'insurance' | 'tire' | 'periodic') => {
    if (kind === 'license') licenseCameraRef.current?.click();
    if (kind === 'insurance') insuranceCameraRef.current?.click();
    if (kind === 'tire') tireCameraRef.current?.click();
    if (kind === 'periodic') periodicCameraRef.current?.click();
  }, []);

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
      suggestPeriodicInspectionToast({ vehicleId: vehicle.id, mode: 'test', onVehicleDetailPage: true });
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

  const saveCarWash = async () => {
    if (!washPhotoFile) {
      toast.error('נא לצלם או לבחור תמונת רכב לפני השמירה');
      return;
    }
    setSaving(true);
    try {
      const url = await uploadToVehicleBucket(vehicle.id, 'car_wash', washPhotoFile);
      await insertVehicleDocument(
        vehicle.id,
        `שטיפת רכב — ${todayYmdLocal()}`,
        url,
        'car_wash',
      );
      const notify = await sendFleetFieldUpdateNotification({
        subject: `עדכון שטיפה — ${vehicle.plate_number}`,
        headline: 'תועדה שטיפת רכב (מסמך במערכת)',
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        rows: [{ label: 'צילום רכב', value: 'הועלה למסמכי הרכב' }],
        documentUrl: url,
      });
      toast.success('תמונת השטיפה נשמרה במסמכי הרכב');
      if (!notify.ok) {
        console.warn('[VehicleDetailQuickActions] email שטיפה', notify.message);
        toast.warning('שליחת המייל נכשלה', {
          description: `${notify.message} — פרסו send-service-update-notification עדכנית ובדקו RESEND_API_KEY ב-Secrets.`,
        });
      }
      setWashPhotoFile(null);
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

  const evaluatePeriodicKmWarning = useCallback(
    (raw: string) => {
      if (dialog !== 'periodic') return;
      const kmNorm = normalizePeriodicKmDigits(raw);
      if (!kmNorm) return;
      const kmNum = Number(kmNorm);
      if (!Number.isFinite(kmNum) || kmNum < 0) return;
      const systemKm = effectiveOdometerBaselineKm(vehicle);
      if (systemKm <= 0) return;
      if (kmNum >= systemKm) {
        periodicLowKmAckNormRef.current = null;
        return;
      }
      if (periodicLowKmAckNormRef.current === kmNorm) return;
      setPeriodicLowKmOpen(true);
    },
    [dialog, vehicle],
  );

  const savePeriodic = async () => {
    if (!periodicDate.trim()) {
      toast.error('נא לבחור תאריך ביקורת');
      return;
    }
    if (!periodicKm.trim()) {
      toast.error('נא למלא ק״מ בבדיקה');
      return;
    }
    if (!inspectorName.trim()) {
      toast.error('שם הבוחן הוא שדה חובה');
      return;
    }
    if (!hasInspectorSignature || inspectorSignatureRef.current?.isEmpty()) {
      toast.error('חתימת הבוחן היא שדה חובה');
      return;
    }
    const kmNorm = normalizePeriodicKmDigits(periodicKm);
    const kmNum = Number(kmNorm);
    if (!Number.isFinite(kmNum) || kmNum < 0) {
      toast.error('ק״מ בבדיקה אינו תקין');
      return;
    }
    const cleanedItems: PeriodicInspectionRow[] = piItems.map((r) => ({
      id: r.id,
      label: String(r.label ?? '').trim() || '—',
      ...(r.includedInForm === false ? { includedInForm: false as const } : {}),
    }));
    if (cleanedItems.length === 0) {
      toast.error('חסרות שורות בטופס הביקורת');
      return;
    }
    const visibleItems = itemsIncludedInForm(cleanedItems);
    if (visibleItems.length === 0) {
      toast.error(
        'אין פריטים מוצגים בטופס — סמנו במצב «עריכת מבנה» לפחות שורה אחת ב«להציג בטופס» או הפעילו הצגה מחדש.',
      );
      return;
    }
    const missing = countMissingMarks(cleanedItems, piMarks);
    if (missing > 0) {
      toast.error(`נא לסמן לכל פריט תקין / לא תקין / טופל (חסרות ${missing} שורות)`);
      return;
    }
    const marksOut: Record<string, 'ok' | 'fault' | 'handled'> = {};
    for (const r of visibleItems) {
      const m = piMarks[r.id];
      if (m === 'ok' || m === 'fault' || m === 'handled') marksOut[r.id] = m;
    }
    const sm = summarizeMarks(marksOut);
    const statusHeb: Record<'ok' | 'fault' | 'handled', string> = {
      ok: 'תקין',
      fault: 'לא תקין',
      handled: 'טופל',
    };

    const nextDue = computeNextInspectionDueAfterVisit(periodicDate, vehicle);
    const systemKm = effectiveOdometerBaselineKm(vehicle);
    if (systemKm > 0 && kmNum < systemKm && periodicLowKmAckNormRef.current !== kmNorm) {
      toast.error(
        'הק״מ בשדה נמוך מהמעודכן במערכת — צריך לאשר את ההתראה אחרי ההזנה בשדה, או לשנות את הק״מ.',
      );
      return;
    }

    setSaving(true);
    try {
      const inspectionJson = {
        items: serializePeriodicRowsForStorage(cleanedItems),
        last: {
          date: periodicDate,
          km: kmNum,
          inspector_name: inspectorName.trim() || null,
          inspector_signature_url: null as string | null,
          marks: marksOut,
        },
      };
      const payload: Partial<Vehicle> & { id: string } = {
        id: vehicle.id,
        last_inspection_date: periodicDate,
        next_inspection_date: nextDue,
        current_odometer: kmNum,
        ...(canPersistPeriodicJson
          ? { periodic_inspection_json: inspectionJson as unknown as Vehicle['periodic_inspection_json'] }
          : {}),
      };
      let docUrl: string | null = null;
      const inspectorSignatureDataUrl = inspectorSignatureRef.current?.getDataUrl() ?? null;
      if (periodicFile) {
        const url = await uploadToVehicleBucket(vehicle.id, 'periodic_inspection', periodicFile);
        await insertVehicleDocument(vehicle.id, 'ביקורת תקופתית — צילום', url, 'periodic_inspection');
        payload.inspection_form_url = url;
        docUrl = url;
      }
      if (canPersistPeriodicJson) {
        const pi = payload.periodic_inspection_json as any;
        if (pi?.last) pi.last.inspector_signature_url = null;
      }
      await updateVehicle.mutateAsync(payload);
      const checklistRows = visibleItems.map((r) => ({
        label: r.label,
        value: statusHeb[marksOut[r.id]],
      }));
      const snapshotFile = buildPeriodicSnapshotSvg({
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        date: periodicDate,
        submittedAt: new Date().toLocaleString('he-IL'),
        km: kmNum,
        inspectorName: inspectorName.trim(),
        inspectorSignatureDataUrl,
        nextDue: nextDue ?? '—',
        rows: visibleItems.map((r) => ({
          label: r.label,
          status: statusHeb[marksOut[r.id]],
        })),
      });
      const checklistUrl = await uploadToVehicleBucket(vehicle.id, 'periodic_inspection_snapshot', snapshotFile);
      await insertVehicleDocument(vehicle.id, 'ביקורת תקופתית — צילום טופס', checklistUrl, 'periodic_inspection');
      const notify = await sendFleetFieldUpdateNotification({
        subject: `ביקורת תקופתית — ${vehicle.plate_number}`,
        headline: 'ביקורת תקופתית נרשמה במערכת',
        plateNumber: String(vehicle.plate_number ?? ''),
        vehicleLabel: `${vehicle.manufacturer ?? ''} ${vehicle.model ?? ''}`.trim(),
        rows: [
          { label: 'תאריך ביקורת', value: periodicDate },
          { label: 'ק״מ בבדיקה', value: String(kmNum) },
          { label: 'בוחן', value: inspectorName.trim() || '—' },
          {
            label: 'סיכום תקין / לא תקין / טופל',
            value: `${sm.ok} / ${sm.fault} / ${sm.handled}`,
          },
          ...checklistRows,
          { label: 'ביקורת הבאה (מחושב)', value: nextDue ?? '—' },
          { label: 'צילום טופס (מסמכים)', value: 'נשמר עם חתימה משולבת' },
          { label: 'צילום מצורף', value: periodicFile ? 'הועלה' : 'לא צורף' },
        ],
        documentUrl: docUrl ?? checklistUrl,
      });
      toast.success('הטופס נשלח למסמכים בהצלחה');
      if (!nextDue) {
        toast.warning('לא חושב מועד ביקורת הבאה — הוסיפו חודש ושנה לעלייה לכביש בפרטי הרכב');
      }
      if (!notify.ok) {
        console.warn('[VehicleDetailQuickActions] email ביקורת', notify.message);
        toast.warning('שליחת המייל נכשלה', { description: notify.message });
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

  const periodicNextYmd = useMemo(() => computeDisplayNextInspectionDue(vehicle), [vehicle]);
  const previewPeriodicNextYmd = useMemo(() => {
    if (!periodicDate.trim()) return null;
    return computeNextInspectionDueAfterVisit(periodicDate, vehicle);
  }, [periodicDate, vehicle]);
  const canPersistPeriodicJson = useMemo(
    () => Object.prototype.hasOwnProperty.call(vehicle, 'periodic_inspection_json'),
    [vehicle],
  );

  const piVisibleRows = useMemo(() => itemsIncludedInForm(piItems), [piItems]);
  const piHiddenCount = useMemo(
    () => Math.max(0, piItems.length - piVisibleRows.length),
    [piItems.length, piVisibleRows.length],
  );

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
        <button type="button" className={tileClass} onClick={openPeriodic} title={periodicInspectionRuleSummary(vehicle)}>
          <ClipboardCheck className="h-5 w-5 text-rose-300" />
          <span>ביקורת תקופתית</span>
          <span className="text-[10px] font-normal text-slate-400">
            {periodicNextYmd ? `הבאה ≈ ${fmtDriverDate(periodicNextYmd)}` : 'תאריך + צילום'}
          </span>
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
        <button type="button" className={tileClass} onClick={() => setDialog('mileage')}>
          <Gauge className="h-5 w-5 text-sky-400" />
          <span>עדכון ק״מ</span>
          <span className="text-[10px] font-normal text-slate-400">
            {showReportMileage ? 'דיווח חדש (יציב)' : 'עדכון מד'}
          </span>
        </button>
        <button type="button" className={tileClass} onClick={openCarWash}>
          <Droplets className="h-5 w-5 text-sky-300" />
          <span>עדכון שטיפה</span>
          <span className="text-[10px] font-normal text-slate-400">מצלמה / גלריה</span>
        </button>
      </div>

      <MileageUpdateDialog
        open={dialog === 'mileage'}
        onOpenChange={(open) => setDialog(open ? 'mileage' : null)}
        lockedVehicleId={vehicle.id}
      />

      <Dialog
        open={dialog === 'periodic'}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden flex flex-col gap-0 p-0" dir="rtl">
          <div className="shrink-0 space-y-3 border-b border-white/10 px-4 pt-4 pb-3">
            <DialogHeader>
              <DialogTitle>ביקורת תקופתית</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                ב־3 שנים הראשונות מעלייה לכביש — מרווח 6 חודשים; לאחר מכן כל 3 חודשים.
                <span className="mt-1 block text-[11px] text-muted-foreground">{periodicInspectionRuleSummary(vehicle)}</span>
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="qd-periodic-plate">מספר רישוי</Label>
                <Input id="qd-periodic-plate" dir="ltr" readOnly value={vehicle.plate_number ?? ''} className="bg-muted/40" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qd-periodic-km">
                  ק״מ בבדיקה <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="qd-periodic-km"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="למשל 45230"
                  value={periodicKm}
                  onChange={(e) => setPeriodicKm(e.target.value)}
                  onBlur={(e) => evaluatePeriodicKmWarning(e.currentTarget.value)}
                  disabled={editingPiTemplate}
                />
                <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
                  אם הק״מ נמוך מהמעודכן במערכת — ההתראה תופיע בהעברה לשדה הבא (Tab או קליק בשדה אחר).
                </p>
              </div>
              <FleetDatePicker id="qd-periodic-date" label="תאריך ביקורת שבוצעה" value={periodicDate} onChange={setPeriodicDate} />
              <div className="space-y-1">
                <Label htmlFor="qd-periodic-inspector">
                  שם הבוחן <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="qd-periodic-inspector"
                  placeholder="חובה"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  disabled={editingPiTemplate}
                />
              </div>
            </div>

            {previewPeriodicNextYmd ? (
              <p className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5 text-xs text-cyan-100">
                ביקורת הבאה (מחושב):{' '}
                <span className="font-medium tabular-nums" dir="ltr">
                  {fmtDriverDate(previewPeriodicNextYmd)}
                </span>
              </p>
            ) : (
              <p className="text-xs text-amber-200/90">הוסיפו חודש ושנה לעלייה לכביש בכרטיס הרכב כדי לחשב מועד הבא.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={editingPiTemplate ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1"
                onClick={() => setEditingPiTemplate((v) => !v)}
                disabled={saving}
              >
                <Pencil className="h-3.5 w-3.5" />
                {editingPiTemplate ? 'סיום עריכת מבנה' : 'עריכת מבנה הטופס'}
              </Button>
              {editingPiTemplate ? (
                <>
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => addPiRow()} disabled={saving}>
                    <Plus className="h-3.5 w-3.5" />
                    שורת בדיקה
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void savePeriodicTemplateOnly()}
                    disabled={saving}
                  >
                    שמירת מבנה בלבד
                  </Button>
                </>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {editingPiTemplate
                ? 'עריכת מבנה: הוספת שורות, שינוי טקסט, וסימון «בטופס» — להצגה או הסתרה בלי למחוק. מחיקת שורה מהתבנית אפשרית רק לאחר הקלדת סיסמת ההתחברות שלך.'
                : 'ברשימת המילוי יופיעו רק שורות שמסומן עליהן «בטופס». נדרש מילוי תקין / לא תקין / טופל לכל פריט ברשימה.'}
            </p>

            {piHiddenCount > 0 ? (
              <p className="text-[11px] text-cyan-200/90">
                {piHiddenCount} שורות מוסתרות כרגע מהטופס (נשמרות בתבנית — אפשר להחזיר דרך «עריכת מבנה» → «בטופס»).
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[360px] border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-900/80">
                    <th className="border-b border-white/10 p-2 text-right font-semibold">פריט</th>
                    {editingPiTemplate ? (
                      <th className="w-16 border-b border-white/10 p-2 text-center font-semibold" title="הצגה בטופס המילוי">
                        בטופס
                      </th>
                    ) : null}
                    <th className="w-14 border-b border-white/10 p-2 text-center font-semibold">תקין</th>
                    <th className="w-14 border-b border-white/10 p-2 text-center font-semibold">לא תקין</th>
                    <th className="w-14 border-b border-white/10 p-2 text-center font-semibold">טופל</th>
                  </tr>
                </thead>
                <tbody>
                  {(editingPiTemplate ? piItems : piVisibleRows).map((row) => (
                    <tr
                      key={row.id}
                      className={
                        editingPiTemplate && !isRowIncludedInForm(row)
                          ? 'bg-black/25 hover:bg-black/30'
                          : 'hover:bg-white/[0.03]'
                      }
                    >
                      <td className="border-b border-white/5 p-2 align-middle text-right">
                        {editingPiTemplate ? (
                          <div className="flex gap-1 items-start">
                            <Input
                              className="h-8 flex-1 text-right"
                              value={row.label}
                              onChange={(e) =>
                                setPiItems((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                                )
                              }
                              dir="rtl"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => openPiDeleteDialog(row.id)}
                              disabled={saving}
                              title="מחיקת השורה מהתבנית (נדרשת סיסמה)"
                              aria-label="מחיקת שורה מהתבנית לאחר סיסמה"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span>{row.label}</span>
                        )}
                      </td>
                      {editingPiTemplate ? (
                        <td className="border-b border-white/5 p-1 align-middle">
                          <div className="flex justify-center pt-1">
                            <Checkbox
                              checked={isRowIncludedInForm(row)}
                              onCheckedChange={(c) => togglePiRowInForm(row.id, c === true)}
                              disabled={saving}
                              aria-label="להציג בטופס"
                            />
                          </div>
                        </td>
                      ) : null}
                      {(['ok', 'fault', 'handled'] as const).map((mark) => (
                        <td key={mark} className="border-b border-white/5 p-1 align-middle text-center">
                          <input
                            type="radio"
                            className="h-4 w-4 accent-cyan-500"
                            name={`pi-row-${row.id}`}
                            checked={piMarks[row.id] === mark}
                            disabled={editingPiTemplate || saving}
                            onChange={() =>
                              setPiMarks((m) => ({
                                ...m,
                                [row.id]: mark,
                              }))
                            }
                            aria-label={mark === 'ok' ? 'תקין' : mark === 'fault' ? 'לא תקין' : 'טופל'}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {!editingPiTemplate ? (
                  <tfoot>
                    <tr>
                      <td className="p-1" />
                      <td className="p-1 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          disabled={saving || piVisibleRows.length === 0}
                          onClick={() =>
                            setPiMarks((prev) => {
                              const next = { ...prev };
                              for (const row of piVisibleRows) next[row.id] = 'ok';
                              return next;
                            })
                          }
                        >
                          סימון הכל
                        </Button>
                      </td>
                      <td className="p-1" />
                      <td className="p-1" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            <div className="space-y-1">
              <Label>
                חתימת בוחן <span className="text-destructive">*</span>
              </Label>
              <div className="max-w-[280px] [&_canvas]:h-56 [&_canvas]:w-full">
                <SignaturePad key={signatureMountKey} ref={inspectorSignatureRef} onSign={setHasInspectorSignature} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="qd-periodic-file">צילום נזקים / טופס (אופציונלי)</Label>
              {android ? (
                <>
                  <input
                    ref={periodicCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('periodic', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={periodicGalleryRef}
                    id="qd-periodic-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('periodic', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openCameraPicker('periodic')}
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      צלם מהמצלמה
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openGalleryPicker('periodic')}
                    >
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      בחר מהגלריה / קבצים
                    </Button>
                  </div>
                </>
              ) : (
                <Input
                  id="qd-periodic-file"
                  type="file"
                  accept="image/*,application/pdf"
                  {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
                  onChange={(e) => void setDocFile('periodic', e.target.files?.[0] ?? null)}
                />
              )}
            </div>
            <InlineImagePreview file={periodicFile} />
          </div>

          <DialogFooter className="shrink-0 border-t border-white/10 px-4 py-3 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void savePeriodic()} disabled={saving || editingPiTemplate}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירת ביקורת'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={piDeleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPiDeletePwd('');
            setPiDeleteTargetId(null);
          }
          setPiDeleteOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שורה מתבנית הביקורת</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              כדי למחוק שורה באופן קבוע מהתבנית, הזינו את <strong>סיסמת ההתחברות</strong> של חשבון המשתמש הנוכחי.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 py-2">
            <Label htmlFor="pi-delete-password">סיסמה</Label>
            <Input
              id="pi-delete-password"
              type="password"
              autoComplete="current-password"
              value={piDeletePwd}
              onChange={(e) => setPiDeletePwd(e.target.value)}
              dir="ltr"
              disabled={piDeleteVerifying}
            />
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:gap-2">
            <AlertDialogCancel disabled={piDeleteVerifying}>ביטול</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={piDeleteVerifying}
              onClick={() => void confirmRemovePiRowWithPassword()}
            >
              {piDeleteVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק שורה לאחר אימות'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={periodicLowKmOpen} onOpenChange={setPeriodicLowKmOpen}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ק״מ נמוך מהמעודכן במערכת</AlertDialogTitle>
            <AlertDialogDescription className="text-right whitespace-pre-wrap">
              {(() => {
                const sys = effectiveOdometerBaselineKm(vehicle);
                const kmNorm = normalizePeriodicKmDigits(periodicKm);
                const entered = Number(kmNorm);
                const formattedSys = sys > 0 ? `${sys.toLocaleString('he-IL')} ק״מ` : '—';
                const formattedEnter = Number.isFinite(entered) ? `${entered.toLocaleString('he-IL')} ק״מ` : periodicKm.trim();
                return `שים לב: הק״מ נמוך ממה שמעודכן במערכת.\nק״מ במערכת (מד אוץ): ${formattedSys}\nק״מ שהוזן: ${formattedEnter}\n\nלאחר אישור אפשר להמשיך למלא את הטופס ולשמור.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                periodicLowKmAckNormRef.current = normalizePeriodicKmDigits(periodicKm);
                setPeriodicLowKmOpen(false);
              }}
            >
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {android ? (
                <>
                  <input
                    ref={licenseCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('license', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={licenseGalleryRef}
                    id="qd-license-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('license', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openCameraPicker('license')}
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      צלם מהמצלמה
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openGalleryPicker('license')}
                    >
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      בחר מהגלריה / קבצים
                    </Button>
                  </div>
                </>
              ) : (
                <Input
                  id="qd-license-file"
                  type="file"
                  accept="image/*,application/pdf"
                  {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
                  onChange={(e) => void setDocFile('license', e.target.files?.[0] ?? null)}
                />
              )}
            </div>
            <InlineImagePreview file={licenseFile} />
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
              {android ? (
                <>
                  <input
                    ref={insuranceCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('insurance', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={insuranceGalleryRef}
                    id="qd-ins-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('insurance', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openCameraPicker('insurance')}
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      צלם מהמצלמה
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openGalleryPicker('insurance')}
                    >
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      בחר מהגלריה / קבצים
                    </Button>
                  </div>
                </>
              ) : (
                <Input
                  id="qd-ins-file"
                  type="file"
                  accept="image/*,application/pdf"
                  {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
                  onChange={(e) => void setDocFile('insurance', e.target.files?.[0] ?? null)}
                />
              )}
            </div>
            <InlineImagePreview file={insuranceFile} />
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
              {android ? (
                <>
                  <input
                    ref={tireCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('tire', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={tireGalleryRef}
                    id="qd-tire-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => {
                      void setDocFile('tire', e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openCameraPicker('tire')}
                    >
                      <Camera className="h-4 w-4 shrink-0" />
                      צלם מהמצלמה
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={photoPickerActionButtonClassName()}
                      disabled={saving}
                      onClick={() => openGalleryPicker('tire')}
                    >
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      בחר מהגלריה / קבצים
                    </Button>
                  </div>
                </>
              ) : (
                <Input
                  id="qd-tire-file"
                  type="file"
                  accept="image/*,application/pdf"
                  {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
                  onChange={(e) => void setDocFile('tire', e.target.files?.[0] ?? null)}
                />
              )}
            </div>
            <InlineImagePreview file={tireFile} />
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

      <Dialog
        open={dialog === 'car_wash'}
        onOpenChange={(open) => {
          if (!open) {
            setWashPhotoFile(null);
            setDialog(null);
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עדכון שטיפה</DialogTitle>
            <DialogDescription>
              מצלמה או גלריה מתוך האפליקציה — התמונה תישמר במסמכי הרכב. לצילום native מהמייל השתמשו בקישור לעובדים.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <HudPhotoSlot
              file={washPhotoFile}
              onFileChange={setWashPhotoFile}
              imageAlt="רכב אחרי שטיפה"
              required
              disabled={saving}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setWashPhotoFile(null);
                setDialog(null);
              }}
              disabled={saving}
            >
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveCarWash()} disabled={saving || !washPhotoFile}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירה במסמכים'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
