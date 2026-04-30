import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PublicRequestItem = {
  driver_id: string | null;
  driver_name: string | null;
  driver_email: string | null;
  task_key: string;
  task_label: string;
  status: string;
  due_date: string | null;
  request_url: string;
};

export default function UpdateComplianceRequestPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [item, setItem] = useState<PublicRequestItem | null>(null);
  const [licenseDataUrl, setLicenseDataUrl] = useState<string>('');
  const sigRef = useRef<SignatureCanvas | null>(null);

  const tokenPreview = useMemo(() => {
    const t = String(token ?? '').trim();
    if (!t) return 'missing token';
    if (t.length <= 10) return t;
    return `${t.slice(0, 6)}...${t.slice(-4)}`;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const safeToken = String(token ?? '').trim();
      if (!safeToken) {
        setError('Invalid link token');
        setLoading(false);
        return;
      }

      try {
        const { data, error: invokeErr } = await invokeSupabaseEdgeFunction('public-compliance-request', {
          token: safeToken,
        });
        if (invokeErr) throw new Error(invokeErr.message ?? 'Failed to fetch request');
        const payload = data as { item?: PublicRequestItem; error?: string } | null;
        if (!payload?.item) {
          throw new Error(payload?.error || 'Request not found');
        }
        if (!cancelled) setItem(payload.item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onLicensePick = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const out = typeof reader.result === 'string' ? reader.result : '';
      setLicenseDataUrl(out);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!item || !token) return;
    setError(null);
    setSubmitMessage(null);

    const taskKey = String(item.task_key || '').trim();
    if (taskKey === 'health_declaration') {
      if (!sigRef.current || sigRef.current.isEmpty()) {
        setError('Please provide your signature before submitting.');
        return;
      }
    } else if (taskKey === 'driver_license') {
      if (!licenseDataUrl) {
        setError('Please upload a license photo before submitting.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        token,
        task_key: taskKey,
      };
      if (taskKey === 'health_declaration') {
        payload.health_signature_data_url = sigRef.current?.getTrimmedCanvas().toDataURL('image/png');
      }
      if (taskKey === 'driver_license') {
        payload.license_image_data_url = licenseDataUrl;
      }
      const { data, error: invokeErr } = await invokeSupabaseEdgeFunction('public-compliance-submit', payload);
      if (invokeErr) throw new Error(invokeErr.message ?? 'Submit failed');
      const response = data as { message?: string; error?: string } | null;
      if (response?.error) throw new Error(response.error);
      setSubmitMessage(response?.message ?? 'Thank you, your record has been updated!');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-right shadow-xl">
        <h1 className="text-xl font-bold text-white">Compliance Update Request</h1>
        <p className="mt-2 text-xs text-slate-400">Link ID: {tokenPreview}</p>

        {loading ? (
          <div className="mt-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          </div>
        ) : error ? (
          <p className="mt-6 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-cyan-400/20 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Driver</p>
              <p className="text-base font-semibold text-white">{item?.driver_name || 'Driver'}</p>
              {item?.driver_email ? <p className="text-xs text-slate-300">{item.driver_email}</p> : null}
            </div>

            <div className="rounded-lg border border-amber-300/20 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">Task</p>
              <p className="text-base font-semibold text-white">{item?.task_label || 'Update Required Document'}</p>
              {item?.due_date ? <p className="text-xs text-slate-300">Due date: {item.due_date}</p> : null}
            </div>

            {!done && item?.task_key === 'health_declaration' ? (
              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3 space-y-2">
                <p className="text-sm text-slate-200">
                  I declare that my health condition allows safe driving and that I will report any change immediately.
                </p>
                <div className="rounded-md border border-cyan-300/20 bg-white">
                  <SignatureCanvas
                    ref={(r) => {
                      sigRef.current = r;
                    }}
                    penColor="black"
                    canvasProps={{ className: 'w-full h-40' }}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => sigRef.current?.clear()}>
                  נקה חתימה
                </Button>
              </div>
            ) : null}

            {!done && item?.task_key === 'driver_license' ? (
              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3 space-y-2">
                <p className="text-sm text-slate-200">נא לצלם או להעלות תמונת רישיון עדכנית.</p>
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onLicensePick(e.target.files?.[0] ?? null)}
                />
                {licenseDataUrl ? (
                  <img src={licenseDataUrl} alt="license preview" className="h-40 w-full rounded-md object-contain bg-black/30" />
                ) : null}
              </div>
            ) : null}

            {!done ? (
              <Button type="button" className="w-full" onClick={submit} disabled={submitting}>
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    שולח עדכון...
                  </span>
                ) : (
                  'שלח עדכון'
                )}
              </Button>
            ) : (
              <p className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {submitMessage ?? 'Thank you, your record has been updated!'}
              </p>
            )}
          </div>
        )}

        <div className="mt-6">
          <Link to="/" className="text-sm text-cyan-300 hover:text-cyan-200">
            חזרה למסך הראשי
          </Link>
        </div>
      </section>
    </main>
  );
}
