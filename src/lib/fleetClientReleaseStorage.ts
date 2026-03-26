/**
 * ניקוי מפתחות לקוח הקשורים לגרסה / עדכון — לפני רענון אחרי «עדכן עכשיו» גלובלי מוצלח.
 */
import {
  FLEET_BYPASS_SESSION_STORAGE_KEY,
  FLEET_VERSION_HEARTBEAT_SESSION_KEY,
  FORCE_UPDATE_RELOAD_STORAGE_KEY,
} from "@/constants/version";

const FLEET_LOCAL_STORAGE_KEYS_EXACT = new Set([
  "fleet-manager-app_version",
  "fleet-manager-last_update_date_iso",
  FORCE_UPDATE_RELOAD_STORAGE_KEY,
]);

export function clearFleetClientReleaseLocalStorage(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("fleet-pro-") || FLEET_LOCAL_STORAGE_KEYS_EXACT.has(k)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem("pwa-modal-for-version");
    sessionStorage.removeItem("pwa-waiting-reload");
    sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(FLEET_VERSION_HEARTBEAT_SESSION_KEY);
  } catch {
    // ignore
  }
}
