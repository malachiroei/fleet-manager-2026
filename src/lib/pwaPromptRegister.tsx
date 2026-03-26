import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  applyServiceWorkerUpdateAndReload,
  bindServiceWorkerRegistration,
  clearAllBrowserCaches,
  FLEET_SW_SCRIPT,
  unregisterNonV2ServiceWorkers,
} from "@/lib/pwaServiceWorkerControl";
import {
  registerPwaUpdateModalDispatch,
  type FleetProUpdateModalReason,
  type PwaUpdateModalState,
} from "@/lib/pwaUpdateModalBridge";

/**
 * ייצור (קיר קשיח): רק hostname מדויק — ללא עדכון SW אוטומטי, רק מודאל + פעולה ידנית.
 */
export function isFleetProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "fleet-manager-pro.com" || h === "www.fleet-manager-pro.com";
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

/**
 * כותרת AppLayout: רקע טסט — דפלויי fleet-manager-dev* או פיתוח מקומי (לא כל host שאינו Pro).
 */
export function isFleetHeaderTestEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const h = (window.location.hostname || "").toLowerCase();
  if (isFleetManagerTestHost()) return true;
  if (h === "localhost" || h === "127.0.0.1" || h.startsWith("127.")) return true;
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
  acknowledgeAsVersion: string;
  privateAnchorFull: string;
  updateReason: FleetProUpdateModalReason;
};

const initialPrompt: PromptState = {
  needRefresh: false,
  changes: [],
  targetVersion: "",
  acknowledgeAsVersion: "",
  privateAnchorFull: "",
  updateReason: "global_version",
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
          acknowledgeAsVersion: prev.acknowledgeAsVersion || prev.targetVersion,
          privateAnchorFull: prev.privateAnchorFull,
          updateReason: prev.updateReason,
        };
        const next = reducer(asModal);
        return {
          needRefresh: next.open,
          changes: next.changes,
          targetVersion: next.targetVersion,
          acknowledgeAsVersion: next.acknowledgeAsVersion || next.targetVersion,
          privateAnchorFull: next.privateAnchorFull,
          updateReason: next.updateReason,
        };
      });
    });
    return () => registerPwaUpdateModalDispatch(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // EMERGENCY: global kill-switch from main.tsx (production only).
    if ((window as any).__FLEET_DISABLE_SW__ === true) {
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            try {
              await r.unregister();
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      })();
      return;
    }

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
      const isProduction =
        window.location.hostname.toLowerCase() === "fleet-manager-pro.com" ||
        window.location.hostname.toLowerCase() === "www.fleet-manager-pro.com";

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

  /** גרסאות מודאל — ref ל־callback (מניפסט גלובלי ל־ack, לא target_version אישי) */
  const promptTargetVersionRef = useRef("");
  const promptAckVersionRef = useRef("");
  useEffect(() => {
    promptTargetVersionRef.current = prompt.targetVersion;
    promptAckVersionRef.current = (prompt.acknowledgeAsVersion || prompt.targetVersion).trim();
  }, [prompt.targetVersion, prompt.acknowledgeAsVersion]);

  const updateServiceWorker = useCallback(async (reloadPage?: boolean, acknowledgedVersionOverride?: string) => {
    if (reloadPage !== true) return;
    toast.success("העדכון הושלם בהצלחה! האפליקציה תתרענן כעת.");
    const ack =
      (acknowledgedVersionOverride && String(acknowledgedVersionOverride).trim()) ||
      promptAckVersionRef.current.trim() ||
      promptTargetVersionRef.current.trim() ||
      undefined;
    await applyServiceWorkerUpdateAndReload({
      acknowledgedVersion: ack,
    });
  }, []);

  return {
    needRefresh: [prompt.needRefresh, setNeedRefresh] as const,
    updatePromptDetails: {
      changes: prompt.changes,
      targetVersion: prompt.targetVersion,
      acknowledgeAsVersion: (prompt.acknowledgeAsVersion || prompt.targetVersion).trim(),
      privateAnchorFull: prompt.privateAnchorFull,
      updateReason: prompt.updateReason,
    },
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
}

export { triggerServiceWorkerUpdateCheck, applyServiceWorkerUpdateAndReload } from "@/lib/pwaServiceWorkerControl";
