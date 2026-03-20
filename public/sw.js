/**
 * Service Worker ידני — שקול ל-registerType: "prompt" של vite-plugin-pwa:
 * אין skipWaiting אוטומטי; רק אחרי הודעת SKIP_WAITING מהדף (לחיצה על "עדכן עכשיו").
 */
self.addEventListener("install", () => {
  // בכוונה ללא skipWaiting
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
