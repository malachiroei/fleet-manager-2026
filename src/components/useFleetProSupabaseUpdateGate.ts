/**
 * Gatekeeper לייצור: רק UpdateModal מייבא מודול זה.
 *
 * ב-fleet-manager-pro.com:
 * - רק Supabase (`fetchVersionManifestFromDb`) — אפס קריאות רשת לקבצי JSON סטטיים על הדומיין הזה.
 * - אין import/שימוש ב-getTestStaticManifestUrl או fetchVersionManifestFromUrl כאן.
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  compareSemverExtended,
  fetchVersionManifestFromDb,
  isFleetManagerProHostname,
  normalizeVersion,
  parsePrivateUiAnchor,
  parseSemverSegments,
  toCanonicalThreePartVersion,
} from "@/lib/versionManifest";
import { parseManifestChanges } from "@/lib/pwaManifest";
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
        const fromDb = await fetchVersionManifestFromDb(supabase as any);
        if (!fromDb?.version) return;
        const rawGlobal = normalizeVersion(String(fromDb.version));
        const globalLatest = toCanonicalThreePartVersion(rawGlobal) || rawGlobal;

        let effectiveLatest = globalLatest;
        let profileAnchorRaw = "";
        if (user?.id) {
          const { data: row } = await (supabase as any)
            .from("profiles")
            .select("target_version, ui_denied_features_anchor_version")
            .eq("id", user.id)
            .maybeSingle();
          const raw = typeof row?.target_version === "string" ? row.target_version.trim() : "";
          if (raw) {
            const nt = normalizeVersion(raw);
            if (parseSemverSegments(nt)) {
              effectiveLatest = toCanonicalThreePartVersion(nt) || nt;
            }
          }
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

        /** גרסה גלובלית חדשה מ־ack — מודאל פריסה */
        const versionBehind =
          parseSemverSegments(ack) &&
          parseSemverSegments(effectiveLatest) &&
          compareSemverExtended(effectiveLatest, ack) > 0;

        /** עוגן פרטי: הגרסה הגלובלית לא עלתה, אבל יש שינוי הרשאות שלא אושר בלוקאל */
        const silentPermissionUpdate =
          privateParsed.kind === "private" &&
          !privateCleared &&
          parseSemverSegments(ack) &&
          parseSemverSegments(globalLatest) &&
          compareSemverExtended(ack, globalLatest) >= 0;

        if (versionBehind) {
          if (isFleetProUpdateModalSuppressedUntilPageUnload()) return;
          const changes = parseManifestChanges(fromDb);
          showPwaUpdateModal({
            targetVersion: globalLatest,
            acknowledgeAsVersion: globalLatest,
            changes,
            updateReason: "global_version",
            privateAnchorFull:
              privateParsed.kind === "private" ? privateParsed.full : "",
          });
          return;
        }

        if (silentPermissionUpdate) {
          if (isFleetProUpdateModalSuppressedUntilPageUnload()) return;
          showPwaUpdateModal({
            targetVersion: globalLatest,
            acknowledgeAsVersion: globalLatest,
            changes: [
              "עודכנו הרשאות ממשק עבור המשתמש שלך.",
              "לחיצה על «עדכן עכשיו» מסנכרנת את המכשיר מול הגרסה הגלובלית — ללא שינוי מספר הגרסה בענן.",
            ],
            updateReason: "permission_anchor",
            privateAnchorFull: privateParsed.full,
          });
          return;
        }

        /** ack מעודכן (≥ גרסה זמינה) ואין עוגן פרטי ממתין */
        if (
          parseSemverSegments(ack) &&
          parseSemverSegments(effectiveLatest) &&
          compareSemverExtended(ack, effectiveLatest) >= 0
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
