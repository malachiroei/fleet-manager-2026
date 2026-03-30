import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Camera, Check, ImageIcon, X } from 'lucide-react';

import { WebcamCapture } from '@/components/WebcamCapture';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  isAndroidUserAgent,
  readFileAsDataUrl,
  shouldAttachDirectCameraCapture,
  tryMaterializeImageFileFromInput,
} from '@/lib/mobilePhotoIngest';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  label: string;
  /** Pass `null` when the user clears the photo. */
  onPhotoCapture: (file: File | null) => void;
  required?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export default function PhotoUpload({
  label,
  onPhotoCapture,
  required,
  icon,
  disabled = false,
}: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMountKey, setPreviewMountKey] = useState(0);
  const [webcamOpen, setWebcamOpen] = useState(false);

  const blobPreviewRevokeRef = useRef<string | null>(null);
  const ingestGenRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const android = isAndroidUserAgent();

  useEffect(() => {
    return () => {
      if (blobPreviewRevokeRef.current) {
        URL.revokeObjectURL(blobPreviewRevokeRef.current);
        blobPreviewRevokeRef.current = null;
      }
    };
  }, []);

  const startIngest = useCallback(
    (file: File | null, clearInput: HTMLInputElement | null) => {
      const gen = ++ingestGenRef.current;

      if (blobPreviewRevokeRef.current) {
        URL.revokeObjectURL(blobPreviewRevokeRef.current);
        blobPreviewRevokeRef.current = null;
      }
      setPreview(null);
      onPhotoCapture(null);

      if (!file) {
        if (clearInput) clearInput.value = '';
        return;
      }

      void (async () => {
        const { file: workFile } = await tryMaterializeImageFileFromInput(file);

        if (gen !== ingestGenRef.current) return;

        onPhotoCapture(workFile);

        let displayUrl: string | null = null;
        if (isAndroidUserAgent()) {
          displayUrl = await readFileAsDataUrl(workFile);
        } else {
          try {
            displayUrl = URL.createObjectURL(workFile);
          } catch (err) {
            console.warn('[PhotoUpload] createObjectURL failed', err);
          }
          if (!displayUrl) {
            displayUrl = await readFileAsDataUrl(workFile);
          }
        }

        if (gen !== ingestGenRef.current) {
          if (displayUrl?.startsWith('blob:')) URL.revokeObjectURL(displayUrl);
          return;
        }

        if (displayUrl?.startsWith('blob:')) {
          blobPreviewRevokeRef.current = displayUrl;
        } else {
          blobPreviewRevokeRef.current = null;
        }

        flushSync(() => {
          setPreview(displayUrl ?? null);
          setPreviewMountKey((k) => k + 1);
        });

        if (!displayUrl) {
          toast({
            title: 'לא ניתן להציג תצוגה מקדימה',
            description: 'הקובץ עדיין אמור להישלח — נסו שוב או תמונה מהגלריה.',
            variant: 'destructive',
          });
        }
      })()
        .catch((err) => {
          if (gen === ingestGenRef.current) {
            console.error('[PhotoUpload] ingest failed', err);
            toast({
              title: 'לא ניתן לטעון את התמונה',
              description: 'נסו שוב או בחרו מהגלריה.',
              variant: 'destructive',
            });
          }
        })
        .finally(() => {
          if (clearInput) clearInput.value = '';
        });
    },
    [onPhotoCapture]
  );

  const clearPhoto = () => {
    ingestGenRef.current += 1;
    if (blobPreviewRevokeRef.current) {
      URL.revokeObjectURL(blobPreviewRevokeRef.current);
      blobPreviewRevokeRef.current = null;
    }
    setPreview(null);
    onPhotoCapture(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (fallbackInputRef.current) fallbackInputRef.current.value = '';
  };

  const openNativePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      {/* Android: in-tab webcam + gallery (same strategy as דיווח ק״מ). */}
      {android ? (
        <>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => startIngest(e.target.files?.[0] ?? null, e.target)}
          />
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => startIngest(e.target.files?.[0] ?? null, e.target)}
          />
        </>
      ) : (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
          className="hidden"
          disabled={disabled}
          onChange={(e) => startIngest(e.target.files?.[0] ?? null, e.target)}
        />
      )}

      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-all',
          preview ? 'border-success' : 'border-border',
          !preview && !disabled && !android && 'cursor-pointer hover:border-primary/50',
          !preview && !disabled && android && 'border-border'
        )}
        onClick={!preview && !disabled && !android ? openNativePicker : undefined}
        onKeyDown={
          !preview && !disabled && !android
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openNativePicker();
                }
              }
            : undefined
        }
        role={!preview && !disabled && !android ? 'button' : undefined}
        tabIndex={!preview && !disabled && !android ? 0 : undefined}
      >
        {preview ? (
          <>
            <img
              key={previewMountKey}
              src={preview}
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
                size="sm"
                className="h-10 flex-1 gap-2"
                disabled={disabled}
                onClick={() => setWebcamOpen(true)}
              >
                <Camera className="h-4 w-4 shrink-0" />
                צלם מהמצלמה
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 flex-1 gap-2"
                disabled={disabled}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                מהגלריה
              </Button>
            </div>
            <button
              type="button"
              className="text-xs underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
              onClick={() => fallbackInputRef.current?.click()}
            >
              או בחר קובץ
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {icon || <Camera className="h-8 w-8" />}
            <span className="text-sm font-medium">{label}</span>
            {required && <span className="text-xs text-destructive">*חובה</span>}
            <span className="text-xs text-center px-2">לחיצה לצילום או בחירת תמונה</span>
          </div>
        )}
      </div>

      {android ? (
        <WebcamCapture
          open={webcamOpen}
          onOpenChange={setWebcamOpen}
          onCapture={(f) => {
            setWebcamOpen(false);
            startIngest(f, null);
          }}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
