// Central place for the app's current version.
// Keep the named export `version` because some UI components import it directly.
export const version = '2.5.12';
export default version;

/** גרסת כותרת ברירת מחדל בייצור לפני אישור "עדכן עכשיו" (מניעת הצגת גרסת בנדל לפני הסכמה) */
export const FLEET_PRO_DEFAULT_HEADER_VERSION = '2.5.11';

/** localStorage: גרסה שאושרה בייצור אחרי "עדכן עכשיו" — משמש השוואה מול version_manifest */
export const FLEET_PRO_ACK_VERSION_STORAGE_KEY = 'fleet-pro-acknowledged-version';
