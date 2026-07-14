/**
 * Manager quick actions from Procedure 6 staff email —
 * /procedure6/admin-action/:token[?action=close|clarify]
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { invokeSupabaseEdgeFunctionDirect } from '@/lib/supabase/invokeEdgeFunction';
import { cn } from '@/lib/utils';

type AdminComplaint = {
  vehicle_number: string;
  report_type: string | null;
  location: string | null;
  description: string | null;
  report_date_time: string | null;
  driver_name: string | null;
  driver_response: string | null;
  action_taken: string | null;
  status: string;
  reporter_name?: string | null;
  has_driver_email?: boolean;
};

const ACTION_OPTIONS = [
  'טופל',
  'הוזהר',
  'הועבר להמשך טיפול',
  'אין ממצא',
  'אחר',
] as const;

function formatDt(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('he-IL');
  } catch {
    return raw;
  }
}

function statusLabel(s: string): string {
  if (s === 'closed') return 'סגור';
  if (s === 'in_progress') return 'בטיפול';
  return 'פתוח';
}

export default function Procedure6AdminActionPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const initialMode = params.get('action') === 'clarify' ? 'clarify' : 'close';

  const [mode, setMode] = useState<'close' | 'clarify'>(initialMode);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [complaint, setComplaint] = useState<AdminComplaint | null>(null);
  const [actionTaken, setActionTaken] = useState<string>('טופל');
  const [clarification, setClarification] = useState('');
  const [driverEmail, setDriverEmail] = useState('');

  useEffect(() => {
    setMode(params.get('action') === 'clarify' ? 'clarify' : 'close');
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: invErr } = await invokeSupabaseEdgeFunctionDirect(
          'public-procedure6-admin-request',
          { token },
        );
        if (cancelled) return;
        const payload = data as {
          ok?: boolean;
          closed?: boolean;
          complaint?: AdminComplaint;
          error?: string;
        } | null;
        if (invErr) {
          setError(invErr.message || payload?.error || 'שגיאה בטעינה');
          return;
        }
        if (!payload?.ok || !payload.complaint) {
          setError(payload?.error || 'הקישור אינו תקף');
          return;
        }
        setComplaint(payload.complaint);
        setAlreadyClosed(Boolean(payload.closed));
        if (payload.complaint.action_taken) {
          setActionTaken(payload.complaint.action_taken);
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

  const onClose = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: invErr } = await invokeSupabaseEdgeFunctionDirect(
        'public-procedure6-admin-close',
        { token, action_taken: actionTaken },
      );
      const payload = data as { ok?: boolean; error?: string } | null;
      if (invErr) {
        setError(invErr.message || payload?.error || 'סגירה נכשלה');
        return;
      }
      if (!payload?.ok) {
        setError(payload?.error || 'סגירה נכשלה');
        return;
      }
      setDone('התלונה נסגרה בהצלחה. נשלח מייל סיכום לצוות.');
      setAlreadyClosed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'סגירה נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  const onClarify = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    if (!clarification.trim()) {
      setError('נא לכתוב שאלה או בקשת הבהרה');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        token,
        clarification: clarification.trim(),
      };
      if (driverEmail.trim()) body.driver_email = driverEmail.trim();

      const { data, error: invErr } = await invokeSupabaseEdgeFunctionDirect(
        'send-procedure6-clarification-request',
        body,
      );
      const payload = data as {
        ok?: boolean;
        error?: string;
        needs_email?: boolean;
        emailed?: string;
      } | null;
      if (invErr) {
        setError(invErr.message || payload?.error || 'שליחה נכשלה');
        return;
      }
      if (!payload?.ok) {
        setError(payload?.error || 'שליחה נכשלה');
        return;
      }
      setDone(
        payload.emailed
          ? `נשלחה בקשת הבהרה לנהג (${payload.emailed}). הסטטוס חזר ל״פתוח״.`
          : 'נשלחה בקשת הבהרה לנהג. הסטטוס חזר ל״פתוח״.',
      );
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
          <h1 className="text-xl font-bold">טיפול מהיר — נוהל 6</h1>
          <p className="mt-1 text-sm text-slate-600">סגירת תלונה או בקשת הבהרה מהנהג, ישירות מהמייל.</p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען…
          </div>
        ) : error && !complaint ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800">
            {error}
          </div>
        ) : done ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-emerald-900">
            <p className="text-lg font-semibold">{done}</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {complaint ? (
              <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">פרטי התלונה</h2>
                  <span className="text-xs font-semibold text-slate-500">
                    {statusLabel(complaint.status)}
                  </span>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">רכב</dt>
                    <dd className="font-mono font-medium">{complaint.vehicle_number}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">מועד</dt>
                    <dd className="font-medium">{formatDt(complaint.report_date_time)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">מיקום</dt>
                    <dd className="font-medium">{complaint.location || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                    <dt className="text-slate-500">נהג</dt>
                    <dd className="font-medium">{complaint.driver_name || '—'}</dd>
                  </div>
                  <div className="pt-1">
                    <dt className="mb-1 text-slate-500">תיאור</dt>
                    <dd className="leading-relaxed">{complaint.description || '—'}</dd>
                  </div>
                  <div className="pt-2 rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <dt className="mb-1 text-slate-500 font-medium">תגובת הנהג</dt>
                    <dd className="leading-relaxed whitespace-pre-wrap">
                      {complaint.driver_response || '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {alreadyClosed ? (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700">
                תלונה זו כבר סגורה
                {complaint?.action_taken ? ` · פעולה שננקטה: ${complaint.action_taken}` : ''}.
              </div>
            ) : (
              <>
                <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <button
                    type="button"
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      mode === 'close' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                    onClick={() => setMode('close')}
                  >
                    סגירת התלונה
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      mode === 'clarify' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                    onClick={() => setMode('clarify')}
                  >
                    הבהרה לנהג
                  </button>
                </div>

                {mode === 'close' ? (
                  <form
                    onSubmit={onClose}
                    className="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="space-y-2">
                      <Label>הפעולה שננקטה</Label>
                      <Select value={actionTaken} onValueChange={setActionTaken}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-emerald-600 py-5 text-base font-bold hover:bg-emerald-500"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'סגור תלונה סופית'}
                    </Button>
                  </form>
                ) : (
                  <form
                    onSubmit={onClarify}
                    className="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="clarification">כתוב שאלה או בקשת הבהרה לנהג</Label>
                      <Textarea
                        id="clarification"
                        rows={4}
                        value={clarification}
                        onChange={(e) => setClarification(e.target.value)}
                        required
                        className="bg-white"
                        placeholder="למשל: האם תוכל לפרט היכן בדיוק התרחש האירוע?"
                      />
                    </div>
                    {!complaint?.has_driver_email ? (
                      <div className="space-y-2">
                        <Label htmlFor="driver_email">מייל הנהג לשליחה</Label>
                        <Input
                          id="driver_email"
                          type="email"
                          dir="ltr"
                          className="text-left bg-white"
                          value={driverEmail}
                          onChange={(e) => setDriverEmail(e.target.value)}
                          placeholder="driver@example.com"
                          required
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="driver_email_opt">מייל נהג (אופציונלי — לשינוי יעד)</Label>
                        <Input
                          id="driver_email_opt"
                          type="email"
                          dir="ltr"
                          className="text-left bg-white"
                          value={driverEmail}
                          onChange={(e) => setDriverEmail(e.target.value)}
                          placeholder="השאירו ריק לשימוש בברירת המחדל"
                        />
                      </div>
                    )}
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-sky-600 py-5 text-base font-bold hover:bg-sky-500"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שלח לנהג'}
                    </Button>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
