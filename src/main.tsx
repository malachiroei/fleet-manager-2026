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

  /**
   * EMERGENCY: disable Service Worker in production temporarily.
   * Rationale: sw.js / old SW errors can block the app on fleet-manager-pro.com.
   * Remove this block once the SW is verified stable again.
   */
  (window as any).__FLEET_DISABLE_SW__ = true;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        try {
          await r.unregister();
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  // Also remove old non-v2 SW leftovers (redundant after full unregister; kept as safety).
  await unregisterNonV2ServiceWorkers();
})();

createRoot(document.getElementById("root")!).render(<App />);
