/**
 * Service Worker — ללא skipWaiting אוטומטי.
 * רק כשהדף שולח { type: 'SKIP_WAITING' } (למשל מלחיצה על "עדכן עכשיו") — אז מתבצע skipWaiting.
 */
self.addEventListener('install', () => {
  // לא קוראים ל-self.skipWaiting() כאן — עדכון יישאר במצב "ממתין" עד החלטת המשתמש
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// רשת בלבד — בלי קאש אגרסיבי שיחביא גרסאות
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
