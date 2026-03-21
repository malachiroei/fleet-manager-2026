/**
 * הערת ארכיטקטורה:
 * בפועל ה-Service Worker ב-production נבנה מ-`sw-v2.ts` ויוצא כ-`/sw-v2.js`
 * (injectManifest ב-vite.config). אין פלט מקובץ זה.
 *
 * לוגיקת skipWaiting, ניקוי cache ו-workbox — רק ב-`sw-v2.ts`.
 */
export {};
