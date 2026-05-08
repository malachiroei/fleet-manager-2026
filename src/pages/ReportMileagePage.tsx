import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Gauge, Loader2, Wrench } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import { getSupabaseAnonKey } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HudPhotoSlot } from '@/components/HudPhotoSlot';

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

async function friendlyEdgeInvokeError(err: unknown): Promise<string> {
  const base = err instanceof Error ? err.message : String(err);
  const ctx = (err as { context?: Response } | undefined)?.context;
  if (ctx) {
    try {
      const j = (await ctx.clone().json()) as { error?: string; message?: string };
      const msg = String(j?.error ?? j?.message ?? '').trim();
      if (msg) return msg;
    } catch {
      try {
        const t = (await ctx.clone().text()).trim();
        if (t) return t.slice(0, 500);
      } catch {
        // ignore
      }
    }
  }
  const low = base.toLowerCase();
  if (low.includes('404')) {
    return 'פונקציית השרת submit-mileage-report לא פרוסה בפרויקט Supabase (Edge Functions). יש לפרוס אותה ואז לרענן.';
  }
  if (low.includes('401') || low.includes('jwt') || low.includes('unauthorized')) {
    return 'השרת דחה את הבקשה (401). נסו להתנתק ולהתחבר מחדש; אם ממשיך — בדקו שה־Edge Functions מקבל Authorization תקין.';
  }
  return base;
}

async function invokeEdgeAuthOnly(functionName: string, body: Record<string, unknown>) {
  // נסיון ריענון סשן לפני invoke (בפרו יש מקרים של טוקן ישן בדפדפן)
  try {
    await supabase.auth.refreshSession();
  } catch {
    // ignore
  }
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token ?? '';
  if (!accessToken) {
    return { data: null as unknown, error: new Error('החיבור פג תוקף — נא להתנתק ולהתחבר מחדש ואז לנסות שוב.') };
  }
  const res = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      // apikey נדרש בחלק מהפרויקטים גם עם JWT
      ...(getSupabaseAnonKey() ? { apikey: getSupabaseAnonKey() } : {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  // אם קיבלנו 401, ננסה ריענון נוסף פעם אחת (טוקן שהתיישן בין getSession ל-invoke)
  const ctx = (res.error as unknown as { context?: Response } | undefined)?.context;
  if (res.error && ctx && ctx.status === 401) {
    try {
      await supabase.auth.refreshSession();
      const { data: data2 } = await supabase.auth.getSession();
      const token2 = data2?.session?.access_token ?? '';
      if (!token2) return res;
      return await supabase.functions.invoke(functionName, {
        body,
        headers: {
          ...(getSupabaseAnonKey() ? { apikey: getSupabaseAnonKey() } : {}),
          Authorization: `Bearer ${token2}`,
        },
      });
    } catch {
      return res;
    }
  }
  return res;
}

/** Prod drift: old RPC/trigger used column `odometer`; table column is `odometer_value`. */
function describeMileageSchemaMismatch(raw: string | undefined): string | null {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('odometer') && t.includes('does not exist') && t.includes('mileage_logs')) {
    return 'במסד הפרו הפונקציה submit_mileage_report (או טריגר) מפנה לעמודה odometer — בטבלה השם הנכון הוא odometer_value. הריצו את המיגרציה האחרונה (20260408100000) ב-Supabase.';
  }
  return null;
}

/** PostgREST 403 / PG 42501: role authenticated ללא EXECUTE על ה-RPC. */
function describeMileageRpcForbidden(msg?: string, code?: string): string | null {
  const blob = `${msg ?? ''} ${code ?? ''}`.toLowerCase();
  if (
    blob.includes('forbidden') ||
    blob.includes('403') ||
    blob.includes('42501') ||
    blob.includes('permission denied')
  ) {
    return 'השרת דחה את submit_mileage_report (Forbidden / חסר הרשאה). בפרו: הריצו GRANT EXECUTE ON FUNCTION public.submit_mileage_report(uuid, numeric, text) TO authenticated; ורעננו schema ב-API (או NOTIFY pgrst). ודאו שמחוברים כמשתמש רשום.';
  }
  return null;
}

/** PGRST202 / schema cache — הפונקציה לא קיימת בפרויקט או לא נטענה ל-PostgREST. */
function isSubmitMileageReportRpcMissing(err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): boolean {
  const blob = `${err?.message ?? ''} ${err?.details ?? ''} ${err?.hint ?? ''}`.toLowerCase();
  if (err?.code === 'PGRST202') return true;
  if (blob.includes('could not find the function') && blob.includes('submit_mileage_report')) return true;
  return false;
}

function describeMileageRpcMissingOnProject(): string {
  return 'במסד Supabase של הפרויקט חסרה הפונקציה public.submit_mileage_report (או לא עודכן schema). הריצו את המיגרציות (למשל 20260409120000) או את scripts/sql/prod_submit_mileage_report_bootstrap.sql ב-SQL Editor, ואז Settings → API → Reload schema.';
}

export default function ReportMileagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vehicleIdFromQuery = (searchParams.get('vehicle') ?? '').trim();
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
  const [submitting, setSubmitting] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  /** Restore draft + detect tab recycle after camera (session flag survives reload). */
  useEffect(() => {
    if (loading) return;

    try {
      const vid = sessionStorage.getItem(MILEAGE_REPORT_SESSION.vehicleId);
      const odo = sessionStorage.getItem(MILEAGE_REPORT_SESSION.odometer);
      const vsearch = sessionStorage.getItem(MILEAGE_REPORT_SESSION.vehicleSearch);

      // כשיש ?vehicle= מהכרטיס — לא לשחזר vehicleId מ-session (מניעת דריסה / בלבול)
      if (vid && !vehicleIdFromQuery.trim()) setSelectedVehicleId(vid);
      if (odo !== null) setOdometer(odo);
      if (vsearch !== null && !vehicleIdFromQuery.trim()) setVehicleSearch(vsearch);

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
  }, [loading, vehicleIdFromQuery]);

  /** קישור מכרטיס רכב: ?vehicle=<uuid> — מיד כשהרשימה נטענת (לא תלוי sessionHydrated) */
  useEffect(() => {
    const qid = vehicleIdFromQuery.trim();
    if (!qid || vehicles.length === 0) return;
    if (!vehicles.some((v) => v.id === qid)) return;
    setSelectedVehicleId(qid);
  }, [vehicleIdFromQuery, vehicles]);

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

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    const base = !q
      ? vehicles
      : vehicles.filter((v) => {
          const plate = (v.plate_number ?? '').toLowerCase();
          const internal = (v.internal_number ?? '').toLowerCase();
          const label = `${v.manufacturer ?? ''} ${v.model ?? ''}`.toLowerCase();
          const hay = `${plate} ${internal} ${label}`.trim();
          // חיפוש מלא "לוחית + יצרן + דגם" לא נמצא כsubstring בשדה בודד — נבדוק גם טוקנים
          const tokens = q.split(/\s+/).filter(Boolean);
          const tokenMatch =
            tokens.length > 0 && tokens.every((t) => hay.includes(t) || plate.includes(t) || label.includes(t));
          return (
            plate.includes(q) ||
            internal.includes(q) ||
            label.includes(q) ||
            hay.includes(q) ||
            tokenMatch
          );
        });
    const sid = selectedVehicleId.trim();
    if (!sid) return base;
    const chosen = vehicles.find((v) => v.id === sid);
    if (!chosen || base.some((v) => v.id === sid)) return base;
    return [chosen, ...base];
  }, [vehicleSearch, vehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  /** נכנס מכרטיס רכב עם ?vehicle= — בלי בוחר רכב נפרד */
  const lockedFromVehicleCard = Boolean(
    vehicleIdFromQuery.trim() &&
      selectedVehicle &&
      selectedVehicle.id === vehicleIdFromQuery.trim(),
  );

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

      const { data: rpcRaw, error: rpcTransportError } = await supabase.rpc('submit_mileage_report', {
        vehicle_id: selectedVehicle.id,
        odometer_value: odometerValue,
        photo_url: photoUrl,
      });

      let persistedViaDirectInsert = false;
      let persistedViaEdge = false;

      if (rpcTransportError) {
        if (isSubmitMileageReportRpcMissing(rpcTransportError)) {
          console.warn(
            '[ReportMileagePage] submit_mileage_report RPC missing on project; attempting mileage_logs INSERT (RLS)',
            rpcTransportError,
          );
          const { error: directInsertError } = await supabase.from('mileage_logs').insert({
            vehicle_id: selectedVehicle.id,
            odometer_value: odometerValue,
            photo_url: photoUrl,
            user_id: user.id,
          });
          if (directInsertError) {
            logMileageLogsInsertError({
              message: directInsertError.message,
              code: directInsertError.code,
              details: (directInsertError as { details?: string }).details,
              hint: (directInsertError as { hint?: string }).hint,
            });
            console.warn('[ReportMileagePage] mileage_logs INSERT failed; attempting Edge submit-mileage-report');
            const edge = await invokeEdgeAuthOnly('submit-mileage-report', {
              vehicle_id: selectedVehicle.id,
              odometer_value: odometerValue,
              photo_url: photoUrl,
            });
            if (edge.error) {
              toast({
                title: 'שגיאה בשמירת הדיווח (מסד נתונים)',
                description: `${describeMileageRpcMissingOnProject()} גם INSERT ל-mileage_logs נכשל: ${directInsertError.message}. Edge נכשל: ${await friendlyEdgeInvokeError(edge.error)}`,
                variant: 'destructive',
              });
              return;
            }
            const edgePayload = edge.data as { ok?: boolean; error?: string } | null;
            if (edgePayload?.error || edgePayload?.ok !== true) {
              toast({
                title: 'שגיאה בשמירת הדיווח (מסד נתונים)',
                description: edgePayload?.error || 'השרת לא אישר שמירה (Edge).',
                variant: 'destructive',
              });
              return;
            }
            persistedViaEdge = true;
          } else {
            persistedViaDirectInsert = true;
          }
        } else {
          logMileageLogsInsertError({
            message: rpcTransportError.message,
            code: rpcTransportError.code,
            details: (rpcTransportError as { details?: string }).details,
            hint: (rpcTransportError as { hint?: string }).hint,
          });
          const schemaHint = describeMileageSchemaMismatch(rpcTransportError.message);
          const forbiddenHint = describeMileageRpcForbidden(
            rpcTransportError.message,
            rpcTransportError.code,
          );
          toast({
            title: 'שגיאה בשמירת הדיווח (מסד נתונים)',
            description:
              schemaHint ||
              forbiddenHint ||
              rpcTransportError.message ||
              'ודאו שמיגרציית submit_mileage_report הורצה בפרויקט Supabase (20260406100000).',
            variant: 'destructive',
          });
          return;
        }
      }

      const rpcResult = persistedViaDirectInsert
        ? ({ ok: true } as const)
        : persistedViaEdge
          ? ({ ok: true } as const)
        : (rpcRaw as { ok?: boolean; error?: string; detail?: string; log_id?: string } | null);
      if (!rpcResult?.ok) {
        const errKey = rpcResult?.error ?? 'unknown';
        console.error('[ReportMileagePage] submit_mileage_report rejected', rpcResult);
        const fallbackDetail =
          errKey === 'vehicle_forbidden'
            ? 'אין הרשאה לרכב זה — בדקו org_id / שיוך נהג.'
            : errKey === 'no_report_permission'
              ? 'אין הרשאת דיווח קילומטראז׳ בפרופיל.'
              : `${errKey}${rpcResult?.detail ? ` — ${rpcResult.detail}` : ''}`;
        const schemaHint =
          describeMileageSchemaMismatch(rpcResult?.detail) ?? describeMileageSchemaMismatch(fallbackDetail);
        const forbiddenHint =
          describeMileageRpcForbidden(rpcResult?.detail) ?? describeMileageRpcForbidden(fallbackDetail);
        toast({
          title: 'שגיאה בשמירת הדיווח (מסד נתונים)',
          description: schemaHint || forbiddenHint || fallbackDetail,
          variant: 'destructive',
        });
        return;
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

      let emailProblem: string | null = null;
      try {
        const notifyRes = await invokeSupabaseEdgeFunction('send-mileage-notification', {
          to: 'malachiroei@gmail.com',
          subject: `עדכון קילומטראז' - ${selectedVehicle.plate_number}`,
          odometerReading: odometerValue,
          reportUrl: photoUrl,
        });
        if (notifyRes.error) {
          console.error('[send-mileage-notification] invoke error', notifyRes.error);
          emailProblem = `${notifyRes.error.message} — בדקו RESEND_API_KEY ב-Supabase (Edge Functions → Secrets) ופריסת הפונקציה.`;
        } else {
          const payload = notifyRes.data as { error?: string } | null;
          if (payload?.error) {
            console.error('[send-mileage-notification] function body error', payload.error);
            emailProblem = String(payload.error).slice(0, 280);
          }
        }
      } catch (notifyErr) {
        console.error('[send-mileage-notification] threw:', notifyErr);
        emailProblem = notifyErr instanceof Error ? notifyErr.message : 'שליחת מייל נכשלה';
      }

      queryClient.invalidateQueries({ queryKey: ['vehicle', selectedVehicle.id, orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', selectedVehicle.id] });

      const savedNote = persistedViaDirectInsert
        ? ' (נשמר ישירות — מומלץ להריץ מיגרציית submit_mileage_report ב-Supabase כדי לאחד לוגיקה.)'
        : persistedViaEdge
          ? ' (נשמר דרך שרת — מומלץ להריץ מיגרציות mileage/submit_mileage_report בפרויקט Supabase.)'
        : '';

      toast({
        title: emailProblem ? 'הדיווח נשמר; יש בעיה במייל' : 'הדיווח נשמר והרכב עודכן',
        description: emailProblem
          ? `${emailProblem} | קילומטראז׳ ${odometerValue.toLocaleString('he-IL')} ק״מ במערכת.${savedNote}`
          : `קילומטראז׳ ${odometerValue.toLocaleString('he-IL')} ק״מ. מעבירים לדף הבית…${savedNote}`,
        variant: emailProblem ? 'destructive' : 'default',
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
    <FleetHudPageShell
      title="דיווח קילומטראז׳"
      subtitle={
        lockedFromVehicleCard
          ? 'הרכב נבחר מהכרטיס — הזינו קילומטראז׳ וצרפו תמונת לוח שעונים.'
          : 'בחר רכב, הזן קילומטראז׳ וצרף תמונה מהשטח.'
      }
      headerAside={
        <Link to="/vehicles/service-update" className="w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full gap-2 border-cyan-500/40 bg-white/5 font-semibold text-cyan-100 hover:bg-cyan-500/10 sm:w-auto"
          >
            <Wrench className="h-4 w-4 shrink-0" />
            עדכון טיפול
          </Button>
        </Link>
      }
    >
      <section className="dashboard-status-stage dashboard-cyber-stage mx-auto max-w-3xl space-y-6 rounded-3xl border border-cyan-400/25 p-4 pb-28 text-white sm:p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base sm:text-lg">דווח עכשיו מהשטח</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {lockedFromVehicleCard
                    ? 'הזינו קילומטראז׳ וצרפו תמונה — הרכב כבר מזוהה.'
                    : 'בחר רכב, הזן קילומטראז׳ וצורף תמונה'}
                </p>
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
                {vehicleIdFromQuery.trim() && !selectedVehicle ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    לא נמצא רכב התואם לקישור מהכרטיס. חזרו לכרטיס הרכב או בחרו רכב מהרשימה למטה.
                  </p>
                ) : null}

                {lockedFromVehicleCard ? (
                  <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 px-4 py-3 text-right">
                    <p className="text-xs font-medium text-muted-foreground">רכב לדיווח</p>
                    <p className="mt-1 text-base font-semibold text-cyan-100" dir="ltr">
                      {selectedVehicle!.plate_number} · {selectedVehicle!.manufacturer} {selectedVehicle!.model}
                    </p>
                  </div>
                ) : (
                  <>
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
                      <p className="text-xs text-muted-foreground">
                        מציג {filteredVehicles.length.toLocaleString('he-IL')} מתוך {vehicles.length.toLocaleString('he-IL')} רכבים
                        {vehicleSearch.trim() ? (
                          <>
                            {' '}
                            ·{' '}
                            <button
                              type="button"
                              className="underline underline-offset-2 hover:text-foreground"
                              onClick={() => setVehicleSearch('')}
                            >
                              נקה חיפוש
                            </button>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>בחר רכב</Label>
                      <Select
                        value={selectedVehicleId}
                        onValueChange={(next) => {
                          setSelectedVehicleId(next);
                          // ברירת מחדל: לא לנעול את הרשימה לפריט אחד אחרי בחירה
                          setVehicleSearch('');
                        }}
                      >
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
                  </>
                )}

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
                  <Label>צילום לוח השעונים <span className="text-destructive">*</span></Label>
                  <HudPhotoSlot
                    file={photoFile}
                    onFileChange={setPhotoFile}
                    imageAlt="לוח שעונים"
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 h-12 text-base"
                    disabled={submitting || !photoFile}
                  >
                    {submitting && (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    )}
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
      </section>

    </FleetHudPageShell>
  );
}
