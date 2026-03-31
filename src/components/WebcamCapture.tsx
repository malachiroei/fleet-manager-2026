import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { tryMaterializeImageFileFromInput } from '@/lib/mobilePhotoIngest';

type WebcamCaptureProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  disabled?: boolean;
};

function stopStream(stream: MediaStream | null) {
  // Stop synchronously and immediately (no async cleanup waits).
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

export function WebcamCapture({ open, onOpenChange, onCapture, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const attachStream = useCallback(async () => {
    setError(null);
    setHasVideoFrame(false);
    setLoading(true);
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

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (err) {
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
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;

    try {
      await video.play();
    } catch {
      stopStream(stream);
      streamRef.current = null;
      setError('לא ניתן להפעיל את תצוגת המצלמה. ' + PERMISSION_BLOCKED_HE);
      setLoading(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setLoading(false);
      setSnapping(false);
      setHasVideoFrame(false);
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      return;
    }
    void attachStream();
    return () => {
      const v = videoRef.current;
      if (v) v.srcObject = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, attachStream]);

  const finalizeDeliverCapture = useCallback(
    async (blob: Blob | null) => {
      if (!blob || blob.size < 200) {
        setError('יצירת התמונה נכשלה או שהקובץ ריק');
        return;
      }
      try {
        const name = `capture-${Date.now()}.jpg`;
        const rawFile = new File([blob], name, { type: 'image/jpeg' });
        const { file: workFile } = await tryMaterializeImageFileFromInput(rawFile);
        if (!workFile.size || workFile.size < 200) {
          setError('יצירת התמונה נכשלה או שהקובץ ריק');
          return;
        }
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        onOpenChange(false);
        onCapture(workFile);
      } catch (e) {
        console.error('[WebcamCapture] finalizeDeliverCapture failed', e);
        setError('שגיאה בעיבוד התמונה');
      }
    },
    [onCapture, onOpenChange]
  );

  const handleSnap = useCallback(async () => {
    if (disabled || snapping) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const w = video?.videoWidth ?? 0;
    const h = video?.videoHeight ?? 0;
    if (w <= 0 || h <= 0) return;

    setSnapping(true);
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
              await finalizeDeliverCapture(blob);
              return;
            }
          }
        }
      }

      setError('יצירת התמונה נכשלה או שהקובץ ריק');
    } catch (e) {
      console.error('[WebcamCapture] snap failed', e);
      setError('שגיאה בצילום');
    } finally {
      setSnapping(false);
    }
  }, [disabled, finalizeDeliverCapture, snapping]);

  const canCapture = !loading && !error && hasVideoFrame;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Keep Home accessible above any modal overlay. */}
        <DialogOverlay className="z-20" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-30 flex items-center justify-center border-0 bg-transparent p-3 shadow-none outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:p-4"
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

            <div
              className="relative aspect-[3/4] w-full min-h-[200px] overflow-hidden rounded-lg bg-black"
            >
              <video
                ref={videoRef}
                className="absolute inset-0 z-[1] h-full w-full object-contain"
                playsInline
                muted
                autoPlay
                disablePictureInPicture
                disableRemotePlayback
                onLoadedMetadata={() => {
                  const v = videoRef.current;
                  if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                    setHasVideoFrame(true);
                    setLoading(false);
                  }
                }}
                onError={() => {
                  if (!openRef.current) return;
                  setLoading(false);
                  setHasVideoFrame(false);
                  setError(PERMISSION_BLOCKED_HE);
                  stopStream(streamRef.current);
                  streamRef.current = null;
                  const v = videoRef.current;
                  if (v) v.srcObject = null;
                }}
              />
              {loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950 px-4 text-center">
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

            <DialogFooter className="flex flex-row items-center gap-2 sm:justify-end flex-row-reverse">
              <Button
                type="button"
                variant="outline"
                className="h-12 px-5 text-base"
                onClick={() => onOpenChange(false)}
                disabled={snapping}
              >
                ביטול
              </Button>
              <Button
                type="button"
                className="h-12 min-w-0 flex-1 text-base"
                onClick={() => void handleSnap()}
                disabled={disabled || loading || !!error || !canCapture || snapping}
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
