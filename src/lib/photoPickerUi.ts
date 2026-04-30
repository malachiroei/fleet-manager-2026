import { cn } from '@/lib/utils';

/**
 * עיצוב מאוחד לכפתורי «צלם מהמצלמה» / «בחר מהגלריה» (ב־variant outline).
 * מצלמה = אפליקציית המערכת דרך input+capture, לא דיאלוג Webcam מוטמע.
 */
export const PHOTO_PICKER_ACTION_BUTTON_CLASS =
  'h-12 flex-1 gap-2 border-cyan-500/40 bg-white/5 text-base font-semibold text-cyan-100 hover:bg-cyan-500/10';

export function photoPickerActionButtonClassName(extra?: string) {
  return cn(PHOTO_PICKER_ACTION_BUTTON_CLASS, extra);
}
