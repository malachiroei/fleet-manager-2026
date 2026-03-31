import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Camera, ImageIcon, Loader2, Trash2, Wrench } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useVehicles, useUpdateVehicle } from '@/hooks/useVehicles';
import type { Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebcamCapture } from '@/components/WebcamCapture';
import { useMobilePhotoIngest } from '@/hooks/useMobilePhotoIngest';
import { isAndroidUserAgent, shouldAttachDirectCameraCapture } from '@/lib/mobilePhotoIngest';

const DOCS_BUCKET = 'vehicle-documents';

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addOneYearYmd(ymd: string): string {
  const [y, mo, da] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!y || !mo || !da) return ymd;
  const dt = new Date(y, mo - 1, da);
  dt.setFullYear(dt.getFullYear() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function normalizePlate(s: string): string {
  return s.replace(/[\s-]/g, '').toLowerCase();
}

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

export default function ServiceUpdatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const { data: featureFlags, isPending: flagsPending } = useFeatureFlags();
  const { data: vehicles = [] } = useVehicles();
  const updateVehicle = useUpdateVehicle();

  const serviceUpdateAllowed =
    Boolean(user) &&
    !flagsPending &&
    hasPermission('vehicles') &&
    isFeatureEnabled(featureFlags, 'qa_service_update');

  useEffect(() => {
    if (!user || flagsPending) return;
    if (!hasPermission('vehicles') || !isFeatureEnabled(featureFlags, 'qa_service_update')) {
      toast({ title: 'עדכון טיפול אינו זמין', variant: 'destructive' });
      navigate('/vehicles', { replace: true });
    }
  }, [user, flagsPending, featureFlags, hasPermission, navigate]);

  const [plateSearch, setPlateSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [serviceDate, setServiceDate] = useState(todayYmdLocal);
  const [mileageInput, setMileageInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const android = isAndroidUserAgent();
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamMountKey, setWebcamMountKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const {
    photoFile,
    photoPreviewUrl,
    previewMountKey,
    isMaterializing,
    startPhotoIngest,
    resetPhoto,
  } = useMobilePhotoIngest({
    logLabel: '[ServiceUpdatePage]',
  });

  const filteredVehicles = useMemo(() => {
    const q = plateSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const plate = (v.plate_number ?? '').toLowerCase();
      const internal = (v.internal_number ?? '').toLowerCase();
      const label = `${v.manufacturer ?? ''} ${v.model ?? ''}`.toLowerCase();
      return plate.includes(q) || internal.includes(q) || label.includes(q);
    });
  }, [plateSearch, vehicles]);

  const selectedByDropdown = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const resolvedVehicle: Vehicle | null = useMemo(() => {
    if (selectedByDropdown) return selectedByDropdown;
    const raw = plateSearch.trim();
    if (!raw) return null;
    const n = normalizePlate(raw);
    const matches = vehicles.filter((v) => normalizePlate(v.plate_number) === n);
    if (matches.length === 1) return matches[0];
    return null;
  }, [selectedByDropdown, plateSearch, vehicles]);

  const nextServiceDate = useMemo(() => addOneYearYmd(serviceDate), [serviceDate]);

  const mileageNum = useMemo(() => {
    const n = parseInt(mileageInput.replace(/,/g, '').trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }, [mileageInput]);

  const nextServiceKm = useMemo(() => {
    if (!resolvedVehicle || !Number.isFinite(mileageNum)) return null;
    const interval = resolvedVehicle.service_interval_km;
    if (interval == null || Number.isNaN(interval) || interval <= 0) return null;
    return mileageNum + interval;
  }, [resolvedVehicle, mileageNum]);

  const clearPhoto = () => {
    resetPhoto();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const onSelectVehicle = (id: string) => {
    setSelectedVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) setPlateSearch(v.plate_number);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !resolvedVehicle) {
      toast({ title: 'נא לבחור רכב או להזין מספר רישוי מדויק מהרשימה', variant: 'destructive' });
      return;
    }

    if (!Number.isFinite(mileageNum) || mileageNum <= 0) {
      toast({ title: 'נא להזין קילומטראז׳ תקין', variant: 'destructive' });
      return;
    }

    const dbOdo = Number(resolvedVehicle.current_odometer) || 0;
    if (mileageNum <= dbOdo) {
      toast({
        title: 'הקילומטראז׳ חייב להיות גבוה מהמד הרשום במערכת',
        description: `נוכחי: ${dbOdo.toLocaleString()} ק"מ`,
        variant: 'destructive',
      });
      return;
    }

    if (
      resolvedVehicle.service_interval_km == null ||
      resolvedVehicle.service_interval_km <= 0 ||
      nextServiceKm == null
    ) {
      toast({
        title: 'חסר מרווח טיפול מומלץ (ק״מ)',
        description: 'הגדר את השדה בעריכת הרכב לפני עדכון טיפול',
        variant: 'destructive',
      });
      return;
    }

    if (!photoFile) {
      toast({ title: 'נא לצרף צילום חשבונית / טיפול', variant: 'destructive' });
      return;
    }
    if (isMaterializing) {
      toast({ title: 'מעבדים את התמונה…', description: 'המתן רגע לפני השליחה.', variant: 'destructive' });
      return;
    }

    if (!serviceDate) {
      toast({ title: 'נא לבחור תאריך טיפול', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const ext = sanitizeFileExt(photoFile.name);
      const uid =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `vehicle-files/${resolvedVehicle.id}/service_invoice_${uid}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(DOCS_BUCKET)
        .upload(path, photoFile, { upsert: false, contentType: photoFile.type || undefined });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(path);
      const photoUrl = urlData?.publicUrl;
      if (!photoUrl) throw new Error('לא התקבל קישור לתמונה');

      const vehicleLabel = `${resolvedVehicle.manufacturer} ${resolvedVehicle.model}`.trim();

      const payload: Partial<Vehicle> & { id: string } = {
        id: resolvedVehicle.id,
        last_service_date: serviceDate,
        last_service_km: mileageNum,
        next_maintenance_date: nextServiceDate,
        next_maintenance_km: nextServiceKm,
      };

      if (mileageNum > dbOdo) {
        payload.current_odometer = mileageNum;
        payload.last_odometer_date = serviceDate;
      }

      await updateVehicle.mutateAsync(payload);

      // Persist a service log entry (email trigger depends on this succeeding).
      const { error: serviceLogError } = await supabase.from('vehicle_service_logs' as any).insert({
        plate_number: resolvedVehicle.plate_number,
        service_type: 'service_update',
        odometer_reading: mileageNum,
        photo_url: photoUrl,
        user_id: user.id,
      } as any);
      if (serviceLogError) throw serviceLogError;

      try {
        await supabase.from('vehicle_documents').insert({
          vehicle_id: resolvedVehicle.id,
          title: `עדכון טיפול ${serviceDate} — ${mileageNum.toLocaleString('he-IL')} ק"מ`,
          file_url: photoUrl,
          document_type: 'service_update',
          metadata: {
            service_date: serviceDate,
            next_service_date: nextServiceDate,
            mileage: mileageNum,
            next_maintenance_km: nextServiceKm,
            user_id: user.id,
          },
        } as any);
      } catch (docErr) {
        console.error('[ServiceUpdatePage] vehicle_documents insert', docErr);
      }

      try {
        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token ?? null;
        const invokeResult = await supabase.functions.invoke('send-mileage-notification', {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: {
            to: 'malachiroei@gmail.com',
            subject: `עדכון טיפול - ${resolvedVehicle.plate_number}`,
            serviceType: 'service_update',
            plateNumber: resolvedVehicle.plate_number,
            odometerReading: mileageNum,
            serviceDate,
            reportUrl: photoUrl,
            photoUrl,
          },
        });
        if (invokeResult.error) {
          console.error('[send-mileage-notification] (service update) invoke returned error', invokeResult.error);
        }
      } catch (notifyErr) {
        console.error('[send-mileage-notification] (service update) threw', notifyErr);
      }

      queryClient.invalidateQueries({ queryKey: ['vehicle', resolvedVehicle.id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', resolvedVehicle.id] });

      toast({ title: 'הנתונים נשמרו והעדכון נשלח במייל בהצלחה' });
      navigate(`/vehicles/${resolvedVehicle.id}`);
    } catch (err: unknown) {
      console.error('[ServiceUpdatePage] submit failed', err);
      const msg = err instanceof Error ? err.message : 'נסו שוב';
      toast({ title: 'שגיאה בשמירה', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || flagsPending || !serviceUpdateAllowed) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/vehicles">
              <Button variant="ghost" size="icon" type="button">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">עדכון טיפול</h1>
          </div>
        </div>
      </header>

      <main className="container py-6 pb-28">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/15">
                <Wrench className="h-5 w-5 text-purple-400" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base sm:text-lg">רישום טיפול וחישוב טיפול הבא</CardTitle>
                <p className="text-sm text-muted-foreground">
                  בחר רכב או הקלד מספר רישוי, הזן מדד מונה וצרף חשבונית
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="plate-search">חיפוש / מספר רישוי</Label>
                <Input
                  id="plate-search"
                  value={plateSearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPlateSearch(v);
                    if (!v.trim()) {
                      setSelectedVehicleId('');
                      return;
                    }
                    const sel = vehicles.find((x) => x.id === selectedVehicleId);
                    if (sel && normalizePlate(v) !== normalizePlate(sel.plate_number)) {
                      setSelectedVehicleId('');
                    }
                  }}
                  placeholder="הקלד מספר רישוי או חפש"
                  className="text-base"
                  dir="ltr"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  אפשר לבחור מהרשימה או להזין רישוי זהה לרכב קיים (ללא רווחים ומקפים — יזוהה אוטומטית)
                </p>
              </div>

              <div className="space-y-2">
                <Label>בחירה מהרשימה</Label>
                <Select value={selectedVehicleId || undefined} onValueChange={onSelectVehicle}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="בחר רכב (אופציונלי)" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate_number} · {v.manufacturer} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {resolvedVehicle ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm space-y-1">
                  <p className="font-semibold text-slate-200">
                    {resolvedVehicle.manufacturer} {resolvedVehicle.model}
                  </p>
                  <p className="text-muted-foreground" dir="ltr">
                    רישוי: {resolvedVehicle.plate_number} · מד נוכחי במערכת:{' '}
                    {(Number(resolvedVehicle.current_odometer) || 0).toLocaleString()} ק&quot;מ
                  </p>
                  <p className="text-muted-foreground" dir="ltr">
                    מרווח טיפול (יצרן):{' '}
                    {resolvedVehicle.service_interval_km != null
                      ? `${resolvedVehicle.service_interval_km.toLocaleString()} ק&quot;מ`
                      : 'לא הוגדר'}
                  </p>
                </div>
              ) : plateSearch.trim() ? (
                <p className="text-sm text-amber-400/90">
                  לא נמצא רכב יחיד התואם לרישוי — בחר מהרשימה או דייק את המספר.
                </p>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="service-date">תאריך טיפול</Label>
                  <Input
                    id="service-date"
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>תאריך טיפול הבא (אוטומטי — שנה אחת קדימה)</Label>
                  <Input readOnly value={nextServiceDate} className="h-11 bg-muted/40" dir="ltr" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mileage">קילומטראז׳ בטיפול (חייב גבוה מהמד במערכת)</Label>
                <Input
                  id="mileage"
                  type="number"
                  min={(resolvedVehicle ? Number(resolvedVehicle.current_odometer) || 0 : 0) + 1}
                  value={mileageInput}
                  onChange={(e) => setMileageInput(e.target.value)}
                  placeholder="למשל 48200"
                  dir="ltr"
                  className="h-11 text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label>ק״מ לטיפול הבא (אוטומטי)</Label>
                <Input
                  readOnly
                  value={nextServiceKm != null ? nextServiceKm.toLocaleString() : '—'}
                  className="h-11 bg-muted/40"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>צילום חשבונית / טיפול</Label>
                {android ? (
                  <>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={submitting || isMaterializing}
                      onChange={(e) => startPhotoIngest(e.target.files?.[0] ?? null, e.target)}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                      <Button
                        type="button"
                        className="h-12 flex-1 gap-2 text-base"
                        disabled={submitting || isMaterializing}
                        onClick={() => {
                          setWebcamMountKey((k) => k + 1);
                          setWebcamOpen(true);
                        }}
                      >
                        <Camera className="h-4 w-4 shrink-0" />
                        צלם מהמצלמה
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 flex-1 gap-2 text-base"
                        disabled={submitting || isMaterializing}
                        onClick={() => galleryInputRef.current?.click()}
                      >
                        <ImageIcon className="h-4 w-4 shrink-0" />
                        בחר מהגלריה
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
                      className="hidden"
                      disabled={submitting || isMaterializing}
                      onChange={(e) => startPhotoIngest(e.target.files?.[0] ?? null, e.target)}
                      aria-hidden
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 w-full gap-2 text-base"
                      disabled={submitting || isMaterializing}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="ml-2 h-4 w-4" />
                      מצלמה / גלריה
                    </Button>
                  </>
                )}

                {photoPreviewUrl ? (
                  <div className="space-y-3 pt-2">
                    <img
                      key={previewMountKey}
                      src={photoPreviewUrl}
                      alt="תצוגה מקדימה"
                      className="max-h-56 w-full rounded-lg border border-white/10 object-contain bg-black"
                      decoding="async"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full gap-2"
                      onClick={clearPhoto}
                      disabled={submitting || isMaterializing}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      מחק תמונה
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={submitting || !resolvedVehicle || !photoFile || isMaterializing}>
                  {submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                  שמור ושלח
                </Button>
                <Link to="/vehicles" className="flex-1">
                  <Button type="button" variant="outline" className="w-full">
                    ביטול
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {android ? (
        <WebcamCapture
          key={webcamMountKey}
          open={webcamOpen}
          onOpenChange={setWebcamOpen}
          onCapture={(f) => {
            setWebcamOpen(false);
            startPhotoIngest(f, null);
          }}
          disabled={submitting || isMaterializing}
        />
      ) : null}
    </div>
  );
}
