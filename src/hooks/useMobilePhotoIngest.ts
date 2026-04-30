import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/hooks/use-toast';
import {
  createFastPreviewUrl,
  isAndroidUserAgent,
  tryMaterializeImageFileFromInput,
} from '@/lib/mobilePhotoIngest';

export type UseMobilePhotoIngestOptions = {
  logLabel?: string;
  /** Runs when starting ingest of a non-null file (e.g. clear session flags). */
  onIngestBeginWithFile?: () => void;
  /** Mirror of committed in-memory file for parents that don’t read `photoFile` (e.g. PhotoUpload). */
  onCommittedChange?: (file: File | null) => void;
};

/**
 * Single pipeline for file inputs: materialize ל־File, תצוגה מקדימה, מניעת stale async.
 * Materialization normalizes Android `content://` handles and camera-produced files before preview/upload state.
 */
export function useMobilePhotoIngest(options?: UseMobilePhotoIngestOptions) {
  const logLabel = options?.logLabel ?? '[useMobilePhotoIngest]';
  const onIngestBeginWithFile = options?.onIngestBeginWithFile;
  const onCommittedChange = options?.onCommittedChange;

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [previewMountKey, setPreviewMountKey] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);

  const blobPreviewRevokeRef = useRef<string | null>(null);
  const ingestGenRef = useRef(0);
  const inFlightSigRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (blobPreviewRevokeRef.current) {
        URL.revokeObjectURL(blobPreviewRevokeRef.current);
        blobPreviewRevokeRef.current = null;
      }
    };
  }, []);

  const startPhotoIngest = useCallback(
    (file: File | null, clearInput: HTMLInputElement | null) => {
      const nextSig = file ? `${file.name}::${file.size}::${file.lastModified}` : null;
      if (file && isMaterializing && inFlightSigRef.current === nextSig) {
        if (clearInput) clearInput.value = '';
        return;
      }
      const gen = ++ingestGenRef.current;
      inFlightSigRef.current = nextSig;

      if (blobPreviewRevokeRef.current) {
        URL.revokeObjectURL(blobPreviewRevokeRef.current);
        blobPreviewRevokeRef.current = null;
      }
      setPhotoPreviewUrl(null);
      setPhotoFile(null);
      setIsMaterializing(false);
      onCommittedChange?.(null);

      if (!file) {
        inFlightSigRef.current = null;
        if (clearInput) clearInput.value = '';
        return;
      }

      setIsMaterializing(true);
      onIngestBeginWithFile?.();

      void (async () => {
        try {
          // Always materialize once to a stable in-memory File before state/preview updates.
          const { file: workFile } = await tryMaterializeImageFileFromInput(file);

          if (gen !== ingestGenRef.current) return;

          if (!workFile.size) {
            toast({
              title: 'הקובץ ריק',
              description: 'נסו לצלם או לבחור תמונה אחרת.',
              variant: 'destructive',
            });
            return;
          }

          setPhotoFile(workFile);
          onCommittedChange?.(workFile);

          // Android Chrome: avoid extra decode/canvas churn for preview (OOM risk); keep blob URL only.
          const displayUrl = isAndroidUserAgent()
            ? URL.createObjectURL(workFile)
            : await createFastPreviewUrl(workFile, { maxDim: 600, quality: 0.72 });

          if (gen !== ingestGenRef.current) {
            if (displayUrl?.startsWith('blob:')) URL.revokeObjectURL(displayUrl);
            return;
          }

          if (displayUrl?.startsWith('blob:')) {
            blobPreviewRevokeRef.current = displayUrl;
          } else {
            blobPreviewRevokeRef.current = null;
          }

          setPhotoPreviewUrl(displayUrl ?? null);
          setPreviewMountKey((k) => k + 1);

          if (!displayUrl) {
            toast({
              title: 'לא ניתן להציג תצוגה מקדימה',
              description: 'הקובץ עדיין אמור להישלח — נסו שוב או תמונה מהגלריה.',
              variant: 'destructive',
            });
          }
        } catch (err) {
          if (gen === ingestGenRef.current) {
            console.error(`${logLabel} ingest failed`, err);
            toast({
              title: 'לא ניתן לטעון את התמונה',
              description: 'נסו שוב או תמונה מהגלריה.',
              variant: 'destructive',
            });
          }
        } finally {
          if (gen === ingestGenRef.current) {
            setIsMaterializing(false);
            inFlightSigRef.current = null;
          }
          if (clearInput) clearInput.value = '';
        }
      })();
    },
    [isMaterializing, logLabel, onCommittedChange, onIngestBeginWithFile]
  );

  const resetPhoto = useCallback(() => {
    ingestGenRef.current += 1;
    if (blobPreviewRevokeRef.current) {
      URL.revokeObjectURL(blobPreviewRevokeRef.current);
      blobPreviewRevokeRef.current = null;
    }
    setPhotoPreviewUrl(null);
    setPhotoFile(null);
    setIsMaterializing(false);
    inFlightSigRef.current = null;
    onCommittedChange?.(null);
  }, [onCommittedChange]);

  return {
    photoFile,
    photoPreviewUrl,
    previewMountKey,
    isMaterializing,
    startPhotoIngest,
    resetPhoto,
  };
}
