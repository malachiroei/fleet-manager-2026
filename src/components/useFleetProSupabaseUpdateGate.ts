/**
 * Gatekeeper לייצור: רק UpdateModal מייבא מודול זה.
 *
 * ב-fleet-manager-pro.com:
 * - רק Supabase (`fetchVersionManifestFromDb`) — אפס קריאות רשת לקבצי JSON סטטיים על הדומיין הזה.
 * - אין import/שימוש ב-getTestStaticManifestUrl או fetchVersionManifestFromUrl כאן.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { commitFleetProAcknowledgedVersionAndHardReload } from "@/lib/pwaServiceWorkerControl";
import {
  compareSemverExtended,
  fetchAppVersionFromDb,
  fetchVersionManifestFromDb,
  fleetMergeGlobalPublishedVersions,
  isFleetManagerProHostname,
  normalizeVersion,
  parsePrivateUiAnchor,
  parseSemverSegments,
  toCanonicalThreePartVersion,
} from "@/lib/versionManifest";
import {
  hidePwaUpdateModal,
  isFleetProUpdateModalSuppressedUntilPageUnload,
  showPwaUpdateModal,
} from "@/lib/pwaUpdateModalBridge";
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_DEFAULT_HEADER_VERSION,
  FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY,
} from "@/constants/version";

/** מניעת הצפת טוסט הרשאות באותו עוגן פרטי עד רענון מלא של המסמך */
let fleetProPermissionToastAnchorShown = "";

export function useFleetProSupabaseUpdateGate(): void {
  const { user } = useAuth();

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
        const [fromDb, appVerRaw] = await Promise.all([
          fetchVersionManifestFromDb(supabase as any),
          fetchAppVersionFromDb(supabase as any),
        ]);
        const rawManifest =
          fromDb && typeof fromDb.version === "string" ? String(fromDb.version).trim() : "";
        const merged = fleetMergeGlobalPublishedVersions(rawManifest, appVerRaw);
        if (!merged) return;
        const rawGlobal = normalizeVersion(merged);
        const globalLatest = toCanonicalThreePartVersion(rawGlobal) || rawGlobal;

        let profileAnchorRaw = "";
        if (user?.id) {
          const { data: row } = await (supabase as any)
            .from("profiles")
            .select("ui_denied_features_anchor_version")
            .eq("id", user.id)
            .maybeSingle();
          profileAnchorRaw =
            typeof row?.ui_denied_features_anchor_version === "string"
              ? row.ui_denied_features_anchor_version.trim()
              : "";
        }

        let ack = toCanonicalThreePartVersion(normalizeVersion(FLEET_PRO_DEFAULT_HEADER_VERSION)) ||
          normalizeVersion(FLEET_PRO_DEFAULT_HEADER_VERSION);
        try {
          const stored = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY);
          if (stored?.trim()) {
            const n = normalizeVersion(stored.trim());
            ack = toCanonicalThreePartVersion(n) || n;
          }
        } catch {
          // ignore
        }

        const privateParsed = parsePrivateUiAnchor(profileAnchorRaw);
        let privateCleared = true;
        if (privateParsed.kind === "private") {
          try {
            const cleared =
              localStorage.getItem(FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY)?.trim() ?? "";
            privateCleared = cleared === privateParsed.full;
          } catch {
            privateCleared = false;
          }
        }

        if (privateParsed.kind !== "private" || privateCleared) {
          fleetProPermissionToastAnchorShown = "";
        }

        /**
         * גרסה גלובלית חדשה מ־ack — רק מול `version_manifest` (לא profiles.target_version),
         * כדי שלא יוצג עדכון «מעל» מה שבאמת פרוס בבנדל/מניפסט.
         */
        const versionBehind =
          parseSemverSegments(ack) &&
          parseSemverSegments(globalLatest) &&
          compareSemverExtended(globalLatest, ack) > 0;

        /** עוגן פרטי: הגרסה הגלובלית לא עלתה, אבל יש שינוי הרשאות שלא אושר בלוקאל */
        const silentPermissionUpdate =
          privateParsed.kind === "private" &&
          !privateCleared &&
          parseSemverSegments(ack) &&
          parseSemverSegments(globalLatest) &&
          compareSemverExtended(ack, globalLatest) >= 0;

        if (versionBehind) {
          if (isFleetProUpdateModalSuppressedUntilPageUnload()) return;
          showPwaUpdateModal({
            targetVersion: globalLatest,
            acknowledgeAsVersion: globalLatest,
            changes: ["עדכון גרסה זמין במערכת"],
            updateReason: "global_version",
            privateAnchorFull:
              privateParsed.kind === "private" ? privateParsed.full : "",
          });
          return;
        }

        if (silentPermissionUpdate) {
          if (isFleetProUpdateModalSuppressedUntilPageUnload()) return;
          if (fleetProPermissionToastAnchorShown === privateParsed.full) return;
          fleetProPermissionToastAnchorShown = privateParsed.full;
          const toastId = `fleet-perm-refresh-${privateParsed.full}`;
          toast.message("עודכנו הרשאות הממשק", {
            id: toastId,
            description: `הגרסה הגלובלית נשארה ${globalLatest} — יש לרענן כדי להחיל. לחיצה אחת מסיימת.`,
            duration: 60_000,
            action: {
              label: "רענן והחל",
              onClick: () => {
                toast.dismiss(toastId);
                void commitFleetProAcknowledgedVersionAndHardReload(globalLatest, {
                  privateAnchorFull: privateParsed.full,
                });
              },
            },
          });
          return;
        }

        /** ack מעודכן (≥ גרסת מניפסט) ואין עוגן פרטי ממתין */
        if (
          parseSemverSegments(ack) &&
          parseSemverSegments(globalLatest) &&
          compareSemverExtended(ack, globalLatest) >= 0
        ) {
          hidePwaUpdateModal();
          return;
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
  }, [user?.id]);
}
