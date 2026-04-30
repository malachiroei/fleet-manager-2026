import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WebcamCapture } from '@/components/WebcamCapture';
import { toast } from '@/hooks/use-toast';
import { tryMaterializeImageFileFromInput } from '@/lib/mobilePhotoIngest';
import { photoPickerActionButtonClassName } from '@/lib/photoPickerUi';
import { cn } from '@/lib/utils';

export type HudPhotoSlotProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** טקסט קטן אופציונלי מתחת ל«מצלמה או גלריה» (למשל חזית / צד ימין) */
  subtitle?: string;
  /** alt לתצוגת התמונה אחרי צילום */
  imageAlt?: string;
  required?: boolean;
  disabled?: boolean;
};

/**
 * צילום ל-HUD: WebcamCapture + גלריה בלי `capture`. כותרת אחידה: «מצלמה או גלריה».
 */
export function HudPhotoSlot({
  file,
  onFileChange,
  subtitle,
  imageAlt = 'תמונה',
  required,
  disabled = false,
}: HudPhotoSlotProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const onFileChangeRef = useRef(onFileChange);
  onFileChangeRef.current = onFileChange;
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const onGoHome = () => {
      setWebcamOpen(false);
      onFileChangeRef.current(null);
      if (galleryRef.current) galleryRef.current.value = '';
    };
    window.addEventListener('app:go-home', onGoHome as EventListener);
    return () => window.removeEventListener('app:go-home', onGoHome as EventListener);
  }, []);

  const clearAll = () => {
    setWebcamOpen(false);
    onFileChangeRef.current(null);
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const onGalleryChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const raw = input.files?.[0] ?? null;
    if (!raw) return;
    try {
      const mime = raw.type || '';
      const looksLikeImage =
        mime.startsWith('image/') || mime === 'application/octet-stream' || mime === '';
      let normalized = raw;
      if (looksLikeImage) {
        try {
          normalized = (await tryMaterializeImageFileFromInput(raw)).file;
        } catch (err) {
          console.warn('[HudPhotoSlot] materialize failed; using original', err);
        }
      }
      if (!normalized.size) {
        toast({
          title: 'הקובץ ריק',
          description: 'נסו קובץ אחר.',
          variant: 'destructive',
        });
        return;
      }
      onFileChangeRef.current(normalized);
    } finally {
      queueMicrotask(() => {
        try {
          input.value = '';
        } catch {
          /* ignore */
        }
      });
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={onGalleryChange}
      />

      <WebcamCapture
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        disabled={disabled}
        onCapture={(captured) => {
          onFileChangeRef.current(captured);
          setWebcamOpen(false);
        }}
      />

      <div
        className={cn(
          'relative min-h-[9rem] overflow-hidden rounded-xl transition-colors sm:aspect-video sm:min-h-0',
          previewUrl
            ? 'border border-emerald-500/45 bg-black/30'
            : 'border border-cyan-400/15 bg-[#061325]/50',
        )}
      >
        {previewUrl ? (
          <>
            <img
              key={previewUrl}
              src={previewUrl}
              alt={imageAlt}
              decoding="async"
              className="h-full w-full max-h-56 object-cover sm:max-h-none sm:min-h-[10rem]"
            />
            <div className="absolute left-2 top-2 rounded-full bg-success p-1 text-success-foreground">
              <Check className="h-4 w-4" />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2.5 p-4 text-muted-foreground sm:min-h-[10rem]">
            <Camera className="h-7 w-7 opacity-80" />
            <span className="text-center text-sm font-medium text-foreground/90">מצלמה או גלריה</span>
            {subtitle ? (
              <span className="text-center text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
            {required ? <span className="text-xs text-destructive">*חובה</span> : null}
            <div className="flex w-full max-w-sm flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={disabled}
                onClick={() => setWebcamOpen(true)}
              >
                <Camera className="h-4 w-4 shrink-0" />
                מצלמה
              </Button>
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={disabled}
                onClick={() => galleryRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                גלריה
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
