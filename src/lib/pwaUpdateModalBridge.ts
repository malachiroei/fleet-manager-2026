/**
 * סנכרון בין Admin (ובעתיד מסכים נוספים) לבין מודאל עדכון ה-PWA.
 */

export type PwaUpdateModalState = {
  open: boolean;
  changes: string[];
  targetVersion: string;
};

type Reducer = (prev: PwaUpdateModalState) => PwaUpdateModalState;

/** נרשם מ-UpdateModal: מפעיל setState עם reducer על מצב המודאל */
type ApplyReducer = (reducer: Reducer) => void;

let applyReducer: ApplyReducer | null = null;

export function registerPwaUpdateModalDispatch(fn: ApplyReducer | null): void {
  applyReducer = fn;
}

function run(reducer: Reducer): void {
  applyReducer?.(reducer);
}

/** פותח את מודאל העדכון עם גרסה ורשימת שינויים (מקור: Supabase / טסט בלבד) */
export function showPwaUpdateModal(opts: { targetVersion: string; changes?: string[] }): void {
  const changes = Array.isArray(opts.changes)
    ? opts.changes.map((s) => String(s).trim()).filter(Boolean)
    : [];
  run(() => ({
    open: true,
    targetVersion: String(opts.targetVersion).trim(),
    changes,
  }));
}

export function hidePwaUpdateModal(): void {
  run((prev) => ({ ...prev, open: false }));
}
