import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PhotoUpload from '@/components/PhotoUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invokeSupabaseEdgeFunctionDirect } from '@/lib/supabase/invokeEdgeFunction';

type VehicleRenewalVehicle = {
  plate_number: string | null;
  manufacturer: string | null;
  model: string | null;
  test_expiry: string | null;
  insurance_expiry: string | null;
};

type PublicItem = {
  task_key: string;
  task_label: string;
  due_date: string | null;
  status: string;
  vehicle: VehicleRenewalVehicle;
};

async function compressImageDataUrl(dataUrl: string, maxSide = 1800, quality = 0.82): Promise<string> {
  if (!dataUrl.startsWith('data:image')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w <= 0 || h <= 0) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    r.readAsDataURL(file);
  });
}

function fmtDate(raw: string | null): string {
  if (!raw?.trim()) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return d.toLocaleDateString('he-IL', { timeZone: 'UTC' });
  } catch {
    return raw;
  }
}

async function edgeInvokeFriendlyMessage(invokeErr: unknown): Promise<string> {
  const base = invokeErr instanceof Error ? invokeErr.message : '';
  const ctx = (invokeErr as { context?: Response } | undefined)?.context;
  if (ctx?.clone) {
    try {
      const j = await ctx.clone().json();
      if (j && typeof j === 'object') {
        const e = (j as { error?: unknown }).error;
        if (typeof e === 'string' && e.trim()) return e.trim();
      }
    } catch {
      try {
        const t = await ctx.clone().text();
        if (t?.trim()) return t.trim().slice(0, 500);
      } catch {
        /* ignore */
      }
    }
  }
  return base.trim() || 'פעולת השרת נכשלה';
}

export default function VehicleExternalRenewalPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<PublicItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [expiryYmd, setExpiryYmd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const tokenPreview = useMemo(() => {
    const t = String(token ?? '').trim();
    if (t.length <= 10) return t;
    return `${t.slice(0, 6)}…${t.slice(-4)}`;
  }, [token]);

  useEffect(() => {
    document.title = 'עדכון רישוי / ביטוח';
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const safeToken = String(token ?? '').trim();
      if (!safeToken) {
        setError('קישור לא תקין');
        setLoading(false);
        return;
      }
      try {
        const { data, error: invokeErr } = await invokeSupabaseEdgeFunctionDirect('public-vehicle-renewal-request', {
          token: safeToken,
        });
        if (cancelled) return;
        if (invokeErr) throw new Error(await edgeInvokeFriendlyMessage(invokeErr));
        const d = data as { success?: boolean; item?: PublicItem; error?: string } | null;
        if (d?.error) throw new Error(d.error);
        if (!d?.item) throw new Error('תשובה ריקה מהשרת');
        setItem(d.item);
        if (d.item.status === 'pending_admin_review') {
          setDone(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onPhoto = (file: File | null) => setPhotoFile(file);

  const submit = async () => {
    if (!item || !token) return;
    if (item.status === 'pending_admin_review') return;
    setError(null);
    if (!photoFile) {
      setError('נא לצלם או להעלות תמונת מסמך ברורה.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryYmd.trim())) {
      setError('נא לבחור תאריך תוקף חדש (פורמט YYYY-MM-DD).');
      return;
    }
    setSubmitting(true);
    try {
      let dataUrl = await fileToDataUrl(photoFile);
      dataUrl = await compressImageDataUrl(dataUrl, 2000, 0.8);
      const { data, error: invokeErr } = await invokeSupabaseEdgeFunctionDirect('public-vehicle-renewal-submit', {
        token: String(token).trim(),
        document_image_data_url: dataUrl,
        proposed_expiry: expiryYmd.trim(),
      });
      const resp = data as { success?: boolean; error?: string; message?: string } | null;
      if (invokeErr) throw new Error(await edgeInvokeFriendlyMessage(invokeErr));
      if (resp?.error) throw new Error(resp.error);
      if (!resp?.success) throw new Error('השליחה נכשלה');
      setDone(true);
      const safe = encodeURIComponent(String(token).trim());
      navigate(`/vehicle-renewal/${safe}?submitted=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const v = item?.vehicle;

  return (
    <main dir="rtl" className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-right shadow-xl">
        <h1 className="text-xl font-bold text-white">
          {done ? 'הוגש בהצלחה' : 'עדכון מסמך רכב (ליסינג)'}
        </h1>
        <p className="mt-2 text-xs text-slate-400">מזהה קישור: {tokenPreview}</p>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : error && !item ? (
          <p className="mt-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
        ) : done ? (
          <div className="mt-6 space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm leading-relaxed text-emerald-50">
            <p className="font-semibold">
              {item?.status === 'pending_admin_review'
                ? 'המסמך כבר הוגש קודם והמערכת ממתינה לאישור מנהל.'
                : 'המסמך נשלח. המערכת ממתינה לאישור מנהל בארגון לפני שהתאריך והקובץ יעודכנו בכרטיס הרכב.'}
            </p>
            <p className="text-emerald-100/90">לאחר האישור יישלח עדכון גם לנהג במידה ושוייך רכב.</p>
          </div>
        ) : item ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-cyan-400/20 bg-slate-950/60 p-3 text-sm text-slate-200">
              <p className="text-xs text-slate-400">נושא</p>
              <p className="font-semibold text-white">{item.task_label}</p>
              <p className="mt-2 text-xs text-slate-400">רכב</p>
              <p>
                {v?.plate_number ?? '—'} · {v?.manufacturer ?? ''} {v?.model ?? ''}
              </p>
              <p className="mt-1 text-xs">
                תוקף טסט במערכת: <span dir="ltr">{fmtDate(v?.test_expiry ?? null)}</span>
              </p>
              <p className="text-xs">
                תוקף ביטוח במערכת: <span dir="ltr">{fmtDate(v?.insurance_expiry ?? null)}</span>
              </p>
              {item.due_date ? (
                <p className="mt-1 text-xs text-amber-200/90">
                  תאריך יעד בבקשה: <span dir="ltr">{fmtDate(item.due_date)}</span>
                </p>
              ) : null}
            </div>

            {error ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>
            ) : null}

            <div className="space-y-2">
              <Label className="text-slate-200">תאריך תוקף חדש (חובה)</Label>
              <Input
                type="date"
                className="border-white/20 bg-black/40 text-white"
                value={expiryYmd}
                onChange={(e) => setExpiryYmd(e.target.value)}
                dir="ltr"
              />
            </div>

            <div className="[&_.border-border]:border-white/25">
              <PhotoUpload
                label="צילום רישיון / פוליסת ביטוח — מצלמה או גלריה"
                onPhotoCapture={onPhoto}
                disabled={submitting}
              />
            </div>

            <Button type="button" className="w-full" onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח…
                </span>
              ) : (
                'שליחה לאישור מנהל'
              )}
            </Button>
          </div>
        ) : null}

        {!loading && item && !done ? (
          <p className="mt-4 text-[11px] text-slate-500">
            אם יש בעיה בהעלאה, צמצמו את גודל התמונה או פנו למחלקת הרכב.
          </p>
        ) : null}
      </section>
    </main>
  );
}
