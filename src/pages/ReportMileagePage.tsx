import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Gauge, ImageIcon, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebcamCapture } from '@/components/WebcamCapture';

const STORAGE_BUCKET = 'mileage-reports';

/** Survives in-tab reloads (e.g. Android camera recycling the tab) */
const MILEAGE_REPORT_SESSION = {
  vehicleId: 'mileage_report_vehicle_id',
  odometer: 'mileage_report_odometer',
  vehicleSearch: 'mileage_report_vehicle_search',
  cameraPending: 'mileage_report_camera_pending',
} as const;

function clearMileageReportSessionDraft() {
  try {
    sessionStorage.removeItem(MILEAGE_REPORT_SESSION.vehicleId);
    sessionStorage.removeItem(MILEAGE_REPORT_SESSION.odometer);
    sessionStorage.removeItem(MILEAGE_REPORT_SESSION.vehicleSearch);
    sessionStorage.removeItem(MILEAGE_REPORT_SESSION.cameraPending);
  } catch {
    // private mode / quota
  }
}

/**
 * Plain `accept="image/*"` on desktop lets the OS picker offer files, webcam, or “Take photo” where supported.
 * `capture="environment"` is limited to iOS-style mobile UAs only — never Android (separate activity / dropped result).
 */
function shouldAttachDirectCameraCapture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return false;
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  // iPadOS 13+ sometimes reports as Mac with touch
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

function isAndroidUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Android often supplies a `File` backed by a `content://` URI. That handle must not be used
 * as a long-lived preview target — read bytes once into a normal in-memory `File` for `<img>` and upload.
 */
async function materializeImageFileFromInput(source: File): Promise<File> {
  const mime =
    source.type && source.type !== 'application/octet-stream' && source.type !== ''
      ? source.type
      : 'image/jpeg';
  const buf = await source.arrayBuffer();
  const name = source.name?.trim() || 'mileage-photo.jpg';
  return new File([buf], name, { type: mime });
}

/** Materialize for Android `content://` safety; on desktop, empty reads fall back to the original `File`. */
async function tryMaterializeImageFileFromInput(source: File): Promise<{ file: File; ok: boolean }> {
  try {
    const out = await materializeImageFileFromInput(source);
    if (out.size === 0 && source.size > 0) {
      console.warn('[ReportMileagePage] materialize produced empty buffer; using original File (desktop-safe fallback)');
      return { file: source, ok: false };
    }
    return { file: out, ok: true };
  } catch (err) {
    console.warn('[ReportMileagePage] materialize failed; using original File', err);
    return { file: source, ok: false };
  }
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

function sanitizeStorageSegment(seg: string): string {
  return String(seg || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function canonicalPublicUrlForPath(objectPath: string): string {
  const path = String(objectPath || '').trim();
  if (!path) return '';
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return String(data?.publicUrl ?? '').trim();
}

function logMileageLogsInsertError(insertError: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  console.error('[ReportMileagePage] mileage_logs insert failed (RLS/schema/network)', {
    message: insertError?.message,
    code: insertError?.code,
    details: insertError?.details,
    hint: insertError?.hint,
  });
}

export default function ReportMileagePage() {
  const navigate = useNavigate();
  const { user, profile, loading, activeOrgId } = useAuth();
  const { data: vehicles = [] } = useVehicles();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading) return;
    const email =
      (profile?.email ?? user?.email ?? '').trim().toLowerCase();

    const isMaster = email === 'malachiroei@gmail.com';

    const allowed = isMaster || (
      Array.isArray(profile?.permissions)
        ? profile?.permissions
            .map((p: any) => String(p).trim().toLowerCase())
            .includes('report_mileage')
        : profile?.permissions?.report_mileage === true
    );

    if (!allowed) {
      toast({ title: 'אין לך הרשאה לדווח קילומטראז׳', variant: 'destructive' });
      navigate('/', { replace: true });
    }
  }, [loading, navigate, profile?.permissions, profile?.email, user?.email]);

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  /** Forces <img> remount after async preview (Android WebView paint quirks). */
  const [previewMountKey, setPreviewMountKey] = useState(0);
  /** Original file for submit-only upload to storage */
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const blobPreviewRevokeRef = useRef<string | null>(null);
  const previewGenerationRef = useRef(0);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fallbackFileInputRef = useRef<HTMLInputElement>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);

  /** TEMP: mileage photo pipeline debug (remove after S24 / PC testing). */
  const [captureDebug, setCaptureDebug] = useState<{
    fileDetected: boolean;
    fileName: string;
    materialization: 'idle' | 'pending' | 'success' | 'error';
  }>({ fileDetected: false, fileName: '', materialization: 'idle' });

  /** Restore draft + detect tab recycle after camera (session flag survives reload). */
  useEffect(() => {
    if (loading) return;

    try {
      const vid = sessionStorage.getItem(MILEAGE_REPORT_SESSION.vehicleId);
      const odo = sessionStorage.getItem(MILEAGE_REPORT_SESSION.odometer);
      const vsearch = sessionStorage.getItem(MILEAGE_REPORT_SESSION.vehicleSearch);

      if (vid) setSelectedVehicleId(vid);
      if (odo !== null) setOdometer(odo);
      if (vsearch !== null) setVehicleSearch(vsearch);

      if (sessionStorage.getItem(MILEAGE_REPORT_SESSION.cameraPending) === '1') {
        sessionStorage.removeItem(MILEAGE_REPORT_SESSION.cameraPending);
        toast({
          title: 'טעינה מחדש אחרי צילום',
          description:
            'נראה שהדפדפן התרענן בזמן הצילום. אם התמונה לא מופיעה, נסה לבחור אותה מהגלריה',
        });
      }
    } catch {
      // ignore
    } finally {
      setSessionHydrated(true);
    }
  }, [loading]);

  /** Persist vehicle + mileage as the user types (before camera / reload). */
  useEffect(() => {
    if (loading || !sessionHydrated) return;
    try {
      if (selectedVehicleId) {
        sessionStorage.setItem(MILEAGE_REPORT_SESSION.vehicleId, selectedVehicleId);
      } else {
        sessionStorage.removeItem(MILEAGE_REPORT_SESSION.vehicleId);
      }
      sessionStorage.setItem(MILEAGE_REPORT_SESSION.odometer, odometer);
      if (vehicleSearch.trim()) {
        sessionStorage.setItem(MILEAGE_REPORT_SESSION.vehicleSearch, vehicleSearch);
      } else {
        sessionStorage.removeItem(MILEAGE_REPORT_SESSION.vehicleSearch);
      }
    } catch {
      // ignore
    }
  }, [loading, sessionHydrated, selectedVehicleId, odometer, vehicleSearch]);

  useEffect(() => {
    return () => {
      if (blobPreviewRevokeRef.current) {
        URL.revokeObjectURL(blobPreviewRevokeRef.current);
        blobPreviewRevokeRef.current = null;
      }
    };
  }, []);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const plate = (v.plate_number ?? '').toLowerCase();
      const internal = (v.internal_number ?? '').toLowerCase();
      const label = `${v.manufacturer ?? ''} ${v.model ?? ''}`.toLowerCase();
      return plate.includes(q) || internal.includes(q) || label.includes(q);
    });
  }, [vehicleSearch, vehicles]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  /** Shared by `<input type="file">`, gallery fallback, and in-tab `getUserMedia` capture. */
  const startPhotoIngest = (file: File | null, clearInput: HTMLInputElement | null) => {
    const gen = ++previewGenerationRef.current;

    if (blobPreviewRevokeRef.current) {
      URL.revokeObjectURL(blobPreviewRevokeRef.current);
      blobPreviewRevokeRef.current = null;
    }
    setPhotoPreviewUrl(null);
    setPhotoFile(null);

    if (!file) {
      setCaptureDebug({ fileDetected: false, fileName: '', materialization: 'idle' });
      if (clearInput) clearInput.value = '';
      return;
    }

    setCaptureDebug({
      fileDetected: true,
      fileName: file.name?.trim() || '(unnamed)',
      materialization: 'pending',
    });

    try {
      sessionStorage.removeItem(MILEAGE_REPORT_SESSION.cameraPending);
    } catch {
      // ignore
    }

    void (async () => {
      const { file: workFile, ok: materializedOk } = await tryMaterializeImageFileFromInput(file);

      if (gen !== previewGenerationRef.current) return;

      setCaptureDebug((d) => ({
        ...d,
        materialization: materializedOk ? 'success' : 'error',
      }));

      setPhotoFile(workFile);

      let displayUrl: string | null = null;
      if (isAndroidUserAgent()) {
        displayUrl = await readFileAsDataUrl(workFile);
      } else {
        try {
          displayUrl = URL.createObjectURL(workFile);
        } catch (err) {
          console.warn('[ReportMileagePage] createObjectURL failed', err);
        }
        if (!displayUrl) {
          displayUrl = await readFileAsDataUrl(workFile);
        }
      }

      if (gen !== previewGenerationRef.current) {
        if (displayUrl?.startsWith('blob:')) URL.revokeObjectURL(displayUrl);
        return;
      }

      if (displayUrl?.startsWith('blob:')) {
        blobPreviewRevokeRef.current = displayUrl;
      } else {
        blobPreviewRevokeRef.current = null;
      }

      flushSync(() => {
        setPhotoPreviewUrl(displayUrl ?? null);
        setPreviewMountKey((k) => k + 1);
      });

      if (!displayUrl) {
        toast({
          title: 'לא ניתן להציג תצוגה מקדימה',
          description: 'הקובץ עדיין אמור להישלח — נסו שוב או תמונה מהגלריה.',
          variant: 'destructive',
        });
      }
    })()
      .catch((err) => {
        if (gen === previewGenerationRef.current) {
          console.error('[ReportMileagePage] preview pipeline failed', err);
          setCaptureDebug((d) => ({ ...d, materialization: 'error' }));
          toast({
            title: 'לא ניתן להציג תצוגה מקדימה',
            description: 'נסו שוב או תמונה מהגלריה.',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (clearInput) clearInput.value = '';
      });
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    startPhotoIngest(e.target.files?.[0] ?? null, e.target);
  };

  const handleWebcamCapturedFile = (captured: File) => {
    startPhotoIngest(captured, null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedVehicle) {
      toast({ title: 'נא לבחור רכב', variant: 'destructive' });
      return;
    }

    const odometerValue = Number(odometer);
    if (!Number.isFinite(odometerValue) || odometerValue <= 0) {
      toast({ title: 'נא להזין קילומטראז׳ תקין', variant: 'destructive' });
      return;
    }
    if (selectedVehicle.current_odometer != null && odometerValue < selectedVehicle.current_odometer) {
      toast({
        title: 'קילומטראז׳ חדש חייב להיות גבוה מהנוכחי',
        description: `נוכחי: ${selectedVehicle.current_odometer.toLocaleString()} ק"מ`,
        variant: 'destructive',
      });
      return;
    }

    if (!photoFile) {
      toast({ title: 'נא לצרף תמונה של לוח השעונים', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const ext = sanitizeFileExt(photoFile.name);
      const safeUserId = sanitizeStorageSegment(user.id);
      const rawId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const safeId = sanitizeStorageSegment(rawId);
      const objectPath = `tmp/${safeUserId}/${safeId}.${sanitizeStorageSegment(ext)}`;

      const contentType = photoFile.type || 'image/jpeg';
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, photoFile, { upsert: true, contentType });

      if (uploadError) {
        console.error('[ReportMileagePage] storage upload failed', uploadError);
        toast({
          title: 'העלאת התמונה נכשלה',
          description: uploadError.message || 'נסו שוב',
          variant: 'destructive',
        });
        return;
      }

      const photoUrl = canonicalPublicUrlForPath(objectPath);
      if (!photoUrl) {
        toast({ title: 'העלאת התמונה נכשלה', description: 'נסו שוב', variant: 'destructive' });
        return;
      }

      const payload: Record<string, unknown> = {
        vehicle_id: selectedVehicle.id,
        odometer_value: odometerValue,
        photo_url: photoUrl,
        user_id: user.id,
      };

      const { data: insertedRows, error: insertError } = await supabase
        .from('mileage_logs' as any)
        .insert(payload as any)
        .select('id');

      if (insertError) {
        logMileageLogsInsertError(insertError);
        const detailParts = [insertError.message, insertError.hint, insertError.details].filter(
          (p): p is string => Boolean(p && String(p).trim())
        );
        toast({
          title: 'שגיאה בשמירת הדיווח (מסד נתונים)',
          description:
            detailParts.join(' — ') ||
            'ייתכן חסימת RLS או שדה חסר. פרטים בקונסול.',
          variant: 'destructive',
        });
        return;
      }

      if (!insertedRows?.length) {
        console.warn(
          '[ReportMileagePage] mileage_logs insert returned no row in .select — verify RLS FOR SELECT on mileage_logs'
        );
      }

      try {
        const title = `עדכון ק"מ - ${odometerValue.toLocaleString('he-IL')} ק"מ`;

        const { error: vehicleDocError } = await supabase.from('vehicle_documents' as any).insert({
          vehicle_id: selectedVehicle.id,
          title,
          file_url: photoUrl,
          document_type: 'mileage_update',
          metadata: {
            odometer_value: odometerValue,
            photo_url: photoUrl,
            user_id: user.id,
          },
        } as any);

        if (vehicleDocError) {
          console.error('[ReportMileagePage] vehicle_documents insert failed', vehicleDocError);
        }
      } catch (vehicleDocErr) {
        console.error('[ReportMileagePage] vehicle_documents insert threw', vehicleDocErr);
      }

      const orgId = selectedVehicle.org_id ?? profile?.org_id ?? activeOrgId ?? null;
      if (!orgId) {
        console.error('[ReportMileagePage] missing orgId for vehicles odometer update', {
          vehicleId: selectedVehicle.id,
        });
      }

      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ current_odometer: odometerValue })
        .eq('id', selectedVehicle.id)
        .eq('org_id', orgId as string);

      if (updateError) {
        console.error('Failed to update vehicle odometer:', updateError);
      }

      try {
        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token ?? null;

        await supabase.functions.invoke('send-mileage-notification', {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: {
            to: 'malachiroei@gmail.com',
            subject: `עדכון קילומטראז' - ${selectedVehicle.plate_number}`,
            odometerReading: odometerValue,
            reportUrl: photoUrl,
          },
        });
      } catch (notifyErr) {
        console.error('[send-mileage-notification] threw:', notifyErr);
      }

      queryClient.invalidateQueries({ queryKey: ['vehicle', selectedVehicle.id, orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', selectedVehicle.id] });

      toast({
        title: 'הדיווח נשמר בהצלחה',
        description: `קילומטראז׳ ${odometerValue.toLocaleString('he-IL')} ק״מ נרשם במערכת. מעבירים לדף הבית…`,
      });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      console.error('[ReportMileagePage] submit failed', err);
      const msg = err instanceof Error ? err.message : 'נסו שוב';
      toast({
        title: 'שגיאה בשליחת הדיווח',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">דיווח קילומטראז׳</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-36">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base sm:text-lg">דווח עכשיו מהשטח</CardTitle>
                <p className="text-sm text-muted-foreground">בחר רכב, הזן קילומטראז׳ וצורף תמונה</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="vehicle-search">חיפוש רכב</Label>
                  <Input
                    id="vehicle-search"
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    placeholder="לדוגמה: 12-345-67"
                    className="text-base"
                    dir="ltr"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label>בחר רכב</Label>
                  <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="בחר מספר רכב" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate_number}
                          {v.internal_number ? ` · ${v.internal_number}` : ''} · {v.manufacturer} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="odometer">קילומטראז׳ נוכחי</Label>
                  <Input
                    id="odometer"
                    type="number"
                    inputMode="numeric"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    min={selectedVehicle?.current_odometer ?? 0}
                    placeholder="הכנס קריאת מונה"
                    required
                    dir="ltr"
                    className="h-12 text-lg"
                  />
                  {selectedVehicle && (
                    <p className="text-xs text-muted-foreground">
                      נוכחי במערכת: {selectedVehicle.current_odometer.toLocaleString()} ק&quot;מ
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium leading-none">תמונה של לוח השעונים</span>
                  {isAndroidUserAgent() ? (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                        <Button
                          type="button"
                          className="h-12 flex-1 gap-2 text-base"
                          disabled={submitting}
                          onClick={() => setWebcamOpen(true)}
                        >
                          <Camera className="h-4 w-4 shrink-0" />
                          צלם מהמצלמה
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 flex-1 gap-2 text-base"
                          disabled={submitting}
                          onClick={() => galleryInputRef.current?.click()}
                        >
                          <ImageIcon className="h-4 w-4 shrink-0" />
                          בחר מהגלריה
                        </Button>
                      </div>
                      <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={submitting}
                        onChange={handleFile}
                        aria-hidden
                      />
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground"
                        disabled={submitting}
                        onClick={() => fallbackFileInputRef.current?.click()}
                      >
                        או בחר קובץ (חלון המערכת)
                      </button>
                      <input
                        ref={fallbackFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={submitting}
                        onChange={handleFile}
                        aria-hidden
                      />
                      <p className="text-xs text-muted-foreground leading-snug">
                        צילום מהמצלמה נשאר בתוך הדפדפן (מומלץ אם צילום דרך האפליקציה נכשל). מהגלריה או מהמערכת — אם
                        מופיעה מצלמת מערכת, זה עדיין אפשרי כאן כגיבוי.
                      </p>
                    </>
                  ) : (
                    <>
                      <label
                        htmlFor="mileage_photo"
                        className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm ring-offset-background hover:bg-accent hover:text-accent-foreground has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
                        onPointerDownCapture={() => {
                          try {
                            sessionStorage.setItem(MILEAGE_REPORT_SESSION.cameraPending, '1');
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <input
                          id="mileage_photo"
                          name="mileage_photo"
                          type="file"
                          accept="image/*"
                          {...(shouldAttachDirectCameraCapture()
                            ? ({ capture: 'environment' } as const)
                            : {})}
                          className="hidden"
                          disabled={submitting}
                          onChange={handleFile}
                        />
                        <Camera className="h-4 w-4 shrink-0" />
                        {photoFile ? 'החלף תמונה' : 'צלם או בחר תמונה'}
                      </label>
                      <p className="text-xs text-muted-foreground leading-snug">
                        במחשב: בוחרים תמונה או מקור מצלמה דרך חלון הקבצים של המערכת (אם מופיע). אחרי בחירה אמורה
                        להופיע תצוגה מקדימה.
                      </p>
                    </>
                  )}
                  {photoPreviewUrl ? (
                    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border">
                      <img
                        key={previewMountKey}
                        src={photoPreviewUrl}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 h-12 text-base"
                    disabled={submitting || !photoFile}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                    שלח דיווח
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    onClick={() => navigate('/')}
                    disabled={submitting}
                  >
                    ביטול
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>

      <WebcamCapture
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        onCapture={handleWebcamCapturedFile}
        disabled={submitting}
      />

      {/* TEMP debug overlay — PC vs Android mileage capture (below modal z-50) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 max-h-28 overflow-y-auto border-t border-amber-500/40 bg-black/90 px-3 py-2 text-[11px] leading-snug text-amber-100 font-mono shadow-[0_-4px_24px_rgba(0,0,0,0.5)]"
        aria-hidden
      >
        <div className="text-amber-400/90 font-sans text-[10px] uppercase tracking-wide mb-1">
          Mileage photo debug (remove later)
        </div>
        <div>File Detected: {captureDebug.fileDetected ? 'Yes' : 'No'}</div>
        <div className="break-all">
          File Name: {captureDebug.fileName || '—'}
        </div>
        <div>
          Materialization Status:{' '}
          {captureDebug.materialization === 'idle'
            ? 'Idle'
            : captureDebug.materialization === 'pending'
              ? 'Pending'
              : captureDebug.materialization === 'success'
                ? 'Success'
                : 'Error'}
        </div>
      </div>
    </div>
  );
}
