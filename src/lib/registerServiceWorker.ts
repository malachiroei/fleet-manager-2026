/**
 * Register minimal SW so the app meets PWA install criteria (HTTPS + manifest + SW).
 * Safe no-op if registration fails (e.g. dev without sw).
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        /* ignore – dev server may not serve sw.js as expected */
      });
  });
}
