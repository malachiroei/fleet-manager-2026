/**
 * סנכרון בין Admin (ובעתיד מסכים נוספים) לבין מודאל עדכון ה-PWA.
 */

export type FleetProUpdateModalReason = 'global_version' | 'permission_anchor';

export type PwaUpdateModalState = {
  open: boolean;
  changes: string[];
  /** גרסה להצגה במודאל (לרוב גרסת המניפסט הגלובלי) */
  targetVersion: string;
  /**
   * גרסה לכתיבה ל־fleet-pro-acknowledged-version בלחיצת "עדכן עכשיו".
   * חייב להתאים למניפסט הגלובלי — לא ל־profiles.target_version (2.7.44.1 וכו'),
   * אחרת הכותרת נשארת על מקטע רביעי והמודאל חוזר.
   */
  acknowledgeAsVersion: string;
  /** עוגן פרטי מלא ל־localStorage כשמדובר בעדכון הרשאות בלי שינוי גרסה גלובלית */
  privateAnchorFull: string;
  updateReason: FleetProUpdateModalReason;
};

type Reducer = (prev: PwaUpdateModalState) => PwaUpdateModalState;

/** נרשם מ-UpdateModal: מפעיל setState עם reducer על מצב המודאל */
type ApplyReducer = (reducer: Reducer) => void;

let applyReducer: ApplyReducer | null = null;

/** נטען מחדש רק אחרי רענון מלא של המסמך — חוסם הצגה חוזרת מ-interval/focus בפרו */
let fleetProUpdateModalSuppressedUntilPageUnload = false;

export function registerPwaUpdateModalDispatch(fn: ApplyReducer | null): void {
  applyReducer = fn;
}

export function isFleetProUpdateModalSuppressedUntilPageUnload(): boolean {
  return fleetProUpdateModalSuppressedUntilPageUnload;
}

/** אחרי פרסום גרסה / סנכרון — מאפשר שוב בדיקת עדכון בלי רענון */
export function clearFleetProUpdateModalSuppressFlag(): void {
  fleetProUpdateModalSuppressedUntilPageUnload = false;
}

function run(reducer: Reducer): void {
  applyReducer?.(reducer);
}

/** פותח את מודאל העדכון עם גרסה ורשימת שינויים (מקור: Supabase / טסט בלבד) */
export function showPwaUpdateModal(opts: {
  targetVersion: string;
  changes?: string[];
  /** ברירת מחדל = אותה גרסה כמו targetVersion */
  acknowledgeAsVersion?: string;
}): void {
  const changes = Array.isArray(opts.changes)
    ? opts.changes.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const tv = String(opts.targetVersion).trim();
  const ack = String(opts.acknowledgeAsVersion ?? opts.targetVersion).trim() || tv;
  run(() => ({
    open: true,
    targetVersion: tv,
    acknowledgeAsVersion: ack,
    changes,
  }));
}

export function hidePwaUpdateModal(options?: { dismissUntilPageUnload?: boolean }): void {
  if (options?.dismissUntilPageUnload === true) {
    fleetProUpdateModalSuppressedUntilPageUnload = true;
  }
  run((prev) => ({ ...prev, open: false }));
}
