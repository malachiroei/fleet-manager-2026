import {
  isFleetStagingOnlyUiTokenId,
  manifestChangesIncludeToken,
  parseProfileAllowedFeatureTokens,
  parseProfileUiFeatureDenylist,
} from '@/lib/fleetPublishedUiFeatures';

/**
 * כלל PRO (מ־2.7.13): UI חדש ב־fleet-manager-pro — טוקן ב־version_manifest.changes **או** ב־profiles.allowed_features.
 * טוקני DEBUG_/staging — חסומים תמיד בפרודקשן.
 * (סדר deny → allow → מניפסט + ack — ב־useFleetManifestUiGates; פונקציה זו ללא ack.)
 */
export function fleetProAllowsManifestToken(
  isProHostname: boolean,
  manifestReady: boolean,
  manifestChangeLines: string[],
  token: string,
  profileAllowedFeatures?: unknown
): boolean {
  if (!isProHostname) return true;
  const t = String(token).trim();
  if (isFleetStagingOnlyUiTokenId(t)) return false;
  if (!manifestReady) return false;
  if (parseProfileUiFeatureDenylist(profileAllowedFeatures ?? null).has(t)) return false;
  if (parseProfileAllowedFeatureTokens(profileAllowedFeatures ?? null).has(t)) return true;
  return manifestChangesIncludeToken(manifestChangeLines, token);
}
