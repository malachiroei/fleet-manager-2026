import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Wrench } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import { fetchDriverEmailByDriverId } from '@/lib/sendFleetFieldUpdateNotification';
import { useAuth } from '@/hooks/useAuth';
import { isFeatureEnabled, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useVehicles, useUpdateVehicle } from '@/hooks/useVehicles';
import type { Vehicle } from '@/types/fleet';
import { toast } from '@/hooks/use-toast';
import { suggestPeriodicInspectionToast } from '@/lib/periodicInspectionSuggestions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FleetDatePicker } from '@/components/ui/FleetDatePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HudPhotoSlot } from '@/components/HudPhotoSlot';
import { normalizePlateNumber } from '@/lib/plateNumber';
import { compressImageFileForUpload } from '@/lib/mobilePhotoIngest';

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

function sanitizeFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return 'jpg';
  const ext = name.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'jpg';
}

/** טבלת audit לא קיימת / לא מסונכרנת ל-PostgREST — לא לעצור את המסמך והמייל אחרי שעדכון הרכב כבר נשמר */
function isVehicleServiceLogsSchemaOrMissingTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; message?: string };
  const code = String(o.code ?? '');
  const msg = String(o.message ?? '').toLowerCase();
  if (code === 'PGRST204' || code === 'PGRST205') return true;
  if (msg.includes('vehicle_service_logs') && (msg.includes('schema cache') || msg.includes('could not find'))) {
    return true;
  }
  if (msg.includes('relation') && msg.includes('vehicle_service_logs') && msg.includes('does not exist')) {
    return true;
  }
  return false;
}

export default function ServiceUpdatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vehicleIdFromUrl = searchParams.get('vehicle');
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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(() => vehicleIdFromUrl || undefined);
  const [serviceDate, setServiceDate] = useState(todayYmdLocal);
  const [mileageInput, setMileageInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!vehicleIdFromUrl || vehicles.length === 0) return;
    const v = vehicles.find((x) => x.id === vehicleIdFromUrl);
    if (v) {
      setSelectedVehicleId(v.id);
      setPlateSearch(v.plate_number);
    }
  }, [vehicleIdFromUrl, vehicles]);

  const filteredVehicles = useMemo(() => {
    const q = plateSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const plate = (v.plate_number ?? '').toLowerCase();
      const plateDigits = normalizePlateNumber(v.plate_number);
      const qDigits = normalizePlateNumber(q);
      const internal = (v.internal_number ?? '').toLowerCase();
      const label = `${v.manufacturer ?? ''} ${v.model ?? ''}`.toLowerCase();
      const plateDigitsMatch = qDigits.length > 0 && plateDigits.includes(qDigits);
      return plateDigitsMatch || plate.includes(q) || internal.includes(q) || label.includes(q);
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
    const n = normalizePlateNumber(raw);
    const matches = vehicles.filter((v) => normalizePlateNumber(v.plate_number) === n);
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
      let fileToUpload = photoFile;
      try {
        fileToUpload = await compressImageFileForUpload(photoFile);
      } catch (compressErr) {
        console.warn('[ServiceUpdatePage] image compress skipped', compressErr);
      }

      const ext = sanitizeFileExt(fileToUpload.name);
      const uid =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `vehicle-files/${resolvedVehicle.id}/service_invoice_${uid}.${ext}`;
      const contentType = fileToUpload.type || 'image/jpeg';

      let uploadError: { message: string; name?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const up = await supabase.storage
          .from(DOCS_BUCKET)
          .upload(path, fileToUpload, { upsert: true, contentType });
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

      let serviceAuditSkipped = false;
      const { error: serviceLogError } = await supabase.from('vehicle_service_logs' as any).insert({
        vehicle_id: resolvedVehicle.id,
        plate_number: resolvedVehicle.plate_number,
        service_type: 'service_update',
        odometer_reading: mileageNum,
        photo_url: photoUrl,
        user_id: user.id,
      } as any);
      if (serviceLogError) {
        if (isVehicleServiceLogsSchemaOrMissingTable(serviceLogError)) {
          console.warn(
            '[ServiceUpdatePage] vehicle_service_logs insert skipped (DB schema / cache). הריצו מיגרציות או NOTIFY pgrst.',
            serviceLogError,
          );
          serviceAuditSkipped = true;
        } else {
          throw serviceLogError;
        }
      }

      const { error: docErr } = await supabase.from('vehicle_documents').insert({
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
      if (docErr) {
        console.error('[ServiceUpdatePage] vehicle_documents insert', docErr);
        throw docErr;
      }

      let emailProblem: string | null = null;
      try {
        const assignedDriverEmail = await fetchDriverEmailByDriverId(resolvedVehicle.assigned_driver_id);
        const invokeResult = await invokeSupabaseEdgeFunction('send-service-update-notification', {
          orgId: resolvedVehicle.org_id,
          subject: 'עדכון טיפול',
          plateNumber: resolvedVehicle.plate_number,
          vehicleLabel,
          serviceDate,
          nextServiceDate,
          currentMileage: mileageNum,
          nextServiceKm,
          serviceIntervalKm: resolvedVehicle.service_interval_km ?? null,
          invoicePhotoUrl: photoUrl,
          assignedDriverEmail,
        });
        if (invokeResult.error) {
          console.error('[send-service-update-notification] invoke error', invokeResult.error);
          const msg = invokeResult.error.message ?? String(invokeResult.error);
          const low = msg.toLowerCase();
          const likelyNoDeployOrCors =
            low.includes('failed to send') ||
            low.includes('edge function') ||
            low.includes('cors') ||
            low.includes('preflight') ||
            low.includes('networkerror') ||
            low.includes('401') ||
            low.includes('non-2xx');
          emailProblem = likelyNoDeployOrCors
            ? `${msg} — אם 401: בפרויקט יש supabase/config.toml עם verify_jwt=false לפונקציה; הריצו שוב deploy: supabase functions deploy send-service-update-notification --project-ref <ref>. אחרת ודאו שהפונקציה פרוסה ותשובת CORS תקינה. כשהקריאה מגיעה לשרת — בדקו RESEND_API_KEY ב-Secrets.`
            : `${msg} — בדקו RESEND_API_KEY ב-Supabase (Edge Functions → Secrets) ושהפונקציה פרוסה.`;
        } else {
          const payload = invokeResult.data as { error?: string; success?: boolean } | null;
          if (payload?.error) {
            console.error('[send-service-update-notification] function body error', payload.error);
            emailProblem = String(payload.error).slice(0, 280);
          } else if (!payload || payload.success !== true) {
            emailProblem = 'תשובה לא צפויה מהשרת (לא אושרה שליחת מייל).';
          }
        }
      } catch (notifyErr) {
        console.error('[send-service-update-notification] threw', notifyErr);
        emailProblem = notifyErr instanceof Error ? notifyErr.message : 'שליחת מייל נכשלה';
      }

      queryClient.invalidateQueries({ queryKey: ['vehicle', resolvedVehicle.id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', resolvedVehicle.id] });

      toast({
        title: emailProblem ? 'הנתונים נשמרו; יש בעיה במייל' : 'הטיפול נשמר והעדכון נשלח במייל',
        description: emailProblem
          ? `${emailProblem} | הטיפול והמסמך נשמרו במערכת.`
          : 'הרכב עודכן, המסמך נשמר בלשונית מסמכים ונשלחה הודעה לתיבת הניטור.',
        variant: emailProblem ? 'destructive' : 'default',
      });
      navigate(`/vehicles/${resolvedVehicle.id}`);
      queueMicrotask(() =>
        suggestPeriodicInspectionToast({
          vehicleId: resolvedVehicle.id,
          mode: 'service',
          onVehicleDetailPage: true,
        }),
      );
    } catch (err: unknown) {
      console.error('[ServiceUpdatePage] submit failed', err);
      const raw = err instanceof Error ? err.message : 'נסו שוב';
      const low = raw.toLowerCase();
      const hint =
        low.includes('failed to fetch') || low.includes('network') || low.includes('http2')
          ? ' (רשת: נסו שוב, בדקו חיבור/VPN, או צילום קטן יותר — התמונה מכווצת אוטומטית לפני העלאה.)'
          : '';
      toast({ title: 'שגיאה בשמירה', description: `${raw}${hint}`, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || flagsPending || !serviceUpdateAllowed) {
    return (
      <div className="fleet-screen-page text-white flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="fleet-screen-page text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
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
                      setSelectedVehicleId(undefined);
                      return;
                    }
                    const sel = vehicles.find((x) => x.id === selectedVehicleId);
                    if (sel && normalizePlateNumber(v) !== normalizePlateNumber(sel.plate_number)) {
                      setSelectedVehicleId(undefined);
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
                <Select value={selectedVehicleId} onValueChange={onSelectVehicle}>
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
                  <FleetDatePicker
                    id="service-date"
                    label="תאריך טיפול"
                    className="[&_input]:h-11"
                    value={serviceDate}
                    onChange={setServiceDate}
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
                <HudPhotoSlot
                  file={photoFile}
                  onFileChange={setPhotoFile}
                  subtitle="חשבונית / טפסי טיפול"
                  imageAlt="חשבונית או טפסי טיפול"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={submitting || !resolvedVehicle || !photoFile}
                >
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
