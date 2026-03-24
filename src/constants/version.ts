// Central place for the app's current version.
// Keep the named export `version` because some UI components import it directly.
/** גרסה מקומית לפרסום — לעדכן יחד עם `src/config/version_snapshot.json` */
export const APP_VERSION = '1.0.1';

export const version = '2.7.67';
export default version;

/** גרסת כותרת ברירת מחדל בייצור לפני אישור "עדכן עכשיו" (מניעת הצגת גרסת בנדל לפני הסכמה) */
export const FLEET_PRO_DEFAULT_HEADER_VERSION = '2.5.12';

/** localStorage: גרסה שאושרה בייצור אחרי "עדכן עכשיו" — משמש השוואה מול app_version (וגרסת מניפסט אם קיימת) */
export const FLEET_PRO_ACK_VERSION_STORAGE_KEY = 'fleet-pro-acknowledged-version';

/**
 * localStorage: ערך מלא של `ui_denied_features_anchor_version` שאושר אחרי «עדכן עכשיו» לעוגן פרטי (`*-p…`).
 * מאפשר עדכון שקט בלי שינוי גרסה גלובלית — ה־ack נשמר כגרסת המניפסט הגלובלי.
 */
export const FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY = 'fleet-pro-private-anchor-acknowledged';

/** מחק את כל המפתחות שמתחילים בזה בעת אישור עדכון גלובלי (ניקוי עוגנים פרטיים ישנים) */
export const FLEET_PRO_PRIVATE_ANCHOR_KEY_PREFIX = 'fleet-pro-private-anchor' as const;

/** אירוע חלון — אחרי עדכון מפתח האישור (אותו טאב; `storage` לא נורה ב-local) */
export const FLEET_PRO_ACK_VERSION_UPDATED_EVENT = 'fleet-pro-ack-version-updated';

/** ניקוי SW/מניפסט בייצור: מוגדר לפני רענון אחרי "עדכן עכשיו"; ה-SW מקבל postMessage במקביל (אין localStorage ב-SW) */
export const FORCE_UPDATE_RELOAD_STORAGE_KEY = 'FORCE_UPDATE_RELOAD';

/** חלון bypass ל-SW בייצור — מקסימום 3 דקות; נסגר מיד ב-controllerchange או CLEAR */
export const FLEET_SW_BYPASS_TTL_MS = 3 * 60 * 1000;

/** sessionStorage: מזהה סשן יחיד ללחיצת "עדכן עכשיו" — נשלח ל-SW עם SET_FORCE_UPDATE_BYPASS */
export const FLEET_BYPASS_SESSION_STORAGE_KEY = 'fleet-sw-bypass-session-id';

/** sessionStorage: נשלח heartbeat גרסה פעם אחת לכל סשן+משתמש+בנדל */
export const FLEET_VERSION_HEARTBEAT_SESSION_KEY = 'fleet-version-heartbeat';
