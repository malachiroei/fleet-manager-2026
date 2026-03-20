import { useCallback, useEffect, useState } from "react";
import { version as currentVersion } from "@/constants/version";

export interface RegisterSWOptions {
  immediate?: boolean;
}

/**
 * שקול ל-useRegisterSW מ-vite-plugin-pwa עם registerType: "prompt":
 * אין עדכון אוטומטי — רק כשהמשתמש לוחץ updateServiceWorker(true).
 *
 * הערה: vite-plugin-pwa נשאר מחוץ לפרויקט כאן כי workbox-build נכשל בסביבת build מקומית
 * (תלות babel פגומה). ההתנהגות זהה ל"prompt".
 */
export function useRegisterSW(options?: RegisterSWOptions) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let cancelled = false;

    const VERSION_MANIFEST_URL = "https://fleet-manager-dev.vercel.app/v.json";
    const PWA_MODAL_VERSION_KEY = "pwa-modal-for-version";

    const fetchRemoteVersion = async (): Promise<string | null> => {
      try {
        const res = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return null;
        const manifest = (await res.json()) as { version?: unknown };
        const v = typeof manifest.version === "string" ? manifest.version.trim() : "";
        return v || null;
      } catch {
        return null;
      }
    };

    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem("pwa-waiting-reload") === "1") {
          sessionStorage.removeItem("pwa-waiting-reload");
          window.location.reload();
        }
      } catch {
        // ignore
      }
    };

    (async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            if (navigator.serviceWorker.controller) {
              void (async () => {
                // תנאי מפורש: אם הגרסה ב-v.json זהה לזו שבקוד -> לא להציג מודאל.
                const newVersion = await fetchRemoteVersion();
                    if (!newVersion) {
                      setNeedRefresh(false);
                      return;
                    }
                    if (newVersion === currentVersion) {
                      setNeedRefresh(false);
                      return;
                    }

                // מניעת פתיחה חוזרת לאותו version
                try {
                  if (newVersion) {
                    if (sessionStorage.getItem(PWA_MODAL_VERSION_KEY) === newVersion) return;
                    sessionStorage.setItem(PWA_MODAL_VERSION_KEY, newVersion);
                  }
                } catch {
                  // ignore
                }

                setNeedRefresh(true);
              })();
            } else {
              setOfflineReady(true);
            }
          });
        });

        if (options?.immediate) {
          await registration.update();
        }

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [options?.immediate]);

  const updateServiceWorker = useCallback(async (_reloadPage?: boolean) => {
    try {
      sessionStorage.setItem("pwa-waiting-reload", "1");
    } catch {
      // ignore
    }
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return {
    needRefresh: [needRefresh, setNeedRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
}
