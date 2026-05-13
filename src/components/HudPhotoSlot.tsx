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
  /** When true, shows only action buttons when no file is selected; expands to preview only after a photo is attached. */
  compact?: boolean;
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
  compact = false,
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

  const actionButtons = (
    <div className={cn(
      'flex w-full max-w-sm gap-2',
      compact ? 'flex-row justify-center' : 'flex-col pt-0.5 sm:flex-row sm:justify-center sm:pt-1',
    )}>
      <Button
        type="button"
        variant="outline"
        data-no-theme
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
        data-no-theme
        className={photoPickerActionButtonClassName()}
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
      >
        <ImageIcon className="h-4 w-4 shrink-0" />
        גלריה
      </Button>
    </div>
  );

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

      {compact && !previewUrl ? (
        <div className="flex flex-col items-center gap-1.5">
          {subtitle ? (
            <span className="text-center text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
          {required ? <span className="text-xs text-destructive">*חובה</span> : null}
          {actionButtons}
        </div>
      ) : (
        <div
          className={cn(
            'relative overflow-hidden rounded-xl transition-colors',
            previewUrl
              ? 'border border-emerald-500/55 bg-slate-100 dark:border-emerald-500/45 dark:bg-black/30'
              : 'min-h-[9rem] border border-slate-200 bg-slate-50 shadow-sm dark:border-cyan-400/15 dark:bg-[#061325]/50 dark:shadow-none sm:aspect-video sm:min-h-0',
          )}
        >
          {previewUrl ? (
            <>
              <img
                key={previewUrl}
                src={previewUrl}
                alt={imageAlt}
                decoding="async"
                className="h-full w-full max-h-48 object-cover sm:max-h-56"
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
            <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2.5 p-4 text-slate-600 dark:text-muted-foreground sm:min-h-[10rem]">
              <Camera className="h-7 w-7 text-slate-600 opacity-90 dark:text-muted-foreground dark:opacity-80" />
              <span className="text-center text-sm font-semibold text-slate-800 dark:text-foreground/90">
                מצלמה או גלריה
              </span>
              {subtitle ? (
                <span className="text-center text-xs text-muted-foreground">{subtitle}</span>
              ) : null}
              {required ? <span className="text-xs text-destructive">*חובה</span> : null}
              {actionButtons}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
