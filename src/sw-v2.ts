/**
 * Service Worker — נבנה ע״י vite-plugin-pwa (injectManifest).
 * שם קובץ sw-v2.js — שובר רישום ישן של sw.js אצל משתמשים קיימים.
 * מדיניות:
 * - registerType: prompt ב-vite.config (לא autoUpdate)
 * - אין skipWaiting באירוע install — רק אחרי postMessage { type: "SKIP_WAITING" } מהדף
 * - fleet-manager-pro.com: קיר קשיח — לעולם לא skipWaiting אוטומטי; נשארים ב-waiting עד הודעה ידנית
 */
/// <reference lib="webworker" />
import { cacheNames, clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

/** זהה ללוגיקת הדף: fleet-manager-pro.com (+ www) */
function isFleetProductionOrigin(): boolean {
  try {
    const h = new URL(self.location.href).hostname.toLowerCase();
    return h === 'fleet-manager-pro.com' || h === 'www.fleet-manager-pro.com';
  } catch {
    return false;
  }
}

/**
 * חסימת מניפסטים בייצור: מופיע "json" + ("v-" או "version") ב-URL.
 * תופס v.json, v-dev-only.json, version-manifest.json וכו'.
 */
function isBlockedManifestJsonRequestOnPro(url: URL): boolean {
  const blob = `${url.pathname} ${url.search} ${url.href}`.toLowerCase();
  if (!blob.includes('json')) return false;
  if (blob.includes('v-') || blob.includes('version')) return true;
  return false;
}

/**
 * מקבלים מ־postMessage מהדף (אין localStorage ב-Service Worker).
 * בעת "עדכן עכשיו" בייצור — לא לחסום מניפסטים/נכסים כדי לאפשר השלמת עדכון.
 */
let forceUpdateBypassUntilMs = 0;
/** רק SET עם sessionId תקף — מונע פתיחת שער בלי לחיצת "עדכן עכשיו" */
let activeBypassSessionId: string | null = null;

const DEFAULT_BYPASS_TTL_MS = 3 * 60 * 1000;

function isForceUpdateBypassActive(): boolean {
  if (!activeBypassSessionId) return false;
  return Date.now() < forceUpdateBypassUntilMs;
}

/**
 * Supabase REST / Realtime — לעולם לא דרך cache ולא חסימת מניפסט.
 * כל השיטות (PATCH ל-heartbeat, POST, וכו') עוברות ישירות לרשת.
 */
function isSupabaseApiUrl(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return h.endsWith('.supabase.co');
}

/**
 * קו הגנה אחרון בייצור — אחרי דילוג Supabase; לפני workbox.
 */
self.addEventListener('fetch', (event) => {
  const ev = event as FetchEvent;
  let url: URL;
  try {
    url = new URL(ev.request.url);
  } catch {
    return;
  }
  if (isSupabaseApiUrl(url)) {
    // עוברים את אותו Request כדי לא לאבד headers (Authorization, apikey, Prefer, Content-Type, וכו').
    // fetch(Request, { cache }) משאיר את ה-headers מהבקשה המקורית; לא בונים Request חדש בלי כותרות.
    const req = ev.request;
    ev.respondWith(
      fetch(req.clone(), {
        cache: 'no-store',
        redirect: req.redirect,
        integrity: req.integrity,
      })
    );
    return;
  }

  if (ev.request.method !== 'GET' && ev.request.method !== 'HEAD') return;
  if (!isFleetProductionOrigin()) return;
  if (isForceUpdateBypassActive()) return;
  if (!isBlockedManifestJsonRequestOnPro(url)) return;
  ev.respondWith(
    new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Version/manifest JSON blocked on fleet-manager-pro.com',
      }),
      {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Fleet-Sw-Block': 'manifest-json',
        },
      }
    )
  );
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('install', (event) => {
  if (isFleetProductionOrigin()) {
    // ייצור: ללא skipWaiting — ה-SW החדש נשאר ב-waiting עד SKIP_WAITING מפורש מהדף
    event.waitUntil(Promise.resolve());
    return;
  }
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // fleet-manager-pro.com: אין skipWaiting ב-install — מגיעים ל-activate רק אחרי התקנה ראשונה או SKIP_WAITING מהדף
      const keep = new Set(
        [cacheNames.precache, cacheNames.runtime, cacheNames.googleAnalytics].filter(Boolean) as string[]
      );
      const keys = await caches.keys();
      await Promise.all(
        keys.map(async (name) => {
          if (keep.has(name)) return;
          try {
            await caches.delete(name);
          } catch {
            // ignore
          }
        })
      );
      await clientsClaim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; ttlMs?: number; sessionId?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') {
    // eslint-disable-next-line no-console -- ניפוי תקלות skipWaiting בפרודקשן
    console.log('SW-V2: Attempting to skip waiting');
    self.skipWaiting().catch(() => {
      // ignore
    });
  }
  if (data?.type === 'SET_FORCE_UPDATE_BYPASS') {
    const sid = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
    if (!sid) {
      return;
    }
    const ttl =
      typeof data.ttlMs === 'number' && Number.isFinite(data.ttlMs) && data.ttlMs > 0
        ? data.ttlMs
        : DEFAULT_BYPASS_TTL_MS;
    activeBypassSessionId = sid;
    forceUpdateBypassUntilMs = Date.now() + ttl;
  }
  if (data?.type === 'CLEAR_FORCE_UPDATE_BYPASS') {
    forceUpdateBypassUntilMs = 0;
    activeBypassSessionId = null;
  }
});
