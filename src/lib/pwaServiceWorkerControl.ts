/**
 * בקרה מרכזית ל-Service Worker: אין update() אוטומטי בטעינה.
 * קריאה ל-triggerServiceWorkerUpdateCheck() רק אחרי פעולת משתמש (למשל "בדוק עדכונים").
 * applyServiceWorkerUpdateAndReload() רק אחרי אישור מפורש (למשל "עדכן").
 *
 * רישום ברירת מחדל: /sw-v2.js (לא sw.js ישן).
 */

import {
  version as bundleVersion,
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
} from "@/constants/version";

export const FLEET_SW_SCRIPT = "/sw-v2.js" as const;

/**
 * מסיר רישומי SW שאין בהם שום worker עם sw-v2.js.
 * חשוב: לא לבטל רישום שבו active=ישן אבל waiting=sw-v2 (אחרת מאבדים את העדכון).
 */
/** מוחק את כל Cache Storage (שמות cache) — לשימוש ב-cache bust אגרסיבי */
export async function clearAllBrowserCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(async (name) => {
        try {
          await caches.delete(name);
        } catch {
          // ignore
        }
      })
    );
  } catch {
    // ignore
  }
}

export async function unregisterNonV2ServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const urls = [r.active?.scriptURL, r.waiting?.scriptURL, r.installing?.scriptURL].filter(
        Boolean
      ) as string[];
      if (urls.length === 0) continue;
      const hasV2 = urls.some((u) => u.includes("sw-v2.js"));
      if (!hasV2) {
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
}

let registrationRef: ServiceWorkerRegistration | null = null;

export function bindServiceWorkerRegistration(reg: ServiceWorkerRegistration | null): void {
  registrationRef = reg;
}

function scriptUrlOf(reg: ServiceWorkerRegistration): string {
  return (
    reg.installing?.scriptURL ||
    reg.waiting?.scriptURL ||
    reg.active?.scriptURL ||
    ""
  );
}

/**
 * רישום פעיל של Fleet — מעדיף ref מ-useRegisterSW, אחרת חיפוש לפי sw-v2.js, אחרת getRegistration().
 */
export async function getFleetServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  if (registrationRef) return registrationRef;

  try {
    const all = await navigator.serviceWorker.getRegistrations();
    for (const r of all) {
      const u = scriptUrlOf(r);
      if (u.includes("sw-v2.js")) {
        bindServiceWorkerRegistration(r);
        return r;
      }
    }
  } catch {
    // ignore
  }

  try {
    const fallback = await navigator.serviceWorker.getRegistration();
    if (fallback) bindServiceWorkerRegistration(fallback);
    return fallback ?? null;
  } catch {
    return null;
  }
}

export async function triggerServiceWorkerUpdateCheck(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  /** ייצור: ללא registration.update() — בדיקת עדכונים רק מול Supabase (ראה pwaPromptRegister) */
  if (window.location.hostname === "fleet-manager-pro.com") return;
  const reg = await getFleetServiceWorkerRegistration();
  if (!reg) return;
  await reg.update();
}

/**
 * אישור עדכון PWA (מקור / Pro) — cache bust אגרסיבי:
 * 1) navigator.serviceWorker.getRegistrations() → ביטול כל רישום שאינו sw-v2.js
 * 2) מחיקת כל Cache Storage (caches.delete לכל שם)
 * 3) registration.update()
 * 4) SKIP_WAITING ל-sw-v2.js הממתין
 * 5) המתנה ל-controllerchange (עד ~5s)
 * 6) window.location.reload(true) כשאפשר
 */
export async function applyServiceWorkerUpdateAndReload(): Promise<void> {
  if (typeof window === "undefined") return;

  const isProduction = window.location.hostname === "fleet-manager-pro.com";

  /**
   * Pro: אחרי לחיצה "עדכן עכשיו" בלבד —
   * רישום גרסה שאושרה, ניקוי caches, registration.update(), SKIP_WAITING ל-SW הממתין, reload.
   */
  if (isProduction) {
    try {
      localStorage.setItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY, bundleVersion);
    } catch {
      // ignore
    }

    try {
      await clearAllBrowserCaches();
    } catch {
      // ignore
    }

    if (!("serviceWorker" in navigator)) {
      const loc0 = window.location as Location & { reload?: (forceReload?: boolean) => void };
      if (typeof loc0.reload === "function") {
        try {
          loc0.reload(true);
          return;
        } catch {
          // ignore
        }
      }
      window.location.reload();
      return;
    }

    let reg = await getFleetServiceWorkerRegistration();

    try {
      await reg?.update();
    } catch {
      // ignore
    }

    reg = (await getFleetServiceWorkerRegistration()) ?? reg;

    const waiting = reg?.waiting;
    if (waiting) {
      try {
        waiting.postMessage({ type: "SKIP_WAITING" });
      } catch {
        // ignore
      }
    }

    if (navigator.serviceWorker.controller && waiting) {
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(() => resolve(), 5000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(t);
            resolve();
          },
          { once: true }
        );
      });
    } else {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }

    const loc = window.location as Location & { reload?: (forceReload?: boolean) => void };
    if (typeof loc.reload === "function") {
      try {
        loc.reload(true);
        return;
      } catch {
        // ignore
      }
    }
    window.location.reload();
    return;
  }

  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }

  try {
    await unregisterNonV2ServiceWorkers();
  } catch {
    // ignore
  }

  try {
    await clearAllBrowserCaches();
  } catch {
    // ignore
  }

  let reg = await getFleetServiceWorkerRegistration();

  try {
    await reg?.update();
  } catch {
    // ignore
  }

  reg = (await getFleetServiceWorkerRegistration()) ?? reg;

  const waiting = reg?.waiting;
  if (waiting) {
    try {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // ignore
    }
  }

  if (navigator.serviceWorker.controller && waiting) {
    await new Promise<void>((resolve) => {
      const t = window.setTimeout(() => resolve(), 5000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });
  } else {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
  }

  const loc = window.location as Location & { reload?: (forceReload?: boolean) => void };
  if (typeof loc.reload === "function") {
    try {
      loc.reload(true);
      return;
    } catch {
      // ignore
    }
  }
  window.location.reload();
}
