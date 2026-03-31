/**
 * Shared helpers for mobile photo pickers: Android `content://` files and iOS capture hints.
 * Used by ReportMileagePage and PhotoUpload (handover flows).
 */

/** Delay after stopping the temporary front-camera stream before opening rear (Android / Samsung). */
export const ANDROID_WEBCAM_WARMUP_POST_STOP_MS = 400;

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
