import type { OrgSettings } from '@/hooks/useOrgSettings';
import type { OrgDocument } from '@/hooks/useOrgDocuments';
import type { Organization } from '@/types/fleet';
import { getBundledReleaseSnapshot, nextReleaseSnapshotVersion } from '@/lib/releaseSnapshot';

/** מזהה סנאפשוט מסך הגדרות ארגון — ייצוא מסטייג׳ינג וייבוא בפרודקשן */
export const ORG_CROSS_ENV_SNAPSHOT_KIND = 'org_cross_env_v1';

/** שורת מסמך לייצוא (ללא מזהי סביבה) */
export type OrgReleaseSnapshotDocument = Omit<
  OrgDocument,
  'id' | 'created_at' | 'updated_at'
>;

export type OrgCrossEnvSnapshotFile = {
  version: string;
  generatedAt: string;
  snapshotKind: typeof ORG_CROSS_ENV_SNAPSHOT_KIND;
  source?: string;
  /** שם, דוא״ל, ח.פ./ע.מ. — ללא מזהה ארגון ב-Supabase */
  organization?: {
    name?: string;
    email?: string | null;
    org_id_number?: string;
  };
  /** תואם שדות ui_settings (טבלת הגדרות טפסים באפליקציה) */
  uiSettingsTemplate?: Partial<
    Pick<
      OrgSettings,
      | 'org_id_number'
      | 'health_statement_text'
      | 'vehicle_policy_text'
      | 'health_statement_pdf_url'
      | 'vehicle_policy_pdf_url'
    >
  >;
  org_documents?: OrgReleaseSnapshotDocument[];
};

export type OrgReleaseDiffRow = {
  id: string;
  category: 'org' | 'ui' | 'documents';
  label: string;
  status: 'new' | 'changed';
  defaultSelected: boolean;
};

function valEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** מפתח יציב לשורת מסמך (כותרת + סדר) — ייצוא/ייבוא */
export function docFingerprint(d: OrgReleaseSnapshotDocument | OrgDocument): string {
  const t = String(d.title ?? '').trim();
  const o = d.sort_order ?? 0;
  return `${t}@@${o}`;
}

function stripDocForExport(d: OrgDocument): OrgReleaseSnapshotDocument {
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    ...rest
  } = d;
  return rest as OrgReleaseSnapshotDocument;
}

/** שדות טופס וממשק — כל אחד נשמר בנפרד בסנאפשוט */
export type OrgExportFieldSelections = {
  orgDetails: boolean;
  vehiclePolicyText: boolean;
  healthStatementText: boolean;
  /** תבניות PDF (לוגו/מיתוג על גבי טפסי חתימה) */
  brandPdfTemplates: boolean;
};

export type OrgExportSelections = {
  fields: OrgExportFieldSelections;
  /** docFingerprint לכל מסמך לייצוא; ריק = אין מסמכים בקובץ */
  documentFingerprints: Set<string>;
};

export function createDefaultOrgExportSelections(allDocFingerprints: Iterable<string>): OrgExportSelections {
  return {
    fields: {
      orgDetails: true,
      vehiclePolicyText: true,
      healthStatementText: true,
      brandPdfTemplates: true,
    },
    documentFingerprints: new Set(allDocFingerprints),
  };
}

export function exportSelectionHasAnyContent(selections: OrgExportSelections): boolean {
  const f = selections.fields;
  if (f.orgDetails || f.vehiclePolicyText || f.healthStatementText || f.brandPdfTemplates) return true;
  return selections.documentFingerprints.size > 0;
}

/** ערכי טפסים כפי שמוצגים במסך (מקור אמת לייצוא כש־useOrgSettings מחזיר null) */
export type OrgSettingsFormUiSnapshot = {
  org_id_number: string;
  health_statement_text: string;
  vehicle_policy_text: string;
  health_statement_pdf_url: string | null;
  vehicle_policy_pdf_url: string | null;
};

export function buildOrgCrossEnvSnapshot(args: {
  organization: Organization | null | undefined;
  /** שם, דוא״ל וח.פ. מהשדות בטאב פרטי חברה */
  organizationForm?: { name: string; email: string | null; org_id_number: string };
  /** שורת ui_settings מהשרת (גיבוי כשאין טופס) */
  settings: OrgSettings | null | undefined;
  /** ערכי טקסט/PDF מהמסך — דורסים את settings לייצוא */
  formUiSnapshot?: OrgSettingsFormUiSnapshot | null;
  documents: OrgDocument[] | null | undefined;
  selections: OrgExportSelections;
}): OrgCrossEnvSnapshotFile {
  const bundled = getBundledReleaseSnapshot().version;
  const base: OrgCrossEnvSnapshotFile = {
    version: nextReleaseSnapshotVersion(bundled, ''),
    generatedAt: new Date().toISOString(),
    snapshotKind: ORG_CROSS_ENV_SNAPSHOT_KIND,
    source: 'org-settings-staging',
  };

  const { selections, organization, settings, documents } = args;
  const formOrg = args.organizationForm;
  const uiFromForm = args.formUiSnapshot;
  const uiFromServer =
    settings != null
      ? {
          org_id_number: settings.org_id_number ?? '',
          health_statement_text: settings.health_statement_text ?? '',
          vehicle_policy_text: settings.vehicle_policy_text ?? '',
          health_statement_pdf_url: settings.health_statement_pdf_url ?? null,
          vehicle_policy_pdf_url: settings.vehicle_policy_pdf_url ?? null,
        }
      : null;
  const uiSource: OrgSettingsFormUiSnapshot | null = uiFromForm ?? uiFromServer;
  const f = selections.fields;

  if (f.orgDetails) {
    base.organization = {
      name: formOrg?.name ?? organization?.name ?? '',
      email: formOrg?.email !== undefined ? formOrg.email : (organization?.email ?? null),
      org_id_number: formOrg?.org_id_number ?? settings?.org_id_number ?? '',
    };
  }

  if (uiSource && (f.vehiclePolicyText || f.healthStatementText || f.brandPdfTemplates)) {
    const tmpl: Partial<
      Pick<
        OrgSettings,
        | 'org_id_number'
        | 'health_statement_text'
        | 'vehicle_policy_text'
        | 'health_statement_pdf_url'
        | 'vehicle_policy_pdf_url'
      >
    > = {};
    if (f.vehiclePolicyText) tmpl.vehicle_policy_text = uiSource.vehicle_policy_text;
    if (f.healthStatementText) tmpl.health_statement_text = uiSource.health_statement_text;
    if (f.brandPdfTemplates) {
      tmpl.health_statement_pdf_url = uiSource.health_statement_pdf_url;
      tmpl.vehicle_policy_pdf_url = uiSource.vehicle_policy_pdf_url;
    }
    if (!f.orgDetails) tmpl.org_id_number = uiSource.org_id_number;
    if (Object.keys(tmpl).length > 0) {
      base.uiSettingsTemplate = tmpl;
    }
  }

  const docList = documents ?? [];
  const picked = docList.filter((d) => selections.documentFingerprints.has(docFingerprint(d)));
  if (picked.length > 0) {
    base.org_documents = picked.map(stripDocForExport);
  }

  return base;
}

export function parseOrgCrossEnvSnapshot(raw: unknown): {
  snapshot: OrgCrossEnvSnapshotFile | null;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { snapshot: null, error: 'קובץ JSON לא תקין' };
  }
  const o = raw as Record<string, unknown>;

  const hasOrg =
    o.organization && typeof o.organization === 'object' && Object.keys(o.organization as object).length > 0;
  const hasUi =
    o.uiSettingsTemplate &&
    typeof o.uiSettingsTemplate === 'object' &&
    Object.keys(o.uiSettingsTemplate as object).length > 0;
  const docs = o.org_documents;
  const hasDocs = Array.isArray(docs) && docs.length > 0;

  if (!hasOrg && !hasUi && !hasDocs) {
    return {
      snapshot: null,
      error: 'בקובץ אין נתונים לייבוא (מסמכים, הגדרות טפסים או פרטי ארגון).',
    };
  }

  const kind = o.snapshotKind;
  if (kind != null && kind !== ORG_CROSS_ENV_SNAPSHOT_KIND) {
    return { snapshot: null, error: 'סוג קובץ הסנאפשוט אינו נתמך במסך זה.' };
  }

  const snapshot: OrgCrossEnvSnapshotFile = {
    version: typeof o.version === 'string' ? o.version : '0.0.0',
    generatedAt: typeof o.generatedAt === 'string' ? o.generatedAt : new Date().toISOString(),
    snapshotKind: ORG_CROSS_ENV_SNAPSHOT_KIND,
    source: typeof o.source === 'string' ? o.source : undefined,
  };

  if (hasOrg) {
    const org = o.organization as Record<string, unknown>;
    snapshot.organization = {
      name: typeof org.name === 'string' ? org.name : '',
      email: org.email === null || org.email === undefined ? null : String(org.email),
      org_id_number: typeof org.org_id_number === 'string' ? org.org_id_number : '',
    };
  }

  if (hasUi) {
    snapshot.uiSettingsTemplate = o.uiSettingsTemplate as OrgCrossEnvSnapshotFile['uiSettingsTemplate'];
  }

  if (hasDocs) {
    snapshot.org_documents = (docs as unknown[]).filter(
      (row): row is OrgReleaseSnapshotDocument =>
        row != null && typeof row === 'object' && String((row as OrgDocument).title ?? '').trim().length > 0,
    ) as OrgReleaseSnapshotDocument[];
  }

  return { snapshot };
}

const UI_FIELD_LABELS: Array<{
  key: keyof NonNullable<OrgCrossEnvSnapshotFile['uiSettingsTemplate']>;
  label: string;
}> = [
  { key: 'org_id_number', label: 'ח.פ. / ע.מ.' },
  { key: 'health_statement_text', label: 'הצהרת בריאות — טקסט' },
  { key: 'vehicle_policy_text', label: 'נוהל שימוש ברכב — טקסט' },
  { key: 'health_statement_pdf_url', label: 'הצהרת בריאות — קישור PDF' },
  { key: 'vehicle_policy_pdf_url', label: 'נוהל רכב — קישור PDF' },
];

export function computeOrgCrossEnvDiffRows(args: {
  snapshot: OrgCrossEnvSnapshotFile;
  organization: Organization | null | undefined;
  settings: OrgSettings | null | undefined;
  documents: OrgDocument[] | null | undefined;
}): OrgReleaseDiffRow[] {
  const rows: OrgReleaseDiffRow[] = [];
  const { snapshot, organization, settings, documents } = args;
  const curOrg = organization ?? null;
  const curSettings = settings ?? null;
  const curDocs = documents ?? [];

  const upOrg = snapshot.organization;
  if (upOrg) {
    if (upOrg.name != null && !valEq(curOrg?.name ?? '', upOrg.name)) {
      rows.push({
        id: 'org:name',
        category: 'org',
        label: `שם הארגון → ${String(upOrg.name).slice(0, 80)}${String(upOrg.name).length > 80 ? '…' : ''}`,
        status: curOrg?.name ? 'changed' : 'new',
        defaultSelected: true,
      });
    }
    if (upOrg.email !== undefined && !valEq(curOrg?.email ?? null, upOrg.email)) {
      rows.push({
        id: 'org:email',
        category: 'org',
        label: `דוא״ל ניהולי → ${String(upOrg.email ?? '') || '(ריק)'}`,
        status: curOrg?.email ? 'changed' : 'new',
        defaultSelected: true,
      });
    }
    if (upOrg.org_id_number != null && !valEq(curSettings?.org_id_number ?? '', upOrg.org_id_number)) {
      rows.push({
        id: 'org:org_id_number',
        category: 'org',
        label: `ח.פ. / ע.מ. → ${String(upOrg.org_id_number)}`,
        status: String(curSettings?.org_id_number ?? '').trim() ? 'changed' : 'new',
        defaultSelected: true,
      });
    }
  }

  const upT = snapshot.uiSettingsTemplate;
  if (upT && typeof upT === 'object') {
    for (const { key, label } of UI_FIELD_LABELS) {
      if (key === 'org_id_number' && snapshot.organization && snapshot.organization.org_id_number !== undefined) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(upT, key)) continue;
      const c = curSettings?.[key];
      const u = upT[key];
      if (valEq(c, u)) continue;
      const emptyC =
        c === undefined ||
        c === null ||
        (typeof c === 'string' && !String(c).trim());
      const emptyU = u === undefined || u === null || (typeof u === 'string' && !String(u).trim());
      if (emptyC && emptyU) continue;
      rows.push({
        id: `ui:${key}`,
        category: 'ui',
        label,
        status: emptyC ? 'new' : 'changed',
        defaultSelected: true,
      });
    }
  }

  const uploaded = snapshot.org_documents ?? [];
  for (const doc of uploaded) {
    const fp = docFingerprint(doc);
    const match = curDocs.find((d) => docFingerprint(d) === fp);
    const id = `doc:${encodeURIComponent(fp)}`;
    const title = String(doc.title ?? '').trim();
    if (!match) {
      rows.push({
        id,
        category: 'documents',
        label: `מסמך חדש: ${title}`,
        status: 'new',
        defaultSelected: true,
      });
      continue;
    }
    const subset: (keyof OrgReleaseSnapshotDocument)[] = [
      'name',
      'description',
      'category',
      'file_url',
      'json_schema',
      'autofill_fields',
      'include_in_handover',
      'include_in_delivery',
      'include_in_return',
      'is_standalone',
      'requires_signature',
      'sort_order',
      'is_active',
    ];
    let changed = false;
    for (const k of subset) {
      if (!valEq((match as Record<string, unknown>)[k], (doc as Record<string, unknown>)[k])) {
        changed = true;
        break;
      }
    }
    if (changed) {
      rows.push({
        id,
        category: 'documents',
        label: `עדכון מסמך: ${title}`,
        status: 'changed',
        defaultSelected: true,
      });
    }
  }

  return rows;
}

export function buildOrgSettingsPatchFromSelection(
  snapshot: OrgCrossEnvSnapshotFile,
  selected: Set<string>,
  currentSettings: OrgSettings | null,
  orgId: string,
): Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { org_id: string } {
  const base = currentSettings ?? {
    org_id: orgId,
    org_name: '',
    org_id_number: '',
    admin_email: '',
    health_statement_text: '',
    vehicle_policy_text: '',
    health_statement_pdf_url: null,
    vehicle_policy_pdf_url: null,
    updated_at: '',
  };

  const patch: Partial<Omit<OrgSettings, 'id' | 'updated_at'>> & { org_id: string } = {
    org_id: orgId,
    org_id_number: base.org_id_number,
    health_statement_text: base.health_statement_text,
    vehicle_policy_text: base.vehicle_policy_text,
    health_statement_pdf_url: base.health_statement_pdf_url,
    vehicle_policy_pdf_url: base.vehicle_policy_pdf_url,
  };

  const up = snapshot.uiSettingsTemplate ?? {};
  for (const key of UI_FIELD_LABELS.map((x) => x.key)) {
    if (!selected.has(`ui:${key}`) || !Object.prototype.hasOwnProperty.call(up, key)) continue;
    const v = up[key];
    if (key === 'health_statement_pdf_url' || key === 'vehicle_policy_pdf_url') {
      (patch as Record<string, unknown>)[key] = v == null || v === '' ? null : String(v);
    } else {
      (patch as Record<string, unknown>)[key] = typeof v === 'string' ? v : String(v ?? '');
    }
  }

  if (selected.has('org:org_id_number') && snapshot.organization?.org_id_number !== undefined) {
    patch.org_id_number = String(snapshot.organization.org_id_number ?? '');
  }

  return patch;
}

export function buildOrganizationUpdateFromSelection(
  snapshot: OrgCrossEnvSnapshotFile,
  selected: Set<string>,
  orgId: string,
): { id: string; name?: string; email?: string | null } | null {
  const up = snapshot.organization;
  if (!up) return null;
  const out: { id: string; name?: string; email?: string | null } = { id: orgId };
  if (selected.has('org:name') && up.name !== undefined) out.name = String(up.name ?? '');
  if (selected.has('org:email')) out.email = up.email === undefined ? undefined : up.email;
  if (out.name === undefined && out.email === undefined) return null;
  return out;
}

export function importSelectionTouchesUiSettings(selected: Set<string>): boolean {
  return [...selected].some((id) => id.startsWith('ui:') || id === 'org:org_id_number');
}

export function importSelectionTouchesOrganizationRow(selected: Set<string>): boolean {
  return selected.has('org:name') || selected.has('org:email');
}

export function importSelectionTouchesDocuments(selected: Set<string>): boolean {
  return [...selected].some((id) => id.startsWith('doc:'));
}

export async function applyOrgDocumentsFromSnapshot(args: {
  supabase: { from: (t: string) => any };
  snapshot: OrgCrossEnvSnapshotFile;
  selected: Set<string>;
  currentDocuments: OrgDocument[];
}): Promise<void> {
  const { supabase, snapshot, selected, currentDocuments } = args;
  const uploaded = snapshot.org_documents ?? [];

  for (const doc of uploaded) {
    const fp = docFingerprint(doc);
    const rowId = `doc:${encodeURIComponent(fp)}`;
    if (!selected.has(rowId)) continue;

    const match = currentDocuments.find((d) => docFingerprint(d) === fp);
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: String(doc.title ?? '').trim(),
      name: doc.name ?? null,
      description: doc.description ?? '',
      category: doc.category ?? null,
      file_url: doc.file_url ?? null,
      json_schema: doc.json_schema ?? null,
      autofill_fields: doc.autofill_fields ?? null,
      include_in_handover: doc.include_in_handover ?? false,
      include_in_delivery: doc.include_in_delivery ?? false,
      include_in_return: doc.include_in_return ?? false,
      is_standalone: doc.is_standalone ?? false,
      requires_signature: doc.requires_signature !== false,
      sort_order: doc.sort_order ?? 0,
      is_active: doc.is_active !== false,
      updated_at: now,
    };

    if (match) {
      const { error } = await supabase.from('org_documents').update(payload).eq('id', match.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('org_documents').insert({
        ...payload,
        created_at: now,
      });
      if (error) throw error;
    }
  }
}
