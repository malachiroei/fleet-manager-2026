import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  isAndroidUserAgent,
  shouldAttachDirectCameraCapture,
  tryMaterializeImageFileFromInput,
} from '@/lib/mobilePhotoIngest';
import { photoPickerActionButtonClassName } from '@/lib/photoPickerUi';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  label: string;
  /** Pass `null` when the user clears the photo. */
  onPhotoCapture: (file: File | null) => void;
  required?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/**
 * צילום כמו בדיאלוגי כרטיס הרכב (רישוי/ביטוח): materialize אסינכרוני + blob URL לפריוויו,
 * בלי useMobilePhotoIngest — פחות עומס state אחרי חזרה מהמצלמה בכרום אנדרואיד.
 */
export default function PhotoUpload({
  label,
  onPhotoCapture,
  required,
  icon,
  disabled = false,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const onPhotoCaptureRef = useRef(onPhotoCapture);
  onPhotoCaptureRef.current = onPhotoCapture;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRevokeRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRevokeRef.current) {
        URL.revokeObjectURL(previewRevokeRef.current);
        previewRevokeRef.current = null;
      }
    };
  }, []);

  const revokePreview = useCallback(() => {
    if (previewRevokeRef.current) {
      URL.revokeObjectURL(previewRevokeRef.current);
      previewRevokeRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const applyPickedFile = useCallback(async (file: File | null, clearInput: HTMLInputElement | null) => {
    const inputEl = clearInput;

    if (!file) {
      revokePreview();
      startTransition(() => {
        onPhotoCaptureRef.current(null);
      });
      if (inputEl) {
        queueMicrotask(() => {
          try {
            inputEl.value = '';
          } catch {
            /* ignore */
          }
        });
      }
      return;
    }

    /** כמו setDocFile בכרטיס רכב: לא מאפסים את ההורה לפני קובץ חדש — מונע סערת רינדור בכרום אנדרואיד */
    revokePreview();

    setBusy(true);
    try {
      const mime = file.type || '';
      const looksLikeImage =
        mime.startsWith('image/') || mime === 'application/octet-stream' || mime === '';
      let normalized = file;
      if (looksLikeImage) {
        try {
          const { file: work } = await tryMaterializeImageFileFromInput(file);
          normalized = work;
        } catch (e) {
          console.warn('[PhotoUpload] materialize failed; using original', e);
        }
      }
      if (!normalized.size) {
        toast({
          title: 'הקובץ ריק',
          description: 'נסו לצלם או לבחור תמונה אחרת.',
          variant: 'destructive',
        });
        return;
      }
      const url = URL.createObjectURL(normalized);
      previewRevokeRef.current = url;
      setPreviewUrl(url);
      startTransition(() => {
        onPhotoCaptureRef.current(normalized);
      });
    } catch (err) {
      console.error('[PhotoUpload] ingest failed', err);
      toast({
        title: 'לא ניתן לטעון את התמונה',
        description: 'נסו שוב או תמונה מהגלריה.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      /** לא לנעול את ה-input בזמן ה-change; ניקוי value רק אחרי סיום המיקרו-משימה */
      if (inputEl) {
        queueMicrotask(() => {
          try {
            inputEl.value = '';
          } catch {
            /* ignore */
          }
        });
      }
    }
  }, [revokePreview]);

  const android = isAndroidUserAgent();
  /** אל תשביתי את ה-file inputs בזמן busy — כרום אנדרואיד רגיש לכך אחרי המצלמה */
  const inputDisabled = disabled;
  const controlsDisabled = disabled || busy;

  const clearPhoto = useCallback(() => {
    revokePreview();
    startTransition(() => {
      onPhotoCaptureRef.current(null);
    });
    queueMicrotask(() => {
      try {
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      } catch {
        /* ignore */
      }
    });
  }, [revokePreview]);

  useEffect(() => {
    const onGoHome = () => {
      clearPhoto();
    };
    window.addEventListener('app:go-home', onGoHome as EventListener);
    return () => window.removeEventListener('app:go-home', onGoHome as EventListener);
  }, [clearPhoto]);

  const openNativePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      {android ? (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={inputDisabled}
            onChange={(e) => {
              void applyPickedFile(e.target.files?.[0] ?? null, e.target);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={inputDisabled}
            onChange={(e) => {
              void applyPickedFile(e.target.files?.[0] ?? null, e.target);
            }}
          />
        </>
      ) : (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
          className="hidden"
          disabled={inputDisabled}
          onChange={(e) => {
            void applyPickedFile(e.target.files?.[0] ?? null, e.target);
          }}
        />
      )}

      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-all',
          previewUrl ? 'border-success' : 'border-border',
          !previewUrl && !controlsDisabled && !android && 'cursor-pointer hover:border-primary/50',
          !previewUrl && !controlsDisabled && android && 'border-border',
        )}
        onClick={!previewUrl && !controlsDisabled && !android ? openNativePicker : undefined}
        onKeyDown={
          !previewUrl && !controlsDisabled && !android
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openNativePicker();
                }
              }
            : undefined
        }
        role={!previewUrl && !controlsDisabled && !android ? 'button' : undefined}
        tabIndex={!previewUrl && !controlsDisabled && !android ? 0 : undefined}
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
              disabled={controlsDisabled}
              onClick={(e) => {
                e.stopPropagation();
                clearPhoto();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : android ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 text-muted-foreground">
            {icon || <Camera className="h-8 w-8" />}
            <span className="text-center text-sm font-medium">{label}</span>
            {required && <span className="text-xs text-destructive">*חובה</span>}
            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={controlsDisabled}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 shrink-0" />
                צלם מהמצלמה
              </Button>
              <Button
                type="button"
                variant="outline"
                className={photoPickerActionButtonClassName()}
                disabled={controlsDisabled}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                בחר מהגלריה
              </Button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {icon || <Camera className="h-8 w-8" />}
            <span className="text-sm font-medium">{label}</span>
            {required && <span className="text-xs text-destructive">*חובה</span>}
            <span className="px-2 text-center text-xs">לחיצה לצילום או בחירת תמונה</span>
          </div>
        )}
      </div>
    </div>
  );
}
