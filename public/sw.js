/**
 * Service Worker ידני — שקול ל־vite-plugin-pwa:
 * - registerType: "prompt" / לא autoUpdate
 * - injectManifest: לוגיקה מפורשת בקובץ זה בלבד
 *
 * חשוב: אין self.skipWaiting() באירוע install או activate.
 * skipWaiting רק אחרי הודעה מהדף: postMessage({ type: "SKIP_WAITING" })
 */
self.addEventListener("install", (event) => {
  // במפורש לא קוראים ל-self.skipWaiting() — ממתינים ל-SKIP_WAITING מהלקוח
  event.waitUntil(Promise.resolve());
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
