import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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

/**
 * Order matters: rich constraints first (S24 multi-lens), then simpler, then default camera.
 */
const VIDEO_CONSTRAINT_CHAIN: MediaStreamConstraints[] = [
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

async function getUserMediaWithFallbacks(): Promise<MediaStream> {
  let lastErr: unknown;
  for (const constraints of VIDEO_CONSTRAINT_CHAIN) {
    try {
      return await navigator.mediaDevices!.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function WebcamCapture({ open, onOpenChange, onCapture, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setLoading(true);
    clearInitTimeout();
    stopStream(streamRef.current);
    streamRef.current = null;

    const video = videoRef.current;
    if (!video) {
      setLoading(false);
      return;
    }
    video.srcObject = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('הדפדפן לא תומך במצלמה (נדרש HTTPS ודפדפן מעודכן).');
      setLoading(false);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await getUserMediaWithFallbacks();
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

    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;

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
    } catch {
      clearInitTimeout();
      if (!openRef.current) {
        stopStream(stream);
        streamRef.current = null;
        return;
      }
      setError('לא ניתן להפעיל את תצוגת המצלמה. ' + PERMISSION_BLOCKED_HE);
      stopStream(stream);
      streamRef.current = null;
      setLoading(false);
      return;
    }
    if (!openRef.current) {
      clearInitTimeout();
      stopStream(stream);
      streamRef.current = null;
      if (video) video.srcObject = null;
      return;
    }
    // Keep loading overlay until first frames (onPlaying / onLoadedData) or timeout above.
  }, [clearInitTimeout, markVideoPresenting]);

  useEffect(() => {
    if (!open) {
      clearInitTimeout();
      setError(null);
      setLoading(false);
      setSnapping(false);
      setVideoReady(false);
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    }
  }, [open, clearInitTimeout]);

  useLayoutEffect(() => {
    if (!open) return;

    void attachStream();
    return () => {
      clearInitTimeout();
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, attachStream, clearInitTimeout]);

  const handleSnap = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0 || disabled || snapping) return;

    setSnapping(true);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('לא ניתן לצלם — נסו שוב');
        setSnapping(false);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          setSnapping(false);
          if (!blob) {
            setError('יצירת התמונה נכשלה');
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
        'image/jpeg',
        0.92
      );
    } catch {
      setSnapping(false);
      setError('שגיאה בצילום');
    }
  }, [disabled, onCapture, onOpenChange, snapping]);

  const handleVideoError = useCallback(() => {
    clearInitTimeout();
    if (!openRef.current) return;
    setLoading(false);
    setVideoReady(false);
    setError(PERMISSION_BLOCKED_HE);
    stopStream(streamRef.current);
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, [clearInitTimeout]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg gap-3 overflow-y-auto border-border bg-card p-4 sm:p-6">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">צילום מהמצלמה</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            המצלמה נשארת בתוך הדף — ללא מעבר לאפליקציית המערכת.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
            onLoadedMetadata={markVideoPresenting}
            onLoadedData={markVideoPresenting}
            onPlaying={markVideoPresenting}
            onCanPlay={markVideoPresenting}
            onError={handleVideoError}
          />
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
              <Loader2 className="h-10 w-10 shrink-0 animate-spin text-white" aria-hidden />
              <p className="text-xs text-white/90">טוען מצלמה…</p>
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

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
            onClick={handleSnap}
            disabled={disabled || loading || !!error || !videoReady || snapping}
          >
            {snapping && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            צלם
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
