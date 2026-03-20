import { useEffect } from "react";
import { toast } from "sonner";
import {
  FLEET_SW_NEED_REFRESH_EVENT,
  skipWaitingAndReload,
} from "@/lib/registerServiceWorker";

/**
 * Shows a persistent toast when the SW has a waiting version (no auto-reload).
 */
export function ServiceWorkerUpdateListener() {
  useEffect(() => {
    const onNeedRefresh = () => {
      toast("זמין עדכון לאפליקציה", {
        id: "fleet-sw-waiting",
        description: "גרסה חדשה מוכנה. לחץ לעדכון — הדף ייטען מחדש.",
        duration: Infinity,
        action: {
          label: "עדכן עכשיו",
          onClick: () => {
            void skipWaitingAndReload();
          },
        },
      });
    };

    window.addEventListener(FLEET_SW_NEED_REFRESH_EVENT, onNeedRefresh);
    return () => window.removeEventListener(FLEET_SW_NEED_REFRESH_EVENT, onNeedRefresh);
  }, []);

  return null;
}
