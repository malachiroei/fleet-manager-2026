// Central place for the app's current version.
// Keep the named export `version` because some UI components import it directly.
export const version = '2.7.8';
export default version;

/** גרסת כותרת ברירת מחדל בייצור לפני אישור "עדכן עכשיו" (מניעת הצגת גרסת בנדל לפני הסכמה) */
export const FLEET_PRO_DEFAULT_HEADER_VERSION = '2.5.12';

/** localStorage: גרסה שאושרה בייצור אחרי "עדכן עכשיו" — משמש השוואה מול version_manifest */
export const FLEET_PRO_ACK_VERSION_STORAGE_KEY = 'fleet-pro-acknowledged-version';

/** ניקוי SW/מניפסט בייצור: מוגדר לפני רענון אחרי "עדכן עכשיו"; ה-SW מקבל postMessage במקביל (אין localStorage ב-SW) */
export const FORCE_UPDATE_RELOAD_STORAGE_KEY = 'FORCE_UPDATE_RELOAD';

/** חלון bypass ל-SW בייצור — מקסימום 3 דקות; נסגר מיד ב-controllerchange או CLEAR */
export const FLEET_SW_BYPASS_TTL_MS = 3 * 60 * 1000;

/** sessionStorage: מזהה סשן יחיד ללחיצת "עדכן עכשיו" — נשלח ל-SW עם SET_FORCE_UPDATE_BYPASS */
export const FLEET_BYPASS_SESSION_STORAGE_KEY = 'fleet-sw-bypass-session-id';
