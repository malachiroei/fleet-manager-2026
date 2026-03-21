import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FLEET_UI_FEATURE_BOLD_VERSION_TOKEN,
  FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
  manifestChangesIncludeToken,
} from '@/lib/fleetPublishedUiFeatures';
import { fetchVersionManifestFromDb, isFleetManagerProHostname } from '@/lib/versionManifest';
import { parseManifestChanges } from '@/lib/pwaManifest';

export type FleetHeaderUiFeatures = {
  /** טקסט גרסה מודגש (font-bold) */
  boldVersion: boolean;
  /** כוכב ⭐ ליד הגרסה */
  starInHeader: boolean;
  /** ייצור: נטען מניפסט; טסט: true מיד */
  ready: boolean;
};

/**
 * ייצור: לפי version_manifest.changes ב-Supabase (טוקנים יציבים).
 * טסט/שאר hosts: שתי התכונות דלוקות.
 */
export function useFleetHeaderUiFeatures(): FleetHeaderUiFeatures {
  const [state, setState] = useState<FleetHeaderUiFeatures>({
    boldVersion: false,
    starInHeader: false,
    ready: false,
  });

  const load = useCallback(async () => {
    if (!isFleetManagerProHostname()) {
      setState({ boldVersion: true, starInHeader: true, ready: true });
      return;
    }
    try {
      const manifest = await fetchVersionManifestFromDb(supabase as any);
      const lines = parseManifestChanges(manifest);
      setState({
        boldVersion: manifestChangesIncludeToken(lines, FLEET_UI_FEATURE_BOLD_VERSION_TOKEN),
        starInHeader: manifestChangesIncludeToken(lines, FLEET_UI_FEATURE_STAR_HEADER_TOKEN),
        ready: true,
      });
    } catch {
      setState({ boldVersion: false, starInHeader: false, ready: true });
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

  return state;
}
