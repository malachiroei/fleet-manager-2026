import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
  FLEET_PRO_DEFAULT_HEADER_VERSION,
  FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY,
} from '@/constants/version';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  FLEET_UI_FEATURE_BOLD_VERSION_TOKEN,
  FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN,
  FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN,
  FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN,
  FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
  FLEET_UI_LOGGED_FEATURE_TOKENS,
  isFleetUiManifestBypassToken,
  fleetUiRequiredAckVersion,
  isFleetStagingOnlyUiTokenId,
  manifestChangesIncludeToken,
  parseProfileAllowedFeatureTokens,
  parseProfileUiFeatureDenylistDeferred,
} from '@/lib/fleetPublishedUiFeatures';
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
} from '@/lib/versionManifest';
import { parseManifestChanges } from '@/lib/pwaManifest';

/**
 * מקורות אמת (פרו):
 * - **עיכוב מ־DB:** עוגן semver או עוגן פרטי `*-p…` — ack גלובלי + מפתח עוגן פרטי ב־localStorage; **וגם** ≥ גרסת המניפסט — אין להפעיל גם `allowed_features`.
 * - **אישי:** שורה יחידה `profiles` כאשר `profiles.id` = auth uid — `allowed_features` / `denied_features`
 *   (טופס תחזוקה: רק `UI_FEATURE_MAINTENANCE_FORM` ב־allowed_features, לא מהמניפסט).
 */

export type FleetManifestUiGates = {
  ready: boolean;
  /** true = fleet-manager-pro.com / www */
  isPro: boolean;
  /** שורות צ'יינג'לוג מהמניפסט (טוקנים גלובליים) */
  manifestChangeLines: string[];
  /** גרסת מניפסט ממוזגת מ-DB (ייצור) */
  manifestVersion: string;
  /** כותרת — פרו: רק מניפסט Supabase + יישור גרסה */
  boldVersion: boolean;
  starInHeader: boolean;
  /** פרו: רק אם הטוקן במניפסט + DB. לא-פרו: תמיד true (טסט) */
  dashboardTreatment: boolean;
  dashboardTest: boolean;
  /** טופס תחזוקה — רק הרשאה אישית (לא במניפסט גלובלי) */
  maintenanceForm: boolean;
};

type ProManifestGateState = {
  ready: boolean;
  lines: string[];
  /** גרסה מ־version_manifest ב-Supabase (מנורמלת) — ליישור מול בנדל בלי להמתין ל־profile */
  manifestVersion: string;
  isPro: boolean;
};

function initialManifestState(): ProManifestGateState {
  if (typeof window === 'undefined') {
    return { ready: false, lines: [], manifestVersion: '', isPro: false };
  }
  const pro = isFleetManagerProHostname();
  /** בפרו: לא מציגים פיצ'רים עד שמניפסט נטען מ-Supabase (מונע דליפה מהבנדל) */
  return { ready: !pro, lines: [], manifestVersion: '', isPro: pro };
}

function readFleetProAcknowledgedVersion(): string {
  const fallback = normalizeVersion(FLEET_PRO_DEFAULT_HEADER_VERSION);
  if (typeof window === 'undefined') {
    return toCanonicalThreePartVersion(fallback) || fallback;
  }
  try {
    const v = localStorage.getItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY)?.trim();
    if (v) {
      const n = normalizeVersion(v);
      return toCanonicalThreePartVersion(n) || n;
    }
  } catch {
    /* ignore */
  }
  return toCanonicalThreePartVersion(fallback) || fallback;
}

function subscribeFleetProAckVersion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === FLEET_PRO_ACK_VERSION_STORAGE_KEY || e.key === null) onStoreChange();
  };
  const onLocal = () => onStoreChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(FLEET_PRO_ACK_VERSION_UPDATED_EVENT, onLocal);
  };
}

/**
 * בפרו: היררכיה — deny (אישי) → grant אישי ב־allowed_features → מניפסט גלובלי + ack מינימלי לטוקן.
 * טוקני DEBUG/staging חסומים בפרודקשן.
 */
export function useFleetManifestUiGates(): FleetManifestUiGates {
  const { profile } = useAuth();
  const [state, setState] = useState(initialManifestState);
  const proAckVersion = useSyncExternalStore(
    subscribeFleetProAckVersion,
    readFleetProAcknowledgedVersion,
    readFleetProAcknowledgedVersion
  );

  const load = useCallback(async () => {
    if (!isFleetManagerProHostname()) {
      setState({ ready: true, lines: [], manifestVersion: '', isPro: false });
      return;
    }
    try {
      const [manifest, appVerRaw] = await Promise.all([
        fetchVersionManifestFromDb(supabase as any),
        fetchAppVersionFromDb(supabase as any),
      ]);
      const lines = parseManifestChanges(manifest);
      const rawManifest =
        manifest && typeof manifest.version === 'string' ? String(manifest.version).trim() : '';
      const merged = fleetMergeGlobalPublishedVersions(rawManifest, appVerRaw);
      const manifestVersion = merged ? normalizeVersion(merged).trim() : '';
      setState({ ready: true, lines, manifestVersion, isPro: true });
    } catch {
      setState({ ready: true, lines: [], manifestVersion: '', isPro: true });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isFleetManagerProHostname()) return;
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const { ready, lines, manifestVersion, isPro } = state;

  const profileAllowedTokens = useMemo(
    () => parseProfileAllowedFeatureTokens(profile?.allowed_features ?? null),
    [profile?.allowed_features]
  );

  const profileDeniedUiTokens = useMemo(
    () =>
      parseProfileUiFeatureDenylistDeferred(
        profile?.allowed_features ?? null,
        profile?.denied_features ?? null,
        profile?.ui_denied_features_anchor_version ?? null,
        proAckVersion
      ),
    [
      profile?.allowed_features,
      profile?.denied_features,
      profile?.ui_denied_features_anchor_version,
      proAckVersion,
    ]
  );

  /** ערך גולמי מ־profiles — semver או עוגן פרטי `*-p…` */
  const permissionAnchorRaw = useMemo(
    () => String(profile?.ui_denied_features_anchor_version ?? '').trim(),
    [profile?.ui_denied_features_anchor_version]
  );

  /** גרסת מניפסט מפורסמת — סימון מים נפרד מעוגן הפרופיל */
  const publishedManifestWatermark = useMemo(() => {
    const mvRaw = manifestVersion.trim();
    if (!mvRaw) return '';
    return toCanonicalThreePartVersion(normalizeVersion(mvRaw)) || normalizeVersion(mvRaw);
  }, [manifestVersion]);

  const allowRef = useRef<(token: string) => boolean>(() => false);
  const allow = (token: string) => {
    if (!isPro) return true;
    const t = String(token).trim();
    /** חסימה קשיחה בפרודקשן: טוקני DEBUG / staging לא מופעלים לעולם */
    if (isFleetStagingOnlyUiTokenId(t)) return false;
    if (!ready) return false;
    /** denied_features / !TOKEN — קודם כל, דורס הכול */
    if (profileDeniedUiTokens.has(t)) return false;

    /**
     * HARD LATENCY: עוגן semver או עוגן פרטי — עד אישור (ack גלובלי + מפתח עוגן פרטי) אין allowed_features.
     */
    if (permissionAnchorRaw) {
      const parsed = parsePrivateUiAnchor(permissionAnchorRaw);
      if (parsed.kind === 'private') {
        let cleared = '';
        try {
          cleared =
            typeof localStorage !== 'undefined'
              ? localStorage.getItem(FLEET_PRO_PRIVATE_ANCHOR_ACKNOWLEDGED_KEY)?.trim() ?? ''
              : '';
        } catch {
          /* ignore */
        }
        if (cleared !== parsed.full) return false;
        if (!parseSemverSegments(proAckVersion) || !parseSemverSegments(parsed.globalBase)) return false;
        if (compareSemverExtended(proAckVersion, parsed.globalBase) < 0) return false;
      } else if (parsed.kind === 'semver') {
        const anch = parsed.canonical;
        if (!parseSemverSegments(proAckVersion) || !parseSemverSegments(anch)) return false;
        if (compareSemverExtended(proAckVersion, anch) < 0) return false;
      }
    }

    /** מניפסט גלובלי: ack חייב לעמוד גם בגרסה המפורסמת */
    if (publishedManifestWatermark.trim()) {
      if (!parseSemverSegments(proAckVersion) || !parseSemverSegments(publishedManifestWatermark)) return false;
      if (compareSemverExtended(proAckVersion, publishedManifestWatermark) < 0) return false;
    }

    const manifestBypass = isFleetUiManifestBypassToken(t);
    /** בלי גרסה גלובלית מ־DB — לא מפעילים פיצ'רי מניפסט (מונע דליפה לפני טעינה) */
    if (!manifestBypass && !manifestVersion.trim()) return false;

    const req = fleetUiRequiredAckVersion(t, manifestVersion);
    if (!parseSemverSegments(proAckVersion) || !parseSemverSegments(req)) return false;
    if (compareSemverExtended(proAckVersion, req) < 0) return false;

    /** טפסים בהרשאה אישית בלבד — אחרי ack לפי fleetUiRequiredAckVersion */
    if (manifestBypass) {
      return profileAllowedTokens.has(t);
    }

    /** מניפסט או הרשאה אישית — בלי עקיפת גרסה */
    return manifestChangesIncludeToken(lines, t) || profileAllowedTokens.has(t);
  };

  allowRef.current = allow;

  useEffect(() => {
    if (!ready) return;
    if (!isPro) {
      console.log('Final Feature Set:', [...FLEET_UI_LOGGED_FEATURE_TOKENS]);
      return;
    }
    const activeTokens = FLEET_UI_LOGGED_FEATURE_TOKENS.filter((tok) => allowRef.current(tok));
    console.log('Final Feature Set:', activeTokens);
  }, [
    isPro,
    ready,
    lines,
    manifestVersion,
    profile?.allowed_features,
    profile?.denied_features,
    profile?.ui_denied_features_anchor_version,
    proAckVersion,
    profileAllowedTokens,
    profileDeniedUiTokens,
    permissionAnchorRaw,
    publishedManifestWatermark,
  ]);

  return {
    ready,
    isPro,
    /** שורות changes מהמניפסט (למיזוג טוקנים גלובליים במודאל הרשאות / ניהול צוות) */
    manifestChangeLines: lines,
    manifestVersion,
    boldVersion: allow(FLEET_UI_FEATURE_BOLD_VERSION_TOKEN),
    starInHeader: allow(FLEET_UI_FEATURE_STAR_HEADER_TOKEN),
    dashboardTreatment: allow(FLEET_UI_FEATURE_DASHBOARD_ACTION_TREATMENT_TOKEN),
    dashboardTest: allow(FLEET_UI_FEATURE_DASHBOARD_ACTION_TEST_TOKEN),
    maintenanceForm: allow(FLEET_UI_FEATURE_MAINTENANCE_FORM_TOKEN),
  };
}
