/**
 * Shared helpers for mobile photo pickers: Android `content://` files and iOS capture hints.
 * Used by ReportMileagePage and PhotoUpload (handover flows).
 */

/** Delay after stopping the temporary front-camera stream before opening rear (Android / Samsung). */
export const ANDROID_WEBCAM_WARMUP_POST_STOP_MS = 400;

async function decodeToBitmap(source: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      // fallback below
    }
  }
  try {
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const bitmap = await createImageBitmap(canvas);
      return bitmap;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

export async function createFastPreviewBlob(source: Blob): Promise<Blob | null> {
  const bitmap = await decodeToBitmap(source);
  if (!bitmap) return null;

  const w = bitmap.width || 0;
  const h = bitmap.height || 0;
  if (w <= 0 || h <= 0) {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
    return null;
  }

  // Keep it simple: limit preview size to reduce CPU/memory.
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(2, Math.floor(w * scale));
  const outH = Math.max(2, Math.floor(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
    return null;
  }

  // Performance: disable smoothing to reduce CPU cycles.
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, outW, outH);
  } finally {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }

  // Preview quality tuned for speed and size.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
  );
  return blob;
}

export async function createFastPreviewUrl(source: Blob): Promise<string | null> {
  try {
    const blob = await createFastPreviewBlob(source);
    if (!blob || blob.size === 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Plain `accept="image/*"` on desktop lets the OS picker offer files, webcam, or “Take photo” where supported.
 * `capture="environment"` is limited to iOS-style mobile UAs only — never Android (separate activity / dropped result).
 */
export function shouldAttachDirectCameraCapture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return false;
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

export function isAndroidUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Android often supplies a `File` backed by a `content://` URI. That handle must not be used
 * as a long-lived preview target — read bytes once into a normal in-memory `File` for `<img>` and upload.
 */
export async function materializeImageFileFromInput(source: File): Promise<File> {
  const mime =
    source.type && source.type !== 'application/octet-stream' && source.type !== ''
      ? source.type
      : 'image/jpeg';
  const buf = await source.arrayBuffer();
  const name = source.name?.trim() || 'photo.jpg';
  return new File([buf], name, { type: mime });
}

/** Materialize for Android `content://` safety; on desktop, empty reads fall back to the original `File`. */
export async function tryMaterializeImageFileFromInput(source: File): Promise<{ file: File; ok: boolean }> {
  try {
    const out = await materializeImageFileFromInput(source);
    if (out.size === 0 && source.size > 0) {
      console.warn('[mobilePhotoIngest] materialize produced empty buffer; using original File');
      return { file: source, ok: false };
    }
    return { file: out, ok: true };
  } catch (err) {
    console.warn('[mobilePhotoIngest] materialize failed; using original File', err);
    return { file: source, ok: false };
  }
}

export function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
