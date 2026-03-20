/* Minimal SW — install does NOT call skipWaiting(); user confirms via app (Update Now / toast). */
self.addEventListener('install', () => {
  /* stay in "waiting" until client sends SKIP_WAITING */
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
