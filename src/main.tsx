import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config.ts";
import {
  FLEET_BYPASS_SESSION_STORAGE_KEY,
  FORCE_UPDATE_RELOAD_STORAGE_KEY,
} from "@/constants/version";
import {
  postClearForceUpdateBypassToServiceWorkers,
  unregisterNonV2ServiceWorkers,
} from "@/lib/pwaServiceWorkerControl";

/**
 * PWA: אין registerSW / virtual:pwa-register כאן.
 * vite-plugin-pwa מוגדר עם injectRegister: null — הרישום היחיד דרך UpdateModal → useRegisterSW → pwaPromptRegister.tsx
 */

/** ייצור: מסיר רישומי SW שאינם sw-v2.js (למשל sw.js ישן) לפני טעינת האפליקציה */
function isFleetManagerProProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "fleet-manager-pro.com" || h === "www.fleet-manager-pro.com";
}

void (async () => {
  /** כל הסביבות: ניקוי דגלי עדכון/SW bypass שלא יישארו תקועים אחרי רענון */
  try {
    if (localStorage.getItem(FORCE_UPDATE_RELOAD_STORAGE_KEY) === "true") {
      localStorage.removeItem(FORCE_UPDATE_RELOAD_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  postClearForceUpdateBypassToServiceWorkers();

  if (!isFleetManagerProProductionHost()) return;
  await unregisterNonV2ServiceWorkers();
})();

createRoot(document.getElementById("root")!).render(<App />);
