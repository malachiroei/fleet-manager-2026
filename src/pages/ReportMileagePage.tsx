import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  const previewUrlRef = useRef<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const uploadTokenRef = useRef<string>('');

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (previewTimerRef.current != null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
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

  const pickPhoto = () => {
    console.log('[ReportMileagePage] pickPhoto click -> input.click()', {
      hasInput: Boolean(fileInputRef.current),
    });
    fileInputRef.current?.click();
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
      toast({ title: 'לא התקבלה תמונה', variant: 'destructive' });
      setUploadedPhotoUrl(null);
      setUploadedObjectPath(null);
      if (previewTimerRef.current != null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPhotoPreviewUrl(null);
      return;
    }

    // Reset previous uploaded URL when picking a new photo
    setUploadedPhotoUrl(null);
    setUploadedObjectPath(null);

    // Revoke the previous preview URL to avoid leaks
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    // Some Android devices choke if we createObjectURL immediately after camera transition.
    // Defer one tick to let the UI settle.
    if (previewTimerRef.current != null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewTimerRef.current = window.setTimeout(() => {
      try {
        const url = URL.createObjectURL(f);
        previewUrlRef.current = url;
        setPhotoPreviewUrl(url);
      } catch (err) {
        console.error('[ReportMileagePage] createObjectURL failed', err);
        setPhotoPreviewUrl(null);
      } finally {
        previewTimerRef.current = null;
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

      console.log('File details:', { name: f.name, size: f.size, type: f.type });

      // Android camera sometimes returns a File with missing `type` or odd internal backing.
      // Normalize to a new File constructed from the blob bytes.
      const normalizedType = (f.type && String(f.type).trim()) ? f.type : 'image/jpeg';
      const normalizedName = (f.name && String(f.name).trim()) ? f.name : 'photo.jpg';
      const fileToUpload = new File([f], normalizedName, { type: normalizedType || 'image/jpeg' });

      console.log('[ReportMileagePage] immediate upload start', {
        bucket: STORAGE_BUCKET,
        objectPath: tempPath,
        fileName: fileToUpload.name,
        fileType: fileToUpload.type,
        fileSize: fileToUpload.size,
      });

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(tempPath, fileToUpload, { upsert: true, contentType: fileToUpload.type || 'image/jpeg' });

      // If the user picked a new image mid-flight, ignore this result
      if (uploadTokenRef.current !== token) return;

      if (uploadError) {
        console.error('[ReportMileagePage] immediate upload failed', uploadError);
        toast({ title: 'Failed to upload photo, please try again', variant: 'destructive' });
        setUploadedPhotoUrl(null);
        setUploadedObjectPath(null);
        return;
      }

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(tempPath);
      const publicUrl = urlData?.publicUrl ?? null;
      if (!publicUrl) {
        console.error('[ReportMileagePage] immediate upload missing publicUrl', { tempPath, urlData });
        toast({ title: 'Failed to upload photo, please try again', variant: 'destructive' });
        return;
      }

      console.log('[ReportMileagePage] immediate upload success', { publicUrl });
      setUploadedPhotoUrl(publicUrl);
      setUploadedObjectPath(tempPath);
    } catch (err) {
      if (uploadTokenRef.current !== token) return;
      console.error('[ReportMileagePage] immediate upload threw', err);
      toast({ title: 'Failed to upload photo, please try again', variant: 'destructive' });
      setUploadedPhotoUrl(null);
      setUploadedObjectPath(null);
    } finally {
      if (uploadTokenRef.current === token) {
        setPhotoUploading(false);
      }
    }
    toast({
      title: 'התמונה נקלטה',
      description: `${Math.round(f.size / 1024).toLocaleString()} KB${f.type ? ` · ${f.type}` : ''}`,
    });
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
    if (!uploadedPhotoUrl) {
      if (photoPreviewUrl) {
        toast({ title: 'File lost during camera transition', variant: 'destructive' });
        console.error('[ReportMileagePage] File/URL missing during submit', {
          hasPreviewUrl: Boolean(photoPreviewUrl),
          previewUrl: photoPreviewUrl,
          photoUploading,
          uploadedPhotoUrl,
          uploadedObjectPath,
        });
        return;
      }
      toast({ title: 'נא לצרף תמונה של לוח השעונים', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Photo was already uploaded during selection (immediate upload strategy).
      const photoUrl = uploadedPhotoUrl;
      console.log('Step 1: Using pre-uploaded photo URL:', photoUrl, {
        objectPath: uploadedObjectPath,
      });

      const payload: Record<string, unknown> = {
        vehicle_id: selectedVehicle.id,
        odometer_value: odometerValue,
        photo_url: photoUrl,
        user_id: user.id,
      };

      console.log('Step 2: Inserting to mileage_logs...', payload);

      const { error: insertError } = await supabase.from('mileage_logs' as any).insert(payload as any);
      if (insertError) {
        console.error('[ReportMileagePage] mileage_logs insert failed', insertError);
        console.error('[ReportMileagePage] mileage_logs insert payload', payload);
        throw insertError;
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
          objectPath: uploadedObjectPath,
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

      toast({ title: 'דיווח קילומטראז׳ נשלח בהצלחה' });
      navigate('/');
    } catch (err: any) {
      console.error('[ReportMileagePage] submit failed', err);
      toast({
        title: 'שגיאה בשליחת הדיווח',
        description: err?.message ?? 'נסו שוב',
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
                    // Android stability: avoid display:none; keep input present but invisible.
                    className="absolute opacity-0 h-px w-px -z-10 overflow-hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void onPhotoPicked(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 gap-2"
                    onClick={() => {
                      console.log('[ReportMileagePage] camera button clicked');
                      pickPhoto();
                    }}
                    disabled={submitting || photoUploading}
                  >
                    {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {photoUploading ? 'מעלה תמונה…' : (photoFile ? 'החלף תמונה' : 'צלם תמונה')}
                  </Button>
                  {photoPreviewUrl && (
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      <img
                        src={photoPreviewUrl}
                        alt="תצוגה מקדימה"
                        className="w-full h-56 object-cover bg-black"
                      />
                      {photoUploading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm text-white">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            מעלה תמונה…
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {!photoUploading && uploadedPhotoUrl ? (
                    <p className="text-xs text-emerald-300/90">התמונה הועלתה בהצלחה</p>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <Button type="submit" className="flex-1 h-12 text-base" disabled={submitting}>
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

