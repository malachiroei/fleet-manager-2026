/**
 * בקרה מרכזית ל-Service Worker: אין update() אוטומטי בטעינה.
 * קריאה ל-triggerServiceWorkerUpdateCheck() רק אחרי פעולת משתמש (למשל "בדוק עדכונים").
 * applyServiceWorkerUpdateAndReload() רק אחרי אישור מפורש (למשל "עדכן").
 *
 * רישום ברירת מחדל: /sw-v2.js (לא sw.js ישן).
 */

import {
  version as bundleVersion,
  FLEET_BYPASS_SESSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
  FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY,
  FORCE_UPDATE_RELOAD_STORAGE_KEY,
  FLEET_SW_BYPASS_TTL_MS,
} from "@/constants/version";
import { normalizeVersion, toCanonicalThreePartVersion } from "@/lib/versionManifest";

export type CommitFleetProAckOptions = {
  /** ערך מלא של `ui_denied_features_anchor_version` בעדכון שקט (עוגן פרטי) */
  privateAnchorFull?: string;
};

/**
 * פרו: «עדכן עכשיו» — כתיבה סינכרונית ל־localStorage, המתנה קצרה, רענון קשיח (מונע לולאת מודאל).
 * `privateAnchorFull`: מאשר עוגן פרטי — ה־ack נשמר כגרסת המניפסט הגלובלי (ללא שינוי מספר בכותרת מעבר ליישור semver).
 */
export async function commitFleetProAcknowledgedVersionAndHardReload(
  rawAckVersion: string,
  options?: CommitFleetProAckOptions
): Promise<void> {
  if (typeof window === "undefined") return;
  const n = normalizeVersion(String(rawAckVersion ?? "").trim());
  const canonical = toCanonicalThreePartVersion(n) || n;
  if (!canonical) return;
  try {
    localStorage.setItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY, canonical);
  } catch {
    // ignore
  }
  const pa = String(options?.privateAnchorFull ?? "").trim();
  if (pa) {
    try {
      localStorage.setItem(FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY, pa);
    } catch {
      // ignore
    }
  }
  try {
    window.dispatchEvent(new Event(FLEET_PRO_ACK_VERSION_UPDATED_EVENT));
  } catch {
    // ignore
  }
  await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
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

export const FLEET_SW_SCRIPT = "/sw-v2.js" as const;

const SW_MSG_SET_FORCE_BYPASS = "SET_FORCE_UPDATE_BYPASS" as const;
const SW_MSG_CLEAR_FORCE_BYPASS = "CLEAR_FORCE_UPDATE_BYPASS" as const;

export function createFleetBypassSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `fleet-bypass-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type PostForceBypassOptions = {
  /** חובה — רק לחיצת "עדכן עכשיו" יוצרת מזהה; בלי sessionId ה-SW לא פותח שער */
  sessionId: string;
  ttlMs?: number;
};

/** ה-SW לא יכול לקרוא localStorage — מעבירים דגל דרך postMessage לכל ה-workers הפעילים */
export function postForceUpdateBypassToServiceWorkers(options: PostForceBypassOptions): void {
  const sessionId = String(options.sessionId ?? "").trim();
  if (!sessionId) return;
  const ttlMs =
    typeof options.ttlMs === "number" && Number.isFinite(options.ttlMs) && options.ttlMs > 0
      ? options.ttlMs
      : FLEET_SW_BYPASS_TTL_MS;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const payload = { type: SW_MSG_SET_FORCE_BYPASS, ttlMs, sessionId };
  try {
    navigator.serviceWorker.controller?.postMessage(payload);
  } catch {
    // ignore
  }
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) {
      try {
        r.active?.postMessage(payload);
        r.waiting?.postMessage(payload);
        r.installing?.postMessage(payload);
      } catch {
        // ignore
      }
    }
  });
}

export function postClearForceUpdateBypassToServiceWorkers(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const payload = { type: SW_MSG_CLEAR_FORCE_BYPASS };
  try {
    navigator.serviceWorker.controller?.postMessage(payload);
  } catch {
    // ignore
  }
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) {
      try {
        r.active?.postMessage(payload);
        r.waiting?.postMessage(payload);
        r.installing?.postMessage(payload);
      } catch {
        // ignore
      }
    }
  });
}

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
  const h = window.location.hostname.toLowerCase();
  if (h === "fleet-manager-pro.com" || h === "www.fleet-manager-pro.com") return;
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
export type ApplyServiceWorkerUpdateOptions = {
  /** גרסה ממודאל Supabase (הבנדל הישן עדיין לא מכיר אותה) */
  acknowledgedVersion?: string;
};

export async function applyServiceWorkerUpdateAndReload(
  options?: ApplyServiceWorkerUpdateOptions
): Promise<void> {
  if (typeof window === "undefined") return;

  const h0 = window.location.hostname.toLowerCase();
  const isProduction = h0 === "fleet-manager-pro.com" || h0 === "www.fleet-manager-pro.com";

  /**
   * Pro: אחרי לחיצה "עדכן עכשיו" בלבד —
   * דגל + postMessage ל-SW (ביטול חסימת מניפסט זמנית), גרסה שאושרה מהמודאל,
   * ניקוי caches, update(), המתנה ל-waiting, SKIP_WAITING, reload.
   */
  if (isProduction) {
    const bypassSessionId = createFleetBypassSessionId();
    try {
      sessionStorage.setItem(FLEET_BYPASS_SESSION_STORAGE_KEY, bypassSessionId);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(FORCE_UPDATE_RELOAD_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    postForceUpdateBypassToServiceWorkers({ sessionId: bypassSessionId });

    let ackToStore = options?.acknowledgedVersion?.trim();
    if (!ackToStore) {
      try {
        const { fetchVersionManifestFromDb } = await import("@/lib/versionManifest");
        const { supabase } = await import("@/integrations/supabase/client");
        const fromDb = await fetchVersionManifestFromDb(supabase as any);
        const v = fromDb?.version ? String(fromDb.version).trim() : "";
        if (v) ackToStore = normalizeVersion(v);
      } catch {
        // ignore
      }
    }
    const rawAck = normalizeVersion(ackToStore || bundleVersion);
    const ackNormalized =
      toCanonicalThreePartVersion(rawAck) || rawAck || toCanonicalThreePartVersion(bundleVersion) || bundleVersion;
    try {
      localStorage.setItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY, ackNormalized);
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(FLEET_PRO_ACK_VERSION_UPDATED_EVENT));
      }
    } catch {
      // ignore
    }

    try {
      await clearAllBrowserCaches();
    } catch {
      // ignore
    }

    postForceUpdateBypassToServiceWorkers({ sessionId: bypassSessionId });

    if (!("serviceWorker" in navigator)) {
      postClearForceUpdateBypassToServiceWorkers();
      try {
        sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
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
    postForceUpdateBypassToServiceWorkers({ sessionId: bypassSessionId });

    try {
      await reg?.update();
    } catch {
      // ignore
    }

    reg = (await getFleetServiceWorkerRegistration()) ?? reg;

    /** update() נפתר לפני ש-waiting מוגדר — ממתינים להתקנת SW חדש */
    for (let i = 0; i < 300; i++) {
      if (i % 5 === 0) {
        reg = (await getFleetServiceWorkerRegistration()) ?? reg;
      }
      if (reg?.waiting) break;
      const inst = reg?.installing;
      if (inst && inst.state === "installed" && reg.waiting) break;
      await new Promise<void>((r) => window.setTimeout(r, 200));
    }

    reg = (await getFleetServiceWorkerRegistration()) ?? reg;
    if (reg?.installing && !reg.waiting) {
      await new Promise<void>((resolve) => {
        const sw = reg!.installing!;
        const finish = () => resolve();
        if (sw.state === "installed") {
          finish();
          return;
        }
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed") finish();
        });
      });
      reg = (await getFleetServiceWorkerRegistration()) ?? reg;
    }
    postForceUpdateBypassToServiceWorkers({ sessionId: bypassSessionId });

    let waiting = reg?.waiting;
    if (!waiting) {
      try {
        await reg?.update();
      } catch {
        // ignore
      }
      for (let j = 0; j < 50; j++) {
        reg = (await getFleetServiceWorkerRegistration()) ?? reg;
        if (reg?.waiting) break;
        await new Promise<void>((r) => window.setTimeout(r, 200));
      }
      waiting = reg?.waiting;
    }

    if (waiting) {
      try {
        waiting.postMessage({ type: "SKIP_WAITING" });
      } catch {
        // ignore
      }
    } else {
      /** אין SW ממתין אחרי פריסה — ביטול רישום ורענון כדי למשוך נכסים חדשים */
      postClearForceUpdateBypassToServiceWorkers();
      try {
        sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
      try {
        await reg?.unregister();
      } catch {
        // ignore
      }
      await new Promise<void>((r) => window.setTimeout(r, 400));
      window.location.reload();
      return;
    }

    if (navigator.serviceWorker.controller && waiting) {
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(() => resolve(), 8000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            postClearForceUpdateBypassToServiceWorkers();
            try {
              sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
            } catch {
              // ignore
            }
            window.clearTimeout(t);
            resolve();
          },
          { once: true }
        );
      });
    } else {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }

    postClearForceUpdateBypassToServiceWorkers();
    try {
      sessionStorage.removeItem(FLEET_BYPASS_SESSION_STORAGE_KEY);
    } catch {
      // ignore
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
