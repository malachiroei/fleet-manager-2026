export type VersionSnapshotFeatureType = 'form' | 'button' | 'page' | string;

export type VersionSnapshotFeature = {
  id: string;
  type: VersionSnapshotFeatureType;
  name: string;
};

export type VersionSnapshotFile = {
  version: string;
  release_date: string;
  description: string;
  /** מה חדש בגרסה — טקסט חופשי לפרסום */
  release_notes?: string;
  features: VersionSnapshotFeature[];
  ui_changes: string;
};
