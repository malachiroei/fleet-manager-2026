/**
 * שרת הטסט (Vercel) — שלב ביניים לפני חזרה למקור (pro) עם ניקוי מטמון.
 */
export const FLEET_MANAGER_TEST_ORIGIN = 'https://fleet-manager-dev.vercel.app' as const;

/** אתר הייצור (מקור) */
export const FLEET_MANAGER_PRO_ORIGIN = 'https://fleet-manager-pro.com' as const;

/** כתובת שאליה מפנה כפתור העדכון — בלי reload מקומי; App.tsx מטפל בפרמטר ומחזיר ל-pro */
export const FLEET_MANAGER_FORCE_UPDATE_URL = `${FLEET_MANAGER_TEST_ORIGIN}/?action=force_update_pro` as const;

/** מסיר Service Workers, מנקה Cache Storage, ומנווט לדף הטסט עם action=force_update_pro */
export async function updateAppFromTestDeploy(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const swRegs = await navigator.serviceWorker.getRegistrations();
      for (const r of swRegs) {
        await r.unregister();
      }
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  window.location.href = FLEET_MANAGER_FORCE_UPDATE_URL;
}

/**
 * ניקוי מקסימלי **במקור הנוכחי בלבד** (דפדפן לא מאפשר למחוק Cache של דומיינים אחרים).
 * כולל: Service Workers, Cache Storage, sessionStorage, localStorage של דומיין הטסט.
 */
export async function purgeAllClientStorageThisOrigin(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const swRegs = await navigator.serviceWorker.getRegistrations();
      for (const r of swRegs) {
        await r.unregister();
      }
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }

  try {
    localStorage.clear();
  } catch {
    // ignore
  }

  // מחיקת מסדי IndexedDB הרשומים (אם קיימים) — API חדש יחסית
  try {
    const anyIdb = indexedDB as IDBFactory & { databases?: () => Promise<{ name: string }[]> };
    if (typeof anyIdb.databases === 'function') {
      const dbs = await anyIdb.databases();
      await Promise.all(
        dbs.map(
          (db) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            })
        )
      );
    }
  } catch {
    // ignore
  }
}
