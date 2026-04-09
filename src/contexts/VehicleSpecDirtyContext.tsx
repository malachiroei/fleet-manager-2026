import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';

const MSG =
  'יש שינויים שלא נשמרו. הנתונים לא יתעדכנו בלי ללחוץ "אישור שינויים". לצאת בכל זאת?';

export const DIRTY_SOURCE_SPEC = 'spec';
export const DIRTY_SOURCE_MAINTENANCE = 'maintenance';
/** עריכת נהג — סקשן בודד או עריכה מלאה */
export const DIRTY_SOURCE_DRIVER_EDIT = 'driver_edit';
/** אשף מסירת/החזרת רכב */
export const DIRTY_SOURCE_HANDOVER_WIZARD = 'handover_wizard';
/** טפסי הוצאה/אירוע בתיקיות רכב לפני שמירה */
export const DIRTY_SOURCE_FOLDERS_DRAFT = 'folders_draft';
/** עריכת רכב (דף EditVehiclePage) */
export const DIRTY_SOURCE_VEHICLE_EDIT = 'vehicle_edit';
/** מסך מסירת רכב קבוע (/handover/delivery) — בחירת רכב/נהג, ק״מ וכו' */
export const DIRTY_SOURCE_VEHICLE_DELIVERY = 'vehicle_delivery';

/** נתיב דף מסירה — לניקוי כפוי כשעוזבים */
export const VEHICLE_DELIVERY_PATH = '/handover/delivery';

/** דף טופס מסירת רכב (כולל `?mode=replacement`) — ניווט SPA ממנו עלול להישאר מדסנכרן; עדיף `location.assign` */
export function isVehicleDeliveryRoute(pathname: string): boolean {
  return pathname === VEHICLE_DELIVERY_PATH || pathname.startsWith(`${VEHICLE_DELIVERY_PATH}/`);
}

const MSG_DELIVERY_UNSAVED = 'ישנם שינויים לא שמורים, האם לצאת בכל זאת?';

type VehicleSpecDirtyContextValue = {
  isDirty: boolean;
  setDirty: (sourceId: string, dirty: boolean) => void;
  tryNavigate: (to: string) => void;
  /** סינכרוני — לשימוש ב-onClick לפני ש-state הספיק להתעדכן */
  getIsDirty: () => boolean;
  /** רק מקור מסוים (למשל maintenance) — לפני מעבר לשונית */
  getSourceDirty: (sourceId: string) => boolean;
  /**
   * מסך מסירה (אופציונלי): דגל יציאה — רק אם קומפוננטה צריכה לדעת
   */
  setDeliveryExiting: (exiting: boolean) => void;
  getDeliveryExiting: () => boolean;
  getDeliveryExitConfirmed: () => boolean;
  /** הנתיב הקודם בתוך האפליקציה (לכפתור חזרה אחיד) */
  getLastPath: () => string | null;
};

const defaultValue: VehicleSpecDirtyContextValue = {
  isDirty: false,
  setDirty: () => {},
  tryNavigate: () => {},
  getIsDirty: () => false,
  getSourceDirty: () => false,
  setDeliveryExiting: () => {},
  getDeliveryExiting: () => false,
  getDeliveryExitConfirmed: () => false,
  getLastPath: () => null,
};

const VehicleSpecDirtyContext = createContext<VehicleSpecDirtyContextValue>(defaultValue);

export function VehicleSpecDirtyProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [version, setVersion] = useState(0);
  /** מקור אמת סינכרוני — מתעדכן מיד ב-setDirty */
  const sourcesRef = useRef<Record<string, true>>({});
  /** יציאה ממסך מסירה אושרה — לא להחזיר dirty עד unmount */
  const deliveryExitingRef = useRef(false);
  /** אחרי confirm ב-tryNavigate — VehicleDeliveryPage לא יחזיר dirty באותו רנדר */
  const deliveryExitConfirmedRef = useRef(false);

  // ניהול נתיב קודם/נוכחי לכל הניווטים באפליקציה
  const currentPathRef = useRef<string | null>(null);
  const lastPathRef = useRef<string | null>(null);

  const getDeliveryExitConfirmed = useCallback(() => deliveryExitConfirmedRef.current, []);

  // ניקוי כפוי כשהנתיב כבר לא דף מסירה — רק ב-useEffect (לא בזמן render)
  useEffect(() => {
    const pathname = location.pathname;
    if (!isVehicleDeliveryRoute(pathname)) {
      if (
        sourcesRef.current[DIRTY_SOURCE_VEHICLE_DELIVERY] ||
        sourcesRef.current[DIRTY_SOURCE_HANDOVER_WIZARD] ||
        deliveryExitConfirmedRef.current
      ) {
        delete sourcesRef.current[DIRTY_SOURCE_VEHICLE_DELIVERY];
        delete sourcesRef.current[DIRTY_SOURCE_HANDOVER_WIZARD];
        deliveryExitConfirmedRef.current = false;
        deliveryExitingRef.current = false;
        setVersion((v) => v + 1);
      }
    } else {
      deliveryExitConfirmedRef.current = false;
    }
  }, [location.pathname]);

  // מעקב כללי אחרי הנתיב האחרון לצורך כפתור חזרה אחיד
  useEffect(() => {
    const newPath = `${location.pathname}${location.search}`;
    if (currentPathRef.current && currentPathRef.current !== newPath) {
      lastPathRef.current = currentPathRef.current;
    }
    currentPathRef.current = newPath;
  }, [location.pathname, location.search]);

  const setDeliveryExiting = useCallback((exiting: boolean) => {
    deliveryExitingRef.current = exiting;
  }, []);

  const getDeliveryExiting = useCallback(() => deliveryExitingRef.current, []);

  const setDirty = useCallback((sourceId: string, dirty: boolean) => {
    if (dirty) sourcesRef.current[sourceId] = true;
    else delete sourcesRef.current[sourceId];
    setVersion((v) => v + 1);
  }, []);

  const isDirty = Object.keys(sourcesRef.current).length > 0;

  const tryNavigate = useCallback((to: string) => {
    const resolveAssignTarget = (t: string) =>
      t.startsWith('http://') || t.startsWith('https://')
        ? t
        : t.startsWith('/')
          ? `${window.location.origin}${t}`
          : `${window.location.origin}/${t}`;

    if (Object.keys(sourcesRef.current).length === 0) {
      // גם בלי dirty — מדף המסירה navigate() לפעמים לא מעדכן DOM/URL כראוי (אותה תקלה כמו אחרי flushSync)
      if (isVehicleDeliveryRoute(location.pathname)) {
        window.location.assign(resolveAssignTarget(to));
        return;
      }
      navigate(to);
      return;
    }
    const confirmMsg = sourcesRef.current[DIRTY_SOURCE_VEHICLE_DELIVERY]
      ? MSG_DELIVERY_UNSAVED
      : MSG;
    if (!window.confirm(confirmMsg)) return;
    // סדר קשיח: קודם setDirty(false) בסינכרון — רק אחרי commit, navigate (מונע התקעות)
    deliveryExitConfirmedRef.current = true;
    flushSync(() => {
      setDirty(DIRTY_SOURCE_VEHICLE_DELIVERY, false);
    });
    delete sourcesRef.current[DIRTY_SOURCE_VEHICLE_DELIVERY];
    deliveryExitingRef.current = false;
    // אחרי ניקוי מסירה — רוקנים הכל כדי שלא יישאר dirty ממקור אחר שיחסום ניווט
    sourcesRef.current = {};
    setVersion((v) => v + 1);
    // navigate() אחרי flushSync עלול להשאיר את ה-URL בדפדפן מעודכן בעוד ש-React Router
    // והדOM נשארים על דף המסירה (דסינכרון). ניווט מלא מכריח טעינה נכונה של היעד.
    window.location.assign(resolveAssignTarget(to));
  }, [navigate, setDirty, location.pathname]);

  const getIsDirty = useCallback(() => Object.keys(sourcesRef.current).length > 0, []);

  const getSourceDirty = useCallback((sourceId: string) => !!sourcesRef.current[sourceId], []);

  const getLastPath = useCallback(() => lastPathRef.current ?? null, []);

  const value = useMemo(
    () => ({
      isDirty,
      setDirty,
      tryNavigate,
      getIsDirty,
      getSourceDirty,
      setDeliveryExiting,
      getDeliveryExiting,
      getDeliveryExitConfirmed,
      getLastPath,
    }),
    [
      isDirty,
      setDirty,
      tryNavigate,
      getIsDirty,
      getSourceDirty,
      setDeliveryExiting,
      getDeliveryExiting,
      getDeliveryExitConfirmed,
      getLastPath,
      version,
    ]
  );

  return (
    <VehicleSpecDirtyContext.Provider value={value}>
      {children}
    </VehicleSpecDirtyContext.Provider>
  );
}

export function useVehicleSpecDirty() {
  return useContext(VehicleSpecDirtyContext);
}

export { MSG as VEHICLE_SPEC_UNSAVED_MSG, MSG_DELIVERY_UNSAVED };
