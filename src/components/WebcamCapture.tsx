import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';

type WebcamCaptureProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In-memory JPEG `File` from the current video frame */
  onCapture: (file: File) => void;
  disabled?: boolean;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

const PERMISSION_BLOCKED_HE =
  'נראה שהרשאת המצלמה חסומה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.';

function mapGetUserMediaError(err: unknown): string {
  const dom = err as DOMException | undefined;
  const name = dom?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return PERMISSION_BLOCKED_HE;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'לא נמצאה מצלמה במכשיר.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'המצלמה לא זמינה (אולי בשימוש אפליקציה אחרת).';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'הגדרות המצלמה לא נתמכות — נסו שוב.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'לא ניתן לפתוח את המצלמה.';
}

type CameraProfile = 'environment' | 'user' | 'compatible';

/** Rear / world-facing only — isolate S24 multi-lens rear issues vs front. */
const ENVIRONMENT_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: { facingMode: 'environment' }, audio: false },
  { video: true, audio: false },
];

/** Front / selfie only. */
const USER_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  { video: { facingMode: { ideal: 'user' } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
];

/** No facingMode / resolution hints — maximum browser/OS default compatibility. */
const HIGH_COMPAT_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [{ video: true, audio: false }];

function constraintChainForProfile(profile: CameraProfile): MediaStreamConstraints[] {
  switch (profile) {
    case 'user':
      return USER_CONSTRAINT_CHAIN;
    case 'compatible':
      return HIGH_COMPAT_CONSTRAINT_CHAIN;
    default:
      return ENVIRONMENT_CONSTRAINT_CHAIN;
  }
}

async function getUserMediaWithChain(chain: MediaStreamConstraints[]): Promise<MediaStream> {
  let lastErr: unknown;
  for (const constraints of chain) {
    try {
      return await navigator.mediaDevices!.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function collectStreamDebug(stream: MediaStream | null): string {
  if (!stream) return '(אין stream)';
  const lines = [`stream.id: ${stream.id}`, `active: ${String(stream.active)}`];
  stream.getVideoTracks().forEach((t, i) => {
    lines.push(
      `video[${i}] id=${t.id.slice(0, 8)}… readyState=${t.readyState} muted=${t.muted} enabled=${t.enabled} label=${t.label || '—'}`
    );
  });
  return lines.join('\n');
}

function logStreamDebug(stream: MediaStream, label: string) {
  console.log(`[WebcamCapture] ${label}`, {
    streamId: stream.id,
    active: stream.active,
    videoTracks: stream.getVideoTracks().map((t) => ({
      id: t.id,
      readyState: t.readyState,
      muted: t.muted,
      enabled: t.enabled,
      label: t.label,
    })),
  });
}

/** Draw one frame to an off-DOM canvas and sample pixels (video may look black in UI but still decode). */
function probeVideoFrameOnCanvas(video: HTMLVideoElement): { ok: boolean; note: string; avgLuma: number } {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w <= 0 || h <= 0) {
    return { ok: false, note: 'אין מימדי וידאו לקנבס', avgLuma: 0 };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { ok: false, note: 'לא ניתן ליצור הקשר 2D לקנבס', avgLuma: 0 };
  }
  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch (e) {
    return { ok: false, note: `drawImage נכשל: ${e instanceof Error ? e.message : String(e)}`, avgLuma: 0 };
  }
  const sw = Math.min(64, w);
  const sh = Math.min(64, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, sw, sh);
  } catch (e) {
    return { ok: false, note: `getImageData נחסם או נכשל: ${e instanceof Error ? e.message : String(e)}`, avgLuma: 0 };
  }
  let sum = 0;
  const n = data.data.length / 4;
  for (let i = 0; i < data.data.length; i += 4) {
    sum += data.data[i]! + data.data[i + 1]! + data.data[i + 2]!;
  }
  const avgLuma = n > 0 ? sum / n / 3 : 0;
  const ok = avgLuma > 6;
  return {
    ok,
    avgLuma,
    note: ok
      ? `קנבס: נקלטו פיקסלים (בהירות ממוצעת ~${avgLuma.toFixed(1)})`
      : `קנבס: כמעט שחור (בהירות ~${avgLuma.toFixed(1)})`,
  };
}

export function WebcamCapture({ open, onOpenChange, onCapture, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Samsung Internet / some WebViews paint <video> black; 2D canvas mirror often still shows frames. */
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  /** True when hidden-canvas probe sees non-black pixels (UI may still look black). */
  const [canvasProbeOk, setCanvasProbeOk] = useState(false);
  const [streamDebugText, setStreamDebugText] = useState('');
  const [canvasProbeNote, setCanvasProbeNote] = useState('');
  /** For enabling צלם when video tag is black but track is live (ImageCapture path). */
  const [videoTrackLive, setVideoTrackLive] = useState(false);
  /** Manual camera / constraint profile (rear vs front vs raw { video: true }). */
  const [cameraProfile, setCameraProfile] = useState<CameraProfile>('environment');
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearDebugInterval = useCallback(() => {
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
    }
  }, []);

  const clearInitTimeout = useCallback(() => {
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
  }, []);

  /** Hide spinner once the element is fed; enable capture only when dimensions exist. */
  const markVideoPresenting = useCallback(() => {
    clearInitTimeout();
    if (!openRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    setLoading(false);
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoReady(true);
    }
  }, [clearInitTimeout]);

  const attachStream = useCallback(async () => {
    setError(null);
    setVideoReady(false);
    setCanvasProbeOk(false);
    setStreamDebugText('');
    setCanvasProbeNote('');
    setLoading(true);
    clearInitTimeout();
    clearDebugInterval();
    stopStream(streamRef.current);
    streamRef.current = null;

    const video = videoRef.current;
    if (!video) {
      setLoading(false);
      return;
    }
    video.srcObject = null;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('האתר חייב לרוץ תחת HTTPS כדי שהמצלמה תעבוד.');
      setLoading(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('הדפדפן לא תומך במצלמה (נדרש HTTPS ודפדפן מעודכן).');
      setLoading(false);
      return;
    }

    const chain = constraintChainForProfile(cameraProfile);
    console.log('[WebcamCapture] getUserMedia chain', cameraProfile, chain.length, 'steps');

    let stream: MediaStream | null = null;
    try {
      stream = await getUserMediaWithChain(chain);
    } catch (err) {
      if (!openRef.current) return;
      setError(mapGetUserMediaError(err));
      setLoading(false);
      return;
    }

    if (!openRef.current) {
      stopStream(stream);
      return;
    }

    stream.getTracks().forEach((track) => {
      track.enabled = true;
    });

    logStreamDebug(stream, 'stream acquired');
    setStreamDebugText(collectStreamDebug(stream));

    const syncTrackUi = (s: MediaStream) => {
      const vt = s.getVideoTracks()[0];
      setVideoTrackLive(vt?.readyState === 'live');
    };
    syncTrackUi(stream);

    debugIntervalRef.current = setInterval(() => {
      const s = streamRef.current;
      if (!s || !openRef.current) return;
      setStreamDebugText(collectStreamDebug(s));
      syncTrackUi(s);
      logStreamDebug(s, 'tick');
    }, 2000);

    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;

    const [vTrack] = stream.getVideoTracks();
    if (vTrack) {
      const onUnmute = () => markVideoPresenting();
      vTrack.addEventListener('unmute', onUnmute);
      vTrack.addEventListener('ended', () => {
        if (openRef.current) setError('המצלמה נותקה. נסו שוב.');
      });
      if (!vTrack.muted) {
        requestAnimationFrame(() => markVideoPresenting());
      }
    }

    initTimeoutRef.current = setTimeout(() => {
      initTimeoutRef.current = null;
      if (!openRef.current) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        markVideoPresenting();
        return;
      }
      setLoading(false);
      setError(
        'המצלמה איטית או לא מציגה תמונה. בדקו הרשאות, או סגרו ונסו שוב. אם הרשאה חסומה — אפשרו מצלמה בהגדרות הדפדפן.'
      );
    }, 12000);

    try {
      await video.play();
      requestAnimationFrame(() => markVideoPresenting());
      const rVfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void })
        .requestVideoFrameCallback;
      if (typeof rVfc === 'function') {
        rVfc.call(video, () => markVideoPresenting());
      }
    } catch {
      clearInitTimeout();
      clearDebugInterval();
      if (!openRef.current) {
        stopStream(stream);
        streamRef.current = null;
        return;
      }
      setError('לא ניתן להפעיל את תצוגת המצלמה. ' + PERMISSION_BLOCKED_HE);
      stopStream(stream);
      streamRef.current = null;
      setLoading(false);
      setVideoTrackLive(false);
      return;
    }
    if (!openRef.current) {
      clearInitTimeout();
      clearDebugInterval();
      stopStream(stream);
      streamRef.current = null;
      if (video) video.srcObject = null;
      return;
    }

    const runCanvasProbe = () => {
      const v = videoRef.current;
      const s = streamRef.current;
      if (!v || !s || !openRef.current) return;
      const probe = probeVideoFrameOnCanvas(v);
      setCanvasProbeNote(probe.note);
      console.log('[WebcamCapture] hidden canvas probe', probe);
      if (probe.ok && v.videoWidth > 0 && v.videoHeight > 0) {
        setCanvasProbeOk(true);
        setVideoReady(true);
      }
    };
    setTimeout(runCanvasProbe, 600);
    setTimeout(runCanvasProbe, 2000);

    // Keep loading overlay until first frames (onPlaying / onLoadedData) or timeout above.
  }, [cameraProfile, clearDebugInterval, clearInitTimeout, markVideoPresenting]);

  useEffect(() => {
    if (!open) {
      clearInitTimeout();
      clearDebugInterval();
      setError(null);
      setLoading(false);
      setSnapping(false);
      setVideoReady(false);
      setCanvasProbeOk(false);
      setStreamDebugText('');
      setCanvasProbeNote('');
      setVideoTrackLive(false);
      setCameraProfile('environment');
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    }
  }, [open, clearInitTimeout, clearDebugInterval]);

  useLayoutEffect(() => {
    if (!open) return;

    void attachStream();
    return () => {
      clearInitTimeout();
      clearDebugInterval();
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, attachStream, clearDebugInterval, clearInitTimeout]);

  /** Continuously copy video frames to a visible canvas (workaround for black <video> compositing). */
  useEffect(() => {
    if (!open) return;

    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      rafId = requestAnimationFrame(tick);

      const v = videoRef.current;
      const c = previewCanvasRef.current;
      if (!openRef.current || !v || !c) return;

      if (v.videoWidth <= 0 || v.videoHeight <= 0) return;

      const rect = c.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      const cw = Math.max(2, Math.floor(rect.width * dpr));
      const ch = Math.max(2, Math.floor(rect.height * dpr));

      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }

      const ctx = c.getContext('2d', { alpha: false });
      if (!ctx) return;

      const vw = v.videoWidth;
      const vh = v.videoHeight;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      try {
        ctx.drawImage(v, 0, 0, vw, vh, dx, dy, dw, dh);
      } catch {
        /* ignore single-frame errors */
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [open, cameraProfile]);

  const finishCapture = useCallback(
    (blob: Blob | null) => {
      setSnapping(false);
      if (!blob || blob.size < 200) {
        setError('יצירת התמונה נכשלה או שהקובץ ריק');
        return;
      }
      const name = `mileage-capture-${Date.now()}.jpg`;
      const file = new File([blob], name, { type: 'image/jpeg' });
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      onOpenChange(false);
      onCapture(file);
    },
    [onCapture, onOpenChange]
  );

  const handleSnap = useCallback(async () => {
    if (disabled || snapping) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    setSnapping(true);
    const w = video?.videoWidth ?? 0;
    const h = video?.videoHeight ?? 0;

    try {
      if (w > 0 && h > 0 && video) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
          );
          if (blob && blob.size >= 400) {
            const probe = probeVideoFrameOnCanvas(video);
            if (probe.ok || blob.size >= 2500) {
              finishCapture(blob);
              return;
            }
            console.warn('[WebcamCapture] canvas frame dark/small; trying mirror / ImageCapture', {
              blobSize: blob.size,
              probe,
            });
          }
        }
      }

      const mirror = previewCanvasRef.current;
      if (mirror && mirror.width >= 2 && mirror.height >= 2) {
        const blob = await new Promise<Blob | null>((resolve) =>
          mirror.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        if (blob && blob.size >= 500) {
          finishCapture(blob);
          return;
        }
      }

      if (typeof ImageCapture !== 'undefined') {
        const ic = new ImageCapture(track);
        const bitmap = await ic.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close();
          finishCapture(null);
          return;
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        finishCapture(blob);
        return;
      }

      finishCapture(null);
    } catch (e) {
      console.error('[WebcamCapture] snap failed', e);
      setSnapping(false);
      setError('שגיאה בצילום');
    }
  }, [disabled, finishCapture, snapping]);

  const imageCaptureAvailable = typeof ImageCapture !== 'undefined';
  const canCapture =
    !loading &&
    !error &&
    (videoReady || canvasProbeOk || (imageCaptureAvailable && videoTrackLive));

  const handleVideoError = useCallback(() => {
    clearInitTimeout();
    clearDebugInterval();
    if (!openRef.current) return;
    setLoading(false);
    setVideoReady(false);
    setVideoTrackLive(false);
    setError(PERMISSION_BLOCKED_HE);
    stopStream(streamRef.current);
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, [clearDebugInterval, clearInitTimeout]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Do not use default DialogContent: its translate + zoom (transform) breaks hardware video
        compositing on Chrome/Android — live <video> stays black. Center with flex, no transform.
      */}
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[51] flex items-center justify-center border-0 bg-transparent p-3 shadow-none outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:p-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative grid max-h-[90vh] w-full max-w-lg gap-3 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg sm:gap-4 sm:p-6">
            <DialogPrimitive.Close
              type="button"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            <DialogHeader className="space-y-1 pr-8 text-right sm:text-right">
              <DialogTitle className="text-base">צילום מהמצלמה</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                המצלמה נשארת בתוך הדף — ללא מעבר לאפליקציית המערכת.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground text-right leading-snug">
                אם האחורית שחורה (למשל S24) — נסו קדמית. &quot;תאימות גבוהה&quot; = בקשה גולמית ללא facingMode/רזולוציה.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-stretch">
                <Button
                  type="button"
                  size="sm"
                  className="h-10 flex-1 text-xs sm:text-sm"
                  variant={cameraProfile === 'environment' ? 'default' : 'outline'}
                  disabled={loading || snapping}
                  onClick={() => setCameraProfile('environment')}
                >
                  מצלמה אחורית
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 flex-1 text-xs sm:text-sm"
                  variant={cameraProfile === 'user' ? 'default' : 'outline'}
                  disabled={loading || snapping}
                  onClick={() => setCameraProfile('user')}
                >
                  מצלמה קדמית
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 flex-1 text-xs sm:text-sm"
                  variant={cameraProfile === 'compatible' ? 'default' : 'outline'}
                  disabled={loading || snapping}
                  onClick={() => setCameraProfile('compatible')}
                >
                  תאימות גבוהה
                </Button>
              </div>
            </div>

            <div className="relative aspect-[3/4] w-full min-h-[200px] overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="absolute inset-0 z-0 h-full w-full object-contain"
                playsInline
                muted
                autoPlay
                disablePictureInPicture
                disableRemotePlayback
                onLoadedMetadata={markVideoPresenting}
                onLoadedData={markVideoPresenting}
                onPlaying={markVideoPresenting}
                onCanPlay={markVideoPresenting}
                onError={handleVideoError}
              />
              <canvas
                ref={previewCanvasRef}
                className="absolute inset-0 z-[5] h-full w-full"
                aria-hidden
              />
              {loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
                  <Loader2 className="h-10 w-10 shrink-0 animate-spin text-white" aria-hidden />
                  <p className="text-xs text-white/90">טוען מצלמה…</p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug text-center">
              בדפדפן Samsung Internet לעיתים רואים מסך שחור בווידאו — התצוגה למעלה אמורה להישלף לקנבס; אם רואים תמונה,
              &quot;צלם&quot; ישתמש בה.
            </p>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div
              dir="ltr"
              className="rounded-md border border-border/80 bg-muted/40 px-2 py-2 text-left text-[10px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto"
            >
              <span className="font-sans text-foreground/80">Stream debug (console too)</span>
              {'\n'}
              {streamDebugText || '(no stream text yet)'}
              {canvasProbeNote ? `\n${canvasProbeNote}` : ''}
              {`\nprofile: ${cameraProfile} | mirror rAF | ImageCapture: ${imageCaptureAvailable ? 'yes' : 'no'}`}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-stretch">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:flex-1"
                onClick={() => onOpenChange(false)}
                disabled={snapping}
              >
                ביטול
              </Button>
              <Button
                type="button"
                className="w-full sm:flex-1"
                onClick={() => void handleSnap()}
                disabled={disabled || loading || !!error || !canCapture || snapping}
                title={
                  canCapture
                    ? undefined
                    : 'ממתינים לווידאו, לבדיקת קנבס, או למסלול Live עם ImageCapture'
                }
              >
                {snapping && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                צלם
              </Button>
            </DialogFooter>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
