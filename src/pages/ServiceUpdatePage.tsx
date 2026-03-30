import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Camera, Loader2, Trash2, Wrench } from 'lucide-react';

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!file) {
      setPhotoFile(null);
      setBlobPreviewUrl(null);
      toast({ title: 'לא התקבלה תמונה', variant: 'destructive' });
      input.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setPhotoFile(file);
    setBlobPreviewUrl(url);
    toast({
      title: 'התמונה נקלטה',
      description: `${Math.round(file.size / 1024).toLocaleString()} KB${file.type ? ` · ${file.type}` : ''}`,
    });
    input.value = '';
  }, []);

  const clearPhoto = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPhotoFile(null);
    setBlobPreviewUrl(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, []);

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
        const notifyBody = {
          subject: 'עדכון טיפול',
          plateNumber: resolvedVehicle.plate_number,
          vehicleLabel,
          serviceDate,
          nextServiceDate,
          currentMileage: mileageNum,
          nextServiceKm,
          serviceIntervalKm: resolvedVehicle.service_interval_km,
          invoicePhotoUrl: photoUrl,
        };
        const invokeResult = await supabase.functions.invoke('send-service-update-notification', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: notifyBody,
        });
        if (invokeResult.error) {
          console.error('[send-service-update-notification]', invokeResult.error);
        }
      } catch (notifyErr) {
        console.error('[send-service-update-notification] threw', notifyErr);
      }

      queryClient.invalidateQueries({ queryKey: ['vehicle', resolvedVehicle.id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', resolvedVehicle.id] });

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
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => photoInputRef.current?.click()}>
                    <Camera className="ml-2 h-4 w-4" />
                    מצלמה / גלריה
                  </Button>
                  {photoFile ? (
                    <Button type="button" variant="outline" onClick={clearPhoto}>
                      <Trash2 className="ml-2 h-4 w-4" />
                      מחק תמונה
                    </Button>
                  ) : null}
                </div>
                {blobPreviewUrl ? (
                  <img
                    src={blobPreviewUrl}
                    alt="תצוגה מקדימה"
                    className="mt-2 max-h-56 rounded-lg border border-white/10 object-contain"
                  />
                ) : null}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={submitting || !resolvedVehicle}>
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
    </div>
  );
}
