/**
 * Unregister every SW and drop Cache Storage so an old worker/cache
 * cannot serve stale bundles after moving to a new asset origin.
 */
export async function clearServiceWorkerAndCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

/** Dispatched when a new SW is installed and waiting; UI should prompt — never auto-reload. */
export const FLEET_SW_NEED_REFRESH_EVENT = "fleet-sw-on-need-refresh";

const SW_SCRIPT = "/sw.js?v=fleet-sw-user-wait";

export type RegisterServiceWorkerOptions = {
  /**
   * Called when a new service worker is waiting. Do not call `location.reload()` here.
   * Default: dispatches `FLEET_SW_NEED_REFRESH_EVENT` on `window`.
   */
  onNeedRefresh?: () => void;
};

function emitNeedRefresh(options?: RegisterServiceWorkerOptions) {
  const cb = options?.onNeedRefresh;
  if (cb) {
    cb();
  } else {
    window.dispatchEvent(new CustomEvent(FLEET_SW_NEED_REFRESH_EVENT));
  }
}

function shouldPromptForWaiting(registration: ServiceWorkerRegistration): boolean {
  return Boolean(registration.waiting && navigator.serviceWorker.controller);
}

/**
 * Post SKIP_WAITING to the waiting worker, then reload when it takes control.
 * @returns true if a waiting worker was found (reload will follow)
 */
export async function skipWaitingAndReload(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (!waiting) return false;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      window.location.reload();
    },
    { once: true },
  );

  waiting.postMessage({ type: "SKIP_WAITING" });

  window.setTimeout(() => {
    window.location.reload();
  }, 4000);

  return true;
}

/**
 * Register minimal SW (PWA install criteria). New versions stay in `waiting` until
 * `skipWaitingAndReload()` — no automatic reload.
 */
export function registerServiceWorker(options?: RegisterServiceWorkerOptions) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const run = () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_SCRIPT, {
          scope: "/",
        });

        const maybeNotify = () => {
          if (shouldPromptForWaiting(registration)) {
            emitNeedRefresh(options);
          }
        };

        maybeNotify();

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              maybeNotify();
            }
          });
        });

        // Periodic check for new SW (no reload — waiting until user acts)
        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      } catch {
        /* dev / blocked */
      }
    })();
  };

  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
}
