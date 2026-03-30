import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Gauge, Loader2 } from 'lucide-react';

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

const STORAGE_BUCKET = 'mileage-reports';

/** Android: activity recreation after camera can reload the page — persist form + detect loss. */
const MILEAGE_REPORT_CAPTURE_SESSION_KEY = 'fleet-mileage-report-capture-v1';
const CAPTURE_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

function sanitizeStorageSegment(seg: string): string {
  // allow uuid-ish + basic safe characters for storage object names
  return String(seg || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Same string Supabase client uses for public buckets — use for DB `photo_url` and recovery if state lags. */
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

    // Master override for staging unblock.
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploadedObjectPath, setUploadedObjectPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoFileRef = useRef<File | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const uploadTokenRef = useRef<string>('');
  /** Mirrors uploaded photo URL/path immediately — avoids Android submit reading stale React state. */
  const uploadedPhotoUrlRef = useRef<string | null>(null);
  const uploadedObjectPathRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
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

  const clearMileageCaptureSession = () => {
    try {
      sessionStorage.removeItem(MILEAGE_REPORT_CAPTURE_SESSION_KEY);
    } catch {
      // ignore
    }
  };

  const persistMileageCaptureSession = () => {
    try {
      sessionStorage.setItem(
        MILEAGE_REPORT_CAPTURE_SESSION_KEY,
        JSON.stringify({
          isCapturingPhoto: true,
          vehicleId: selectedVehicleId,
          odometer,
          vehicleSearch,
          ts: Date.now(),
        }),
      );
    } catch {
      // ignore quota / private mode
    }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MILEAGE_REPORT_CAPTURE_SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        isCapturingPhoto?: boolean;
        vehicleId?: string;
        odometer?: string;
        vehicleSearch?: string;
        ts?: number;
      };
      if (!data.isCapturingPhoto) {
        clearMileageCaptureSession();
        return;
      }
      const ts = typeof data.ts === 'number' ? data.ts : 0;
      if (Date.now() - ts > CAPTURE_SESSION_MAX_AGE_MS) {
        clearMileageCaptureSession();
        return;
      }
      if (typeof data.vehicleId === 'string') setSelectedVehicleId(data.vehicleId);
      if (typeof data.odometer === 'string') setOdometer(data.odometer);
      if (typeof data.vehicleSearch === 'string') setVehicleSearch(data.vehicleSearch);
      clearMileageCaptureSession();
      toast({
        title: 'נתוני המצלמה לא נשמרו',
        description:
          'Camera data lost due to low memory. Please try selecting from Gallery.',
        variant: 'destructive',
      });
    } catch (err) {
      console.error('[ReportMileagePage] capture session restore failed', err);
      clearMileageCaptureSession();
    }
  }, []);

  const pickPhoto = () => {
    persistMileageCaptureSession();
    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const handlePhotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    void onPhotoPicked(f);
  };

  const onPhotoPicked = async (f: File | null) => {
    console.log('[ReportMileagePage] onPhotoPicked', {
      hasFile: Boolean(f),
      name: f?.name,
      type: f?.type,
      size: typeof f?.size === 'number' ? f.size : null,
    });
    setPhotoFile(f);
    photoFileRef.current = f;
    if (!f) {
      clearMileageCaptureSession();
      toast({ title: 'לא התקבלה תמונה', variant: 'destructive' });
      uploadedPhotoUrlRef.current = null;
      uploadedObjectPathRef.current = null;
      setUploadedPhotoUrl(null);
      setUploadedObjectPath(null);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPhotoPreviewUrl(null);
      return;
    }

    clearMileageCaptureSession();

    // Reset previous uploaded URL when picking a new photo
    uploadedPhotoUrlRef.current = null;
    uploadedObjectPathRef.current = null;
    setUploadedPhotoUrl(null);
    setUploadedObjectPath(null);

    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    window.setTimeout(() => {
      try {
        const url = URL.createObjectURL(f);
        previewObjectUrlRef.current = url;
        setPhotoPreviewUrl(url);
      } catch (err) {
        console.error('[ReportMileagePage] createObjectURL failed', err);
        setPhotoPreviewUrl(null);
      }
    }, 0);

    // Immediate upload strategy: upload right after selection to avoid state-loss during submit.
    if (!user) return;
    setPhotoUploading(true);
    const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    uploadTokenRef.current = token;

    try {
      const ext = sanitizeFileExt(f.name);
      const safeExt = sanitizeStorageSegment(ext);
      const safeUserId = sanitizeStorageSegment(user.id);
      const rawId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const safeId = sanitizeStorageSegment(rawId);
      const tempPath = `tmp/${safeUserId}/${safeId}.${safeExt}`;

      console.log('File details (raw input):', { name: f.name, size: f.size, type: f.type });

      // Android Chrome often hands back a File/Blob backed by content:// that fails if streamed
      // lazily. Materialize bytes first, then upload a fresh Blob (same pattern as iOS/desktop).
      const normalizedType = f.type && String(f.type).trim() ? f.type : 'image/jpeg';
      const normalizedName = f.name && String(f.name).trim() ? f.name : 'photo.jpg';

      let bytes: ArrayBuffer;
      try {
        bytes = await f.arrayBuffer();
      } catch (readErr) {
        console.error('[ReportMileagePage] arrayBuffer() failed (Android camera?)', readErr);
        toast({
          title: 'לא ניתן לקרוא את התמונה',
          description: 'נסו שוב או בחרו תמונה מהגלריה',
          variant: 'destructive',
        });
        return;
      }

      if (!bytes || bytes.byteLength === 0) {
        console.error('[ReportMileagePage] empty image buffer after read', {
          reportedSize: f.size,
          byteLength: bytes?.byteLength,
        });
        toast({
          title: 'התמונה ריקה',
          description: 'צלמו שוב או בחרו קובץ מהגלריה',
          variant: 'destructive',
        });
        return;
      }

      const blobToUpload = new Blob([bytes], { type: normalizedType || 'image/jpeg' });

      console.log('[ReportMileagePage] immediate upload start', {
        bucket: STORAGE_BUCKET,
        objectPath: tempPath,
        fileName: normalizedName,
        fileType: blobToUpload.type,
        fileSize: blobToUpload.size,
      });

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(tempPath, blobToUpload, {
        upsert: true,
        contentType: blobToUpload.type || 'image/jpeg',
      });

      // If the user picked a new image mid-flight, ignore this result
      if (uploadTokenRef.current !== token) return;

      if (uploadError) {
        console.error('[ReportMileagePage] immediate upload failed', uploadError);
        toast({
          title: 'העלאת התמונה נכשלה',
          description: uploadError.message || 'נסו שוב או בדקו חיבור',
          variant: 'destructive',
        });
        uploadedPhotoUrlRef.current = null;
        uploadedObjectPathRef.current = null;
        setUploadedPhotoUrl(null);
        setUploadedObjectPath(null);
        return;
      }

      const publicUrl = canonicalPublicUrlForPath(tempPath);
      if (!publicUrl) {
        console.error('[ReportMileagePage] immediate upload missing publicUrl', { tempPath });
        toast({
          title: 'העלאת התמונה נכשלה',
          description: 'נסו שוב',
          variant: 'destructive',
        });
        uploadedPhotoUrlRef.current = null;
        uploadedObjectPathRef.current = null;
        setUploadedPhotoUrl(null);
        setUploadedObjectPath(null);
        return;
      }

      console.log('[ReportMileagePage] immediate upload success', {
        objectPath: tempPath,
        publicUrl,
      });

      uploadedPhotoUrlRef.current = publicUrl;
      uploadedObjectPathRef.current = tempPath;
      setUploadedPhotoUrl(publicUrl);
      setUploadedObjectPath(tempPath);
      toast({
        title: 'התמונה נקלטה והועלתה',
        description: `${Math.round(blobToUpload.size / 1024).toLocaleString()} KB`,
      });
    } catch (err) {
      if (uploadTokenRef.current !== token) return;
      console.error('[ReportMileagePage] immediate upload threw', err);
      toast({
        title: 'העלאת התמונה נכשלה',
        description: err instanceof Error ? err.message : 'נסו שוב',
        variant: 'destructive',
      });
      uploadedPhotoUrlRef.current = null;
      uploadedObjectPathRef.current = null;
      setUploadedPhotoUrl(null);
      setUploadedObjectPath(null);
    } finally {
      if (uploadTokenRef.current === token) {
        setPhotoUploading(false);
      }
    }
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

    if (photoUploading) {
      toast({
        title: 'ממתינים לסיום העלאת התמונה',
        description: 'המתינו עד שיופיע ״התמונה הועלתה בהצלחה״ ואז שלחו שוב',
        variant: 'destructive',
      });
      return;
    }

    const photoUrl =
      uploadedPhotoUrlRef.current?.trim() || uploadedPhotoUrl?.trim() || null;

    if (!photoUrl) {
      toast({
        title: 'נא להעלות תמונה לפני השליחה',
        description: 'חכו לסיום ההעלאה או צלמו שוב',
        variant: 'destructive',
      });
      return;
    }

    const resolvedPath =
      uploadedObjectPathRef.current?.trim() || uploadedObjectPath?.trim() || null;

    setSubmitting(true);
    try {
      console.log('[ReportMileagePage] submit photo_url (for mileage_logs)', {
        photoUrl,
        objectPath: resolvedPath,
      });

      const payload: Record<string, unknown> = {
        vehicle_id: selectedVehicle.id,
        odometer_value: odometerValue,
        photo_url: photoUrl,
        user_id: user.id,
      };

      console.log('[ReportMileagePage] mileage_logs insert payload', payload);

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
          '[ReportMileagePage] mileage_logs insert returned no row in .select — row may still exist; verify RLS FOR SELECT on mileage_logs'
        );
      } else {
        console.log('[ReportMileagePage] mileage_logs insert ok', { insertedRows });
      }

      // Create a "Documents" history record (matches the Vehicle Detail "מסמכים" tab).
      // Note: vehicle_documents is used by VehicleDetailPage to render doc.title + doc.created_at.
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
        // Non-fatal: mileage is already saved; we don't want to block the user flow.
        console.error('[ReportMileagePage] vehicle_documents insert threw', vehicleDocErr);
      }

      // Keep UI in sync: update the vehicle odometer immediately.
      // NOTE: Multi-tenancy: we include `org_id` in the where-clause.
      const orgId = selectedVehicle.org_id ?? profile?.org_id ?? activeOrgId ?? null;
      if (!orgId) {
        console.error('[ReportMileagePage] missing orgId for vehicles odometer update', {
          vehicleId: selectedVehicle.id,
          selectedVehicleOrgId: selectedVehicle.org_id,
          profileOrgId: profile?.org_id,
          activeOrgId,
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

      // Send notification email (direct invoke; DB trigger not required)
      try {
        console.log('Step 4: Invoking Edge Function...');
        const payload = {
          to: 'malachiroei@gmail.com',
          subject: `עדכון קילומטראז' - ${selectedVehicle.plate_number}`,
          odometerReading: odometerValue,
          reportUrl: photoUrl,
        };

        console.log('[send-mileage-notification] storage target', {
          bucket: STORAGE_BUCKET,
          objectPath: resolvedPath,
          photoUrl,
        });

        console.log('[send-mileage-notification] invoking', {
          function: 'send-mileage-notification',
          payload,
        });

        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token ?? null;

        console.log('[send-mileage-notification] auth token present?', Boolean(token));

        const invokeResult = await supabase.functions.invoke('send-mileage-notification', {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: payload,
        });

        // In Supabase JS, invoke often returns `{ data, error }` without throwing.
        const maybeError = (invokeResult as any)?.error ?? null;
        if (maybeError) {
          console.error('[send-mileage-notification] invoke returned error', maybeError);
          console.error('[send-mileage-notification] invokeResult raw', invokeResult);
        } else {
          console.log('[send-mileage-notification] invoke success', (invokeResult as any)?.data ?? invokeResult);
        }
      } catch (notifyErr) {
        // Non-fatal: mileage is already saved
        console.error('[send-mileage-notification] threw:', notifyErr);
      }

      // Invalidate vehicle queries so Vehicle Detail "מד אוץ" card refreshes.
      // useVehicle/useVehicles query keys include `orgId`, so invalidate with the exact prefix.
      queryClient.invalidateQueries({ queryKey: ['vehicle', selectedVehicle.id, orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', selectedVehicle.id] });

      toast({
        title: 'הדיווח נשמר בהצלחה',
        description: `קילומטראז׳ ${odometerValue.toLocaleString('he-IL')} ק״מ נרשם במערכת. מעבירים לדף הבית…`,
      });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      console.error('[ReportMileagePage] submit failed (unexpected)', err);
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

      <main className="container py-6 pb-28">
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
                  <Label>תמונה של לוח השעונים</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 gap-2"
                    onClick={() => {
                      pickPhoto();
                    }}
                    disabled={submitting || photoUploading}
                  >
                    {photoUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {photoUploading ? 'מעלה תמונה…' : photoFile ? 'החלף תמונה' : 'צלם תמונה'}
                  </Button>
                  {photoPreviewUrl ? (
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      <img
                        src={photoPreviewUrl}
                        alt="תצוגה מקדימה"
                        className="w-full h-56 object-cover bg-black"
                      />
                      {photoUploading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-white">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            מעלה תמונה…
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!photoUploading && uploadedPhotoUrl ? (
                    <p className="text-xs text-emerald-300/90">התמונה הועלתה בהצלחה</p>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 h-12 text-base"
                    disabled={
                      submitting ||
                      photoUploading ||
                      !(uploadedPhotoUrlRef.current?.trim() || uploadedPhotoUrl?.trim())
                    }
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
    </div>
  );
}

