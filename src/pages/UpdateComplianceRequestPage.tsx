import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { captureHealthDeclarationFullPage } from '@/lib/captureHealthDeclarationPage';
import { HealthDeclarationLegalContent, HealthDeclarationLegalPlain } from '@/lib/healthDeclarationLegalHe';
import { invokeSupabaseEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PhotoUpload from '@/components/PhotoUpload';

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

const THANKS_EMPLOYEE = 'תודה, הנתונים נשלחו למחלקת רכב.';

function todayLocalIsoYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addYearsToLocalYmd(baseYmd: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(baseYmd.trim());
  if (!m) return baseYmd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setFullYear(dt.getFullYear() + years);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** טקסט שגיאה מגוף תשובת Edge (במקום «non-2xx status code» גנרי) */
async function edgeInvokeFriendlyMessage(invokeErr: unknown): Promise<string> {
  const base = invokeErr instanceof Error ? invokeErr.message : '';
  const ctx = (invokeErr as { context?: Response } | undefined)?.context;
  if (ctx?.clone) {
    try {
      const j = await ctx.clone().json();
      if (j && typeof j === 'object') {
        const e = (j as { error?: unknown }).error;
        if (typeof e === 'string' && e.trim()) return e.trim();
        const m = (j as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim()) return m.trim();
      }
    } catch {
      try {
        const t = await ctx.clone().text();
        if (t?.trim()) return t.trim().slice(0, 500);
      } catch {
        /* מתעלם — גוף שגיאה לא טקסטואלי */
      }
    }
  }
  const lower = base.toLowerCase();
  if (lower.includes('non-2xx') || lower.includes('failed to fetch')) {
    return 'שגיאת רשת או שרת. נסו שוב בעוד רגע; אם הבעיה נמשכת צמצמו את גודל התמונה.';
  }
  return base.trim() || 'פעולת השרת נכשלה';
}

function errorFromInvokeData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const e = (data as { error?: unknown }).error;
  if (typeof e === 'string' && e.trim()) return e.trim();
  return null;
}

function isInvokeSuccessPayload(data: unknown): data is { success: true; error?: string } {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { success?: boolean }).success === true &&
    !(typeof (data as { error?: unknown }).error === 'string' && String((data as { error: string }).error).trim())
  );
}

/** הקטנת תמונה לפני שליחה — גוף JSON גדול עלול לגרום לכשל בשכבת הפונקציה */
async function compressImageDataUrl(dataUrl: string, maxSide = 1600, quality = 0.82): Promise<string> {
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

function formatDueUi(ymd: string | null): string {
  if (!ymd?.trim()) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
}

export default function UpdateComplianceRequestPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completedFromUrl = searchParams.get('completed') === '1';

  const [loading, setLoading] = useState(!completedFromUrl);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(completedFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(completedFromUrl ? THANKS_EMPLOYEE : null);
  const [item, setItem] = useState<PublicRequestItem | null>(null);
  const [licensePhotoFile, setLicensePhotoFile] = useState<File | null>(null);
  /** פרטים אופציונליים — יישמרו לצורך אישור מנהל ובהמשך OCR */
  const [declaredLicenseNumber, setDeclaredLicenseNumber] = useState('');
  const [declaredLicenseExpiry, setDeclaredLicenseExpiry] = useState('');
  const [declaredHealthExpiry, setDeclaredHealthExpiry] = useState('');
  const sigRef = useRef<SignatureCanvas | null>(null);
  const healthDocPrintRef = useRef<HTMLDivElement | null>(null);
  const healthExpiryPresetApplied = useRef(false);

  const tokenPreview = useMemo(() => {
    const t = String(token ?? '').trim();
    if (!t) return 'missing token';
    if (t.length <= 10) return t;
    return `${t.slice(0, 6)}…${t.slice(-4)}`;
  }, [token]);

  useEffect(() => {
    document.title = completedFromUrl ? 'העדכון נקלט' : 'עדכון מסמך נדרש';
  }, [completedFromUrl]);

  useEffect(() => {
    if (completedFromUrl) {
      setDone(true);
      setSubmitMessage(THANKS_EMPLOYEE);
      setLoading(false);
      setError(null);
    }
  }, [completedFromUrl]);

  /** תוקף ברירת־מחדל בהצהרת בריאות: 3 שנים קדימה מיום פתיחת הטופס */
  useEffect(() => {
    if (completedFromUrl) return;
    if (!item || item.task_key !== 'health_declaration') {
      healthExpiryPresetApplied.current = false;
      return;
    }
    if (healthExpiryPresetApplied.current) return;
    healthExpiryPresetApplied.current = true;
    setDeclaredHealthExpiry(addYearsToLocalYmd(todayLocalIsoYmd(), 3));
  }, [item, completedFromUrl]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (completedFromUrl) return;

      const safeToken = String(token ?? '').trim();
      if (!safeToken) {
        setError('קישור לא תקין');
        setLoading(false);
        return;
      }

      try {
        const { data, error: invokeErr } = await invokeSupabaseEdgeFunction('public-compliance-request', {
          token: safeToken,
        });
        const payload = data as { item?: PublicRequestItem; success?: boolean; error?: string } | null;
        const loadOk =
          payload &&
          payload.success === true &&
          payload.item &&
          !(typeof payload.error === 'string' && payload.error.trim());
        if (loadOk) {
          if (!cancelled) setItem(payload.item!);
        } else {
          const dataErrLoad = errorFromInvokeData(data);
          if (invokeErr) throw new Error(dataErrLoad ?? (await edgeInvokeFriendlyMessage(invokeErr)));
          const payErr =
            typeof payload?.error === 'string' && payload.error.trim().length > 0
              ? payload.error.trim()
              : null;
          if (payErr) throw new Error(payErr);
          if (!payload?.item) throw new Error('הבקשה לא נמצאה');
          if (!cancelled) setItem(payload.item);
        }
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
  }, [token, completedFromUrl]);

  const onLicensePhoto = (file: File | null) => {
    setLicensePhotoFile(file);
  };

  const submit = async () => {
    if (!item || !token) return;
    setError(null);
    setSubmitMessage(null);

    const taskKey = String(item.task_key || '').trim();
    if (taskKey === 'health_declaration') {
      if (!sigRef.current || sigRef.current.isEmpty()) {
        setError('נא לחתום בהצהרה לפני השליחה.');
        return;
      }
      if (
        declaredHealthExpiry.trim() &&
        !/^\d{4}-\d{2}-\d{2}$/.test(declaredHealthExpiry.trim())
      ) {
        setError('תאריך תוקף מעודכן (אופציונלי) חייב בפורמט YYYY-MM-DD');
        return;
      }
    } else if (taskKey === 'driver_license') {
      if (!licensePhotoFile) {
        setError('נא לצלם או להעלות תמונת רישיון ברורה לפני השליחה.');
        return;
      }
      if (
        declaredLicenseExpiry.trim() &&
        !/^\d{4}-\d{2}-\d{2}$/.test(declaredLicenseExpiry.trim())
      ) {
        setError('תאריך תוקף אופציונלי חייב בפורמט YYYY-MM-DD (למשל 2030-01-15)');
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
        const sigDataUrl = sigRef.current?.getTrimmedCanvas().toDataURL('image/png') ?? '';
        const printRoot = healthDocPrintRef.current;
        if (!printRoot) {
          throw new Error('מסמך ההצהרה לא נטען — רענן את הדף ונסה שוב.');
        }
        let docDataUrl = await captureHealthDeclarationFullPage(printRoot, sigDataUrl);
        docDataUrl = await compressImageDataUrl(docDataUrl, 1800, 0.82);
        payload.health_declaration_document_data_url = docDataUrl;
        payload.health_signature_data_url = sigDataUrl;
        if (declaredHealthExpiry.trim()) {
          payload.declared_health_expiry = declaredHealthExpiry.trim();
        }
      }
      if (taskKey === 'driver_license') {
        let dataUrl = await fileToDataUrl(licensePhotoFile!);
        dataUrl = await compressImageDataUrl(dataUrl);
        if (JSON.stringify({ ...payload, license_image_data_url: dataUrl }).length > 5_500_000) {
          const again = await fileToDataUrl(licensePhotoFile!);
          dataUrl = await compressImageDataUrl(again, 1200, 0.72);
        }
        payload.license_image_data_url = dataUrl;
        if (declaredLicenseNumber.trim()) {
          payload.declared_license_number = declaredLicenseNumber.trim();
        }
        if (declaredLicenseExpiry.trim()) {
          payload.declared_license_expiry = declaredLicenseExpiry.trim();
        }
      }
      const { data, error: invokeErr } = await invokeSupabaseEdgeFunction('public-compliance-submit', payload);

      const safeTokenSubmit = encodeURIComponent(String(token ?? '').trim());
      const markDoneNavigate = () => {
        setSubmitMessage(THANKS_EMPLOYEE);
        setDone(true);
        navigate(`/update/${safeTokenSubmit}?completed=1`, { replace: true });
      };

      if (isInvokeSuccessPayload(data)) {
        markDoneNavigate();
        return;
      }

      const dataErrSubmit = errorFromInvokeData(data);
      if (invokeErr) throw new Error(dataErrSubmit ?? (await edgeInvokeFriendlyMessage(invokeErr)));
      const response = data as { message?: string; error?: string } | null;
      if (response?.error) throw new Error(response.error);
      markDoneNavigate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const dueFmt = formatDueUi(item?.due_date ?? null);
  const showSuccessOnly = completedFromUrl || done;

  return (
    <main dir="rtl" className="min-h-screen bg-background px-4 py-6">
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-right shadow-xl">
        <h1 className="text-xl font-bold text-white">
          {showSuccessOnly ? 'העדכון נקלט' : 'עדכון מסמך נדרש'}
        </h1>
        <p className="mt-2 text-xs text-slate-400">מזהה קישור: {tokenPreview}</p>

        {loading && !completedFromUrl ? (
          <div className="mt-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          </div>
        ) : showSuccessOnly ? (
          <div className="mt-6 space-y-3 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-5 text-sm leading-relaxed text-emerald-100">
            <p className="text-base font-semibold text-emerald-50">נקלט בהצלחה</p>
            <p>{submitMessage ?? THANKS_EMPLOYEE}</p>
          </div>
        ) : error ? (
          <p className="mt-6 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-cyan-400/20 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">נהג</p>
              <p className="text-base font-semibold text-white">{item?.driver_name || '—'}</p>
              {item?.driver_email ? <p className="text-xs text-slate-300">{item.driver_email}</p> : null}
            </div>

            <div className="rounded-lg border border-amber-300/20 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">נושא</p>
              <p className="text-base font-semibold text-white">{item?.task_label || 'עדכון נדרש'}</p>
              {dueFmt ? (
                <p className="mt-1 text-sm text-slate-200">
                  <span className="text-slate-400">תוקף במערכת: </span>
                  {dueFmt}
                </p>
              ) : null}
            </div>

            {!done && item?.task_key === 'health_declaration' ? (
              <>
                <div
                  ref={healthDocPrintRef}
                  data-health-print-root
                  aria-hidden
                  dir="rtl"
                  style={{
                    position: 'fixed',
                    left: -12000,
                    top: 0,
                    zIndex: 0,
                    width: 794,
                    maxWidth: 794,
                    padding: 32,
                    pointerEvents: 'none',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    fontFamily: "'Segoe UI','Noto Sans Hebrew','Arial Hebrew',Tahoma,Arial,sans-serif",
                  }}
                >
                  <HealthDeclarationLegalPlain driverName={item?.driver_name ?? ''} />
                  <p
                    style={{
                      marginTop: 24,
                      marginBottom: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#000000',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    חתימה:
                  </p>
                  <div
                    data-health-sig-slot
                    style={{
                      marginTop: 8,
                      minHeight: 100,
                      borderTop: '1px solid #cbd5e1',
                      paddingTop: 12,
                      display: 'flex',
                      alignItems: 'flex-end',
                      backgroundColor: '#ffffff',
                    }}
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-sm font-semibold text-slate-100">נוסח ההצהרה</p>
                  <div className="max-h-[min(52vh,480px)] overflow-y-auto rounded-md border border-white/10 bg-white p-4 text-black">
                    <HealthDeclarationLegalContent driverName={item?.driver_name ?? ''} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">
                      תוקף ההצהרה במערכת (ברירת מחדל: 3 שנים — ניתן לערוך, פורמט YYYY-MM-DD)
                    </Label>
                    <Input
                      type="text"
                      value={declaredHealthExpiry}
                      onChange={(e) => setDeclaredHealthExpiry(e.target.value.trim())}
                      placeholder="למשל 2027-12-31"
                      className="mt-1 border-white/15 bg-black/30 font-mono text-white"
                      dir="ltr"
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    לאחר השליחה יישמר קובץ תמונה אחד הכולל את הנוסח, שמך והחתימה — כפי שיוצג בכרטיס הנהג.
                  </p>
                  <p className="text-sm font-medium text-slate-200">חתימה דיגיטלית</p>
                  <div className="rounded-md border border-cyan-300/20 bg-white">
                    <SignatureCanvas
                      ref={(r) => {
                        sigRef.current = r;
                      }}
                      penColor="black"
                      canvasProps={{ className: 'h-40 w-full touch-none' }}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => sigRef.current?.clear()}>
                    נקה חתימה
                  </Button>
                </div>
              </>
            ) : null}

            {!done && item?.task_key === 'driver_license' ? (
              <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                <p className="text-sm leading-relaxed text-slate-200">
                  צלמו את <strong>רישיון הנהיגה העדכני</strong> בתאור טוב ובפוקוס חדה, או העלו מהגלריה. כל השדות חייבים
                  להיות קריאים.
                </p>
                <div className="[&_.border-success]:border-emerald-500/60 [&_.border-border]:border-white/20">
                  <PhotoUpload
                    label="צילום רישיון — מצלמה או גלריה"
                    onPhotoCapture={onLicensePhoto}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <p className="text-xs text-slate-400">
                    פרטים אופציונליים לעזר למנהל (בעתיד: חילוץ אוטומטי מתמונה)
                  </p>
                  <div>
                    <Label className="text-xs text-slate-300">מספר רישיון (אופציונלי)</Label>
                    <Input
                      value={declaredLicenseNumber}
                      onChange={(e) => setDeclaredLicenseNumber(e.target.value)}
                      placeholder="כפי שמופיע ברישיון"
                      className="mt-1 border-white/15 bg-black/30 text-white"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">תאריך תוקף חדש (אופציונלי, פורמט YYYY-MM-DD)</Label>
                    <Input
                      type="text"
                      value={declaredLicenseExpiry}
                      onChange={(e) => setDeclaredLicenseExpiry(e.target.value.trim())}
                      placeholder="2030-12-31"
                      className="mt-1 border-white/15 bg-black/30 font-mono text-white"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <Button type="button" className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח…
                </span>
              ) : (
                'שליחה'
              )}
            </Button>
          </div>
        )}

        {showSuccessOnly ? (
          <p className="mt-5 text-center text-[11px] text-slate-500">
            ניתן לסגור את הלשונית. הקישור אינו לשימוש חוזר לפי נהלי הארגון.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 text-center text-[11px] text-slate-500">
            אם הבעיה נמשכת, צלמו שוב ברזולוציה נמוכה יותר או פנו למחלקת הרכב.
          </p>
        ) : null}
      </section>
    </main>
  );
}
