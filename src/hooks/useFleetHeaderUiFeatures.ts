import { useFleetManifestUiGates } from '@/hooks/useFleetManifestUiGates';

export type FleetHeaderUiFeatures = {
  /** טקסט גרסה מודגש (font-bold) */
  boldVersion: boolean;
  /** כוכב ⭐ ליד הגרסה */
  starInHeader: boolean;
  /** ייצור: נטען מניפסט; טסט: true מיד */
  ready: boolean;
};

/**
 * כותרת AppLayout — אותה לוגיקה כמו useFleetManifestUiGates (בפרו: רק Supabase + יישור current_app_version לבנדל).
 */
export function useFleetHeaderUiFeatures(): FleetHeaderUiFeatures {
  const g = useFleetManifestUiGates();
  return {
    boldVersion: g.boldVersion,
    starInHeader: g.starInHeader,
    ready: g.ready,
  };
}
