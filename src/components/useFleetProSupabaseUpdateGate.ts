/**
 * Gatekeeper לייצור: רק UpdateModal מייבא מודול זה.
 *
 * ב-fleet-manager-pro.com:
 * - רק Supabase (`fetchVersionManifestFromDb`) — אפס קריאות רשת לקבצי JSON סטטיים על הדומיין הזה.
 * - אין import/שימוש ב-getTestStaticManifestUrl או fetchVersionManifestFromUrl כאן.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  compareSemver,
  fetchVersionManifestFromDb,
  isFleetManagerProHostname,
  normalizeVersion,
} from "@/lib/versionManifest";
import { parseManifestChanges } from "@/lib/pwaManifest";
import { showPwaUpdateModal } from "@/lib/pwaUpdateModalBridge";
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_DEFAULT_HEADER_VERSION,
} from "@/constants/version";

export function useFleetProSupabaseUpdateGate(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFleetManagerProHostname()) return;

    let cancelled = false;
    let checkInFlight = false;

    const check = async () => {
      if (cancelled || checkInFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      checkInFlight = true;
      try {
        const fromDb = await fetchVersionManifestFromDb(supabase as any);
        if (!fromDb?.version) return;
        const latest = normalizeVersion(String(fromDb.version));
        let ack = normalizeVersion(FLEET_PRO_DEFAULT_HEADER_VERSION);
        try {
          const stored = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY);
          if (stored?.trim()) ack = normalizeVersion(stored.trim());
        } catch {
          // ignore
        }
        if (compareSemver(latest, ack) > 0) {
          const changes = parseManifestChanges(fromDb);
          showPwaUpdateModal({ targetVersion: latest, changes });
        }
      } catch {
        // ignore
      } finally {
        checkInFlight = false;
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), 5 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
