import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ImageIcon, X } from 'lucide-react';

import { WebcamCapture } from '@/components/WebcamCapture';
import { Button } from '@/components/ui/button';
import { useMobilePhotoIngest } from '@/hooks/useMobilePhotoIngest';
import { isAndroidUserAgent, shouldAttachDirectCameraCapture } from '@/lib/mobilePhotoIngest';
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
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamMountKey, setWebcamMountKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const onCommittedChange = useMemo(() => onPhotoCapture, [onPhotoCapture]);

  const {
    photoPreviewUrl: preview,
    previewMountKey,
    isMaterializing,
    startPhotoIngest,
    resetPhoto,
  } = useMobilePhotoIngest({
    logLabel: '[PhotoUpload]',
    onCommittedChange,
  });

  const android = isAndroidUserAgent();
  const controlsDisabled = disabled || isMaterializing;

  useEffect(() => {
    const onGoHome = () => {
      setWebcamOpen(false);
      resetPhoto();
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    };
    window.addEventListener('app:go-home', onGoHome as EventListener);
    return () => window.removeEventListener('app:go-home', onGoHome as EventListener);
  }, [resetPhoto]);

  const clearPhoto = () => {
    resetPhoto();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const openNativePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      {android ? (
        <>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={controlsDisabled}
            onChange={(e) => startPhotoIngest(e.target.files?.[0] ?? null, e.target)}
          />
        </>
      ) : (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          {...(shouldAttachDirectCameraCapture() ? ({ capture: 'environment' } as const) : {})}
          className="hidden"
          disabled={controlsDisabled}
          onChange={(e) => startPhotoIngest(e.target.files?.[0] ?? null, e.target)}
        />
      )}

      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-all',
          preview ? 'border-success' : 'border-border',
          !preview && !controlsDisabled && !android && 'cursor-pointer hover:border-primary/50',
          !preview && !controlsDisabled && android && 'border-border'
        )}
        onClick={!preview && !controlsDisabled && !android ? openNativePicker : undefined}
        onKeyDown={
          !preview && !controlsDisabled && !android
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openNativePicker();
                }
              }
            : undefined
        }
        role={!preview && !controlsDisabled && !android ? 'button' : undefined}
        tabIndex={!preview && !controlsDisabled && !android ? 0 : undefined}
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
                size="sm"
                className="h-10 flex-1 gap-2"
                disabled={controlsDisabled}
                onClick={() => {
                  setWebcamMountKey((k) => k + 1);
                  setWebcamOpen(true);
                }}
              >
                <Camera className="h-4 w-4 shrink-0" />
                צלם מהמצלמה
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 flex-1 gap-2"
                disabled={controlsDisabled}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                מהגלריה
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

      {android ? (
        <WebcamCapture
          key={webcamMountKey}
          open={webcamOpen}
          onOpenChange={setWebcamOpen}
          onCapture={(f) => {
            setWebcamOpen(false);
            startPhotoIngest(f, null);
          }}
          disabled={controlsDisabled}
        />
      ) : null}
    </div>
  );
}
