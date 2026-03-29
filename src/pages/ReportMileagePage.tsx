import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Gauge, Loader2, Trash2 } from 'lucide-react';

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

  const hasPhoto = Boolean(photoFile);

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
      input.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setPhotoFile(file);
    setBlobPreviewUrl(url);
    input.value = '';
  }, []);

  const clearPhoto = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPhotoFile(null);
    setBlobPreviewUrl(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  }, []);

  const openCamera = () => {
    photoInputRef.current?.click();
  };

  const submit = async (e: React.FormEvent) => {
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
      const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const path = `${selectedVehicle.id}/${id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, photoFile, { upsert: false, contentType: photoFile.type || undefined });
      if (uploadError) {
        console.error('[ReportMileagePage] storage upload failed', uploadError);
        throw uploadError;
      }

      const { data: urlData, error: urlError } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (urlError) {
        console.error('[ReportMileagePage] getPublicUrl failed', urlError);
        throw urlError;
      }
      const photoUrl = urlData?.publicUrl;
      if (!photoUrl) {
        throw new Error('Missing photoUrl from getPublicUrl');
      }

      const payload: Record<string, unknown> = {
        vehicle_id: selectedVehicle.id,
        odometer_value: odometerValue,
        photo_url: photoUrl,
        user_id: user.id,
      };

      const { error: insertError } = await supabase.from('mileage_logs').insert(payload as any);
      if (insertError) {
        console.error('[ReportMileagePage] mileage_logs insert failed', insertError);
        throw insertError;
      }

      try {
        const title = `עדכון ק"מ - ${odometerValue.toLocaleString('he-IL')} ק"מ`;

        const { error: vehicleDocError } = await supabase.from('vehicle_documents').insert({
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

      try {
        const notifyPayload = {
          to: 'malachiroei@gmail.com',
          subject: `עדכון קילומטראז' - ${selectedVehicle.plate_number}`,
          odometerReading: odometerValue,
          reportUrl: photoUrl,
        };

        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token ?? null;

        const invokeResult = await supabase.functions.invoke('send-mileage-notification', {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: notifyPayload,
        });

        const maybeError = (invokeResult as any)?.error ?? null;
        if (maybeError) {
          console.error('[send-mileage-notification] invoke returned error', maybeError);
        }
      } catch (notifyErr) {
        console.error('[send-mileage-notification] threw:', notifyErr);
      }

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
              <Button variant="ghost" size="icon" type="button">
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
                    ref={photoInputRef}
                    id="mileage-report-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                  {!hasPhoto ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-full gap-2 text-base"
                      onClick={openCamera}
                      aria-controls="mileage-report-photo"
                    >
                      <Camera className="h-5 w-5 shrink-0" />
                      צלם תמונה
                    </Button>
                  ) : null}
                  {blobPreviewUrl ? (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-xl border border-border">
                        <img
                          src={blobPreviewUrl}
                          alt="תצוגה מקדימה"
                          className="w-full h-56 object-cover bg-black"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-11 gap-2"
                        onClick={clearPhoto}
                        disabled={submitting}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        מחק תמונה
                      </Button>
                    </div>
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
