import type { OrgSettings } from '@/hooks/useOrgSettings';
import type { ProfilePermissions } from '@/types/fleet';
import {
  compareSemverExtended,
  computeNextPatchVersion,
  normalizeVersion,
  toCanonicalThreePartVersion,
} from '@/lib/versionManifest';

/** מצב מניפסט UI לבניית סנאפשוט (ללא hook בגרסה זו) */
export type FleetManifestUiGates = {
  manifestVersion: string;
  boldVersion?: boolean;
  starInHeader?: boolean;
  dashboardTreatment?: boolean;
  dashboardTest?: boolean;
  maintenanceForm?: boolean;
  ready?: boolean;
  manifestChangeLines?: string[];
};

export const EMPTY_FLEET_MANIFEST_UI_GATES: FleetManifestUiGates = {
  ready: true,
  manifestVersion: '',
  manifestChangeLines: [],
};

/** תוכן הקובץ מהריפו (נכלל בבנדל פרודקשן) */
export type ReleaseSnapshotFile = {
  version: string;
  generatedAt: string;
  source?: string;
  /** ארגון שממנו נאספו ההגדרות בטסט (מטא) */
  collectedForOrgId?: string;
  manifestVersion?: string;
  uiFeatures: {
    boldVersion?: boolean;
    starInHeader?: boolean;
    dashboardTreatment?: boolean;
    dashboardTest?: boolean;
    maintenanceForm?: boolean;
  };
  /** מבנה הרשאות ברירת מחדש להזמנות / תבנית */
  defaultPermissions: Record<string, boolean>;
  /** שדות מ-ui_settings לשכפול (ללא id / org_id ספציפיים) */
  uiSettingsTemplate: Partial<
    Pick<
      OrgSettings,
      | 'org_id_number'
      | 'health_statement_text'
      | 'vehicle_policy_text'
      | 'health_statement_pdf_url'
      | 'vehicle_policy_pdf_url'
    >
  >;
};

const EMPTY_BUNDLED_RELEASE_SNAPSHOT: ReleaseSnapshotFile = {
  version: '0.0.0',
  generatedAt: '1970-01-01T00:00:00.000Z',
  uiFeatures: {},
  defaultPermissions: {},
  uiSettingsTemplate: {},
};

export function getBundledReleaseSnapshot(): ReleaseSnapshotFile {
  return EMPTY_BUNDLED_RELEASE_SNAPSHOT;
}

export function isSnapshotNewerThanAck(snapshotVersion: string, ackVersion: string | null | undefined): boolean {
  const snap = normalizeVersion(String(snapshotVersion ?? '').trim()) || '0.0.0';
  const rawAck = normalizeVersion(String(ackVersion ?? '').trim());
  const ack = rawAck && rawAck !== '0' ? rawAck : '0.0.0';
  return compareSemverExtended(snap, ack) > 0;
}

/** גרסה חדשה לסנאפשוט — מקפיץ patch מול הקובץ הנוכחי והמניפסט */
export function nextReleaseSnapshotVersion(
  currentBundledVersion: string,
  manifestVersion: string,
): string {
  const a = toCanonicalThreePartVersion(normalizeVersion(currentBundledVersion)) || '1.0.0';
  const b = toCanonicalThreePartVersion(normalizeVersion(manifestVersion)) || '0.0.0';
  const base = compareSemverExtended(a, b) >= 0 ? a : b;
  return computeNextPatchVersion(base);
}

export function buildReleaseSnapshotPayload(args: {
  orgId: string;
  orgSettings: OrgSettings | null | undefined;
  manifestUi: FleetManifestUiGates;
  defaultPermissions: ProfilePermissions;
  previousBundledVersion: string;
}): ReleaseSnapshotFile {
  const s = args.orgSettings;
  const template: ReleaseSnapshotFile['uiSettingsTemplate'] = {};
  if (s) {
    template.org_id_number = s.org_id_number ?? '';
    template.health_statement_text = s.health_statement_text ?? '';
    template.vehicle_policy_text = s.vehicle_policy_text ?? '';
    template.health_statement_pdf_url = s.health_statement_pdf_url;
    template.vehicle_policy_pdf_url = s.vehicle_policy_pdf_url;
  }

  return {
    version: nextReleaseSnapshotVersion(args.previousBundledVersion, args.manifestUi.manifestVersion),
    generatedAt: new Date().toISOString(),
    source: 'staging-push',
    collectedForOrgId: args.orgId,
    manifestVersion: args.manifestUi.manifestVersion || '',
    uiFeatures: {
      boldVersion: args.manifestUi.boldVersion,
      starInHeader: args.manifestUi.starInHeader,
      dashboardTreatment: args.manifestUi.dashboardTreatment,
      dashboardTest: args.manifestUi.dashboardTest,
      maintenanceForm: args.manifestUi.maintenanceForm,
    },
    defaultPermissions: { ...args.defaultPermissions },
    uiSettingsTemplate: template,
  };
}

export function downloadReleaseSnapshotJson(snapshot: ReleaseSnapshotFile): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'release_snapshot.json';
  a.click();
  URL.revokeObjectURL(url);
}
