import { FLEET_SW_SCRIPT, getFleetServiceWorkerRegistration } from '@/lib/pwaServiceWorkerControl';

/**
 * רישום SW ל-PWA. אין skipWaiting אוטומטי — רק אחרי פעולת משתמש (ראה skipWaitingFromUserAction).
 */
let registrationRef: ServiceWorkerRegistration | null = null;

const SW_UPDATE_EVENT = 'fleet-manager-sw-update-available';

function emitSwUpdateAvailable() {
  window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
}

export function subscribeToServiceWorkerUpdate(callback: () => void) {
  window.addEventListener(SW_UPDATE_EVENT, callback);
  return () => window.removeEventListener(SW_UPDATE_EVENT, callback);
}

export function getServiceWorkerRegistration(): ServiceWorkerRegistration | null {
  return registrationRef;
}

/** נקרא רק מלחיצה על "עדכן עכשיו" — מפעיל את ה-SW הממתין (sw-v2) */
export async function skipWaitingFromUserAction(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = registrationRef ?? (await getFleetServiceWorkerRegistration());
  if (reg?.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(FLEET_SW_SCRIPT, { scope: '/' })
      .then((registration) => {
        registrationRef = registration;

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state !== 'installed') return;
            // יש כבר SW פעיל = זה עדכון; בלי controller = התקנה ראשונה (אין מה להציג)
            if (navigator.serviceWorker.controller) {
              emitSwUpdateAvailable();
            }
          });
        });

        // אין registration.update() אוטומטי — רק אחרי פעולת משתמש (ראה pwaServiceWorkerControl)
      })
      .catch(() => {
        /* dev / אין sw-v2.js */
      });
  });
}
