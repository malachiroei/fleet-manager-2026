import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyServiceWorkerUpdateAndReload,
  bindServiceWorkerRegistration,
  clearAllBrowserCaches,
  FLEET_SW_SCRIPT,
  unregisterNonV2ServiceWorkers,
} from "@/lib/pwaServiceWorkerControl";
import {
  registerPwaUpdateModalDispatch,
  type PwaUpdateModalState,
} from "@/lib/pwaUpdateModalBridge";

/**
 * ייצור (קיר קשיח): רק hostname מדויק — ללא עדכון SW אוטומטי, רק מודאל + פעולה ידנית.
 */
export function isFleetProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "fleet-manager-pro.com";
}

/**
 * טסט בלבד — fleet-manager-dev.vercel.app (ואליאס/דפלויי preview של אותו פרויקט).
 * לא כולל fleet-manager.vercel.app (זה ייצור).
 */
export function isFleetManagerTestHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = (window.location.hostname || "").toLowerCase();
  if (h === "fleet-manager-dev.vercel.app") return true;
  if (h.endsWith(".vercel.app")) {
    const first = h.split(".")[0];
    if (first === "fleet-manager-dev" || first.startsWith("fleet-manager-dev-")) return true;
  }
  return false;
}

export interface RegisterSWOptions {
  /** @deprecated — בייצור אין update אוטומטי; בטסט (fleet-manager-dev) יש אחרי register */
  immediate?: boolean;
  onRegisteredSW?: (registration: ServiceWorkerRegistration) => void;
}

type PromptState = {
  needRefresh: boolean;
  changes: string[];
  targetVersion: string;
};

const initialPrompt: PromptState = {
  needRefresh: false,
  changes: [],
  targetVersion: "",
};

/**
 * fleet-manager-pro.com: ללא registration.update(), ללא תגובה ל-updatefound (אין עדכון SW אוטומטי).
 * זיהוי גרסה חדשה בייצור — רק ב-UpdateModal (מול Supabase), לא כאן.
 * שאר hosts: עדכון אוטומטי בזיהוי SW חדש (update + applyServiceWorkerUpdateAndReload).
 */
export function useRegisterSW(options?: RegisterSWOptions) {
  const [prompt, setPrompt] = useState<PromptState>(initialPrompt);
  const [offlineReady, setOfflineReady] = useState(false);
  const onRegisteredRef = useRef(options?.onRegisteredSW);
  onRegisteredRef.current = options?.onRegisteredSW;

  useEffect(() => {
    registerPwaUpdateModalDispatch((reducer) => {
      setPrompt((prev) => {
        const asModal: PwaUpdateModalState = {
          open: prev.needRefresh,
          changes: prev.changes,
          targetVersion: prev.targetVersion,
        };
        const next = reducer(asModal);
        return {
          needRefresh: next.open,
          changes: next.changes,
          targetVersion: next.targetVersion,
        };
      });
    });
    return () => registerPwaUpdateModalDispatch(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let cancelled = false;

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
      const isProduction = window.location.hostname === "fleet-manager-pro.com";

      try {
        try {
          await unregisterNonV2ServiceWorkers();
        } catch {
          // ignore
        }

        if (!isProduction && isFleetManagerTestHost()) {
          try {
            await clearAllBrowserCaches();
          } catch {
            // ignore
          }
        }

        registration = await navigator.serviceWorker.register(FLEET_SW_SCRIPT, { scope: "/" });
        if (cancelled) return;

        try {
          await unregisterNonV2ServiceWorkers();
        } catch {
          // ignore
        }

        bindServiceWorkerRegistration(registration);
        onRegisteredRef.current?.(registration);

        // ייצור: ללא registration.update() אוטומטי. טסט/שאר: עדכון אוטומטי לזיהוי SW חדש
        if (!isProduction) {
          try {
            await unregisterNonV2ServiceWorkers();
          } catch {
            // ignore
          }
          try {
            await registration.update();
          } catch {
            // ignore
          }
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            if (!navigator.serviceWorker.controller) {
              setOfflineReady(true);
              return;
            }
            /** ייצור: אין החלה אוטומטית ואין מודאל מ-SW — רק סקר מול Supabase */
            if (isProduction) return;
            void applyServiceWorkerUpdateAndReload();
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      bindServiceWorkerRegistration(null);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const setNeedRefresh = useCallback((value: boolean) => {
    setPrompt((p) => ({ ...p, needRefresh: value }));
  }, []);

  const updateServiceWorker = useCallback(async (reloadPage?: boolean) => {
    if (reloadPage !== true) return;
    await applyServiceWorkerUpdateAndReload();
  }, []);

  return {
    needRefresh: [prompt.needRefresh, setNeedRefresh] as const,
    updatePromptDetails: {
      changes: prompt.changes,
      targetVersion: prompt.targetVersion,
    },
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
}

export { triggerServiceWorkerUpdateCheck, applyServiceWorkerUpdateAndReload } from "@/lib/pwaServiceWorkerControl";
