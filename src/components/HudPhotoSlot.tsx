import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WebcamCapture } from '@/components/WebcamCapture';
import { toast } from '@/hooks/use-toast';
import { tryMaterializeImageFileFromInput } from '@/lib/mobilePhotoIngest';
import { photoPickerActionButtonClassName } from '@/lib/photoPickerUi';
import { cn } from '@/lib/utils';

export type HudPhotoSlotProps = {
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  disabled?: boolean;
};

/**
 * צילום לדפים בתוך ה-HUD: מצלמה מוטמעת (WebcamCapture) + בחירה מהגלריה ללא `capture` —
 * נשמר context של האפליקציה. לקישור הציבורי מהמייל השתמשו ב-PhotoUpload (native).
 */
export function HudPhotoSlot({ label, file, onFileChange, required, disabled = false }: HudPhotoSlotProps) {
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
          'relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-all',
          previewUrl ? 'border-success' : 'border-border',
        )}
      >
        {previewUrl ? (
          <>
            <img
              key={previewUrl}
              src={previewUrl}
              alt={label}
              decoding="async"
              className="h-full w-full object-cover"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-center text-sm font-medium">{label}</span>
            {required ? <span className="text-xs text-destructive">*חובה</span> : null}
            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={disabled}
                onClick={() => setWebcamOpen(true)}
              >
                <Camera className="h-4 w-4 shrink-0" />
                מצלמה מוטמעת
              </Button>
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={disabled}
                onClick={() => galleryRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                מהגלריה
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
