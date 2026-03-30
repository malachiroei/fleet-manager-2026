import { useCallback, useEffect, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';

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

export function WebcamCapture({ open, onOpenChange, onCapture, disabled }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const attachStream = useCallback(async () => {
    setError(null);
    setVideoReady(false);
    setLoading(true);
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

    const tryVideo = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia(constraints);
    };

    let stream: MediaStream | null = null;
    try {
      try {
        stream = await tryVideo({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        stream = await tryVideo({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'לא ניתן לפתוח את המצלמה';
      setError(msg);
      setLoading(false);
      return;
    }

    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    try {
      await video.play();
    } catch {
      setError('לא ניתן להפעיל את תצוגת המצלמה');
      stopStream(stream);
      streamRef.current = null;
      setLoading(false);
      return;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setLoading(false);
      setSnapping(false);
      setVideoReady(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'z-[110] max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg gap-3 overflow-y-auto border-border bg-card p-4 sm:p-6'
        )}
      >
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
            onLoadedMetadata={() => setVideoReady(true)}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <Loader2 className="h-10 w-10 animate-spin text-white" />
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
