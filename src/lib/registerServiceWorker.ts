/**
 * Unregister every SW and drop Cache Storage so an old worker/cache
 * cannot serve stale bundles after moving to a new asset origin.
 */
export async function clearServiceWorkerAndCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

/**
 * Register minimal SW so the app meets PWA install criteria (HTTPS + manifest + SW).
 * Safe no-op if registration fails (e.g. dev without sw).
 * Query string bumps SW script URL so browsers fetch a fresh worker after deploys.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js?v=fleet-pro-2026', { scope: '/' })
      .catch(() => {
        /* ignore – dev server may not serve sw.js as expected */
      });
  });
}
