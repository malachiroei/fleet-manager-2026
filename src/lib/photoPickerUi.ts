import { cn } from '@/lib/utils';

/**
 * עיצוב מאוחד לכפתורי «צלם מהמצלמה» / «בחר מהגלריה» (ב־variant outline).
 * מצלמה = אפליקציית המערכת דרך input+capture, לא דיאלוג Webcam מוטמע.
 */
export const PHOTO_PICKER_ACTION_BUTTON_CLASS =
  'h-12 flex-1 gap-2 border-slate-300 bg-white text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50 [&_svg]:text-slate-700 dark:border-cyan-500/40 dark:bg-white/5 dark:text-cyan-100 dark:[&_svg]:text-cyan-100 dark:shadow-none dark:hover:bg-cyan-500/10';

export function photoPickerActionButtonClassName(extra?: string) {
  return cn(PHOTO_PICKER_ACTION_BUTTON_CLASS, extra);
}
