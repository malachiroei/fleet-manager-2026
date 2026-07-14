/**
 * Public Procedure 6 driver response — /procedure6/respond/:token
 * Uses direct fetch (same pattern as vehicle-renewal public forms) so real
 * Edge Function error bodies are shown instead of "non-2xx".
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { invokeSupabaseEdgeFunctionDirect } from '@/lib/supabase/invokeEdgeFunction';

type PublicComplaint = {
  vehicle_number: string;
  location: string | null;
  description: string | null;
  report_date_time: string | null;
  report_type: string | null;
  driver_name: string | null;
  driver_response?: string | null;
  status?: string;
};

function formatDt(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return raw;
  }
}

export default function Procedure6RespondPage() {
  const { token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [complaint, setComplaint] = useState<PublicComplaint | null>(null);
  const [driverResponse, setDriverResponse] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: invErr } = await invokeSupabaseEdgeFunctionDirect(
          'public-procedure6-request',
          { token },
        );
        if (cancelled) return;
        const payload = data as {
          ok?: boolean;
          closed?: boolean;
          complaint?: PublicComplaint;
          error?: string;
        } | null;
        if (invErr) {
          setError(invErr.message || payload?.error || 'שגיאה בטעינת הפנייה');
          setComplaint(null);
          return;
        }
        if (!payload?.ok || !payload?.complaint) {
          setError(payload?.error || 'הקישור אינו תקף');
          setComplaint(null);
          return;
        }
        setComplaint(payload.complaint);
        if (payload.closed) {
          setAlreadyClosed(true);
          setDriverResponse(payload.complaint.driver_response ?? '');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה בטעינה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    if (!driverResponse.trim()) {
      setError('נא למלא את תגובת הנהג');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: invErr } = await invokeSupabaseEdgeFunctionDirect(
        'public-procedure6-submit',
        {
          token,
          driver_response: driverResponse.trim(),
        },
      );
      const payload = data as { ok?: boolean; error?: string; status?: string } | null;
      if (invErr) {
        setError(invErr.message || payload?.error || 'שליחה נכשלה');
        return;
      }
      if (!payload?.ok) {
        setError(payload?.error || 'שליחה נכשלה');
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליחה נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 px-4 py-8 text-slate-900" dir="rtl">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h1 className="text-xl font-bold">תגובה לפנייה — נוהל 6</h1>
          <p className="mt-1 text-sm text-slate-600">יש למלא את תגובתך לאירוע. אין צורך בהתחברות למערכת.</p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען פנייה…
          </div>
        ) : error && !complaint ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800">
            {error}
          </div>
        ) : done ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-emerald-900">
            <p className="text-lg font-semibold">התגובה נשלחה בהצלחה</p>
            <p className="mt-2 text-sm">תודה. הצוות עודכן ויוכל להמשיך בטיפול.</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {alreadyClosed ? (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
                פנייה זו כבר נסגרה. התגובה שנשמרה מוצגת למטה לקריאה בלבד.
              </div>
            ) : null}

            {complaint ? (
              <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <h2 className="mb-3 text-base font-bold">פרטי הדיווח</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">דיווח על רכב מספר</dt>
                    <dd className="font-medium tabular-nums">{complaint.vehicle_number}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">סוג הדיווח</dt>
                    <dd className="font-medium">{complaint.report_type || 'תלונה'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">מיקום האירוע</dt>
                    <dd className="font-medium text-left">{complaint.location || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">מועד האירוע</dt>
                    <dd className="font-medium tabular-nums">{formatDt(complaint.report_date_time)}</dd>
                  </div>
                  {complaint.driver_name ? (
                    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                      <dt className="text-slate-500">נהג</dt>
                      <dd className="font-medium">{complaint.driver_name}</dd>
                    </div>
                  ) : null}
                  <div className="pt-2">
                    <dt className="mb-1 text-slate-500">תיאור האירוע</dt>
                    <dd className="leading-relaxed text-slate-800">{complaint.description || '—'}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <form
              onSubmit={onSubmit}
              className="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
            >
              <div className="space-y-2">
                <Label htmlFor="driver_response">כתוב את תגובתך לאירוע</Label>
                <Textarea
                  id="driver_response"
                  rows={5}
                  value={driverResponse}
                  onChange={(e) => setDriverResponse(e.target.value)}
                  disabled={alreadyClosed}
                  required={!alreadyClosed}
                  className="bg-white"
                  placeholder="פרט את גרסתך לאירוע…"
                />
              </div>
              {!alreadyClosed ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="min-w-[160px] bg-emerald-600 px-8 py-5 text-base font-bold text-white hover:bg-emerald-500"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שלח תגובה'}
                  </Button>
                </div>
              ) : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
