/**
 * @deprecated לשמירת הרשאות אישיות — לא להשתמש: שמירה מ־AdminPermissionModal לא אמורה לגעת ב־`app_version` / מניפסט גלובלי.
 * נשאר רק אם בעתיד תרצו במפורש «לדחוף» עדכון גלובלי מתהליך אחר (לא ממודאל הרשאות משתמש).
 */
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import {
  SYSTEM_SETTINGS_VERSION_MANIFEST_KEY,
  computeNextPatchVersion,
  fetchVersionManifestFromDb,
  normalizeVersion,
  toCanonicalThreePartVersion,
} from '@/lib/versionManifest';

export const PERMISSION_SAVE_BUMP_LINE_PREFIX = 'PERMISSION_SYNC_BUMP' as const;

async function fetchAppVersionFromDb(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (a: string, b: string) => {
        maybeSingle: () => Promise<{ data: { value?: unknown } | null }>;
      };
    };
  };
}): Promise<string> {
  try {
    const { data } = await supabase
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', 'app_version')
      .maybeSingle();
    const v = data?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  } catch {
    return '';
  }
}

/**
 * מעלה patch אחד מ־version_manifest / app_version / בנדל, מעדכן version_manifest + app_version + last_update_date.
 */
export async function bumpGlobalVersionAfterProfilePermissionSave(
  supabase: Parameters<typeof fetchVersionManifestFromDb>[0],
  bundleVersionFallback: string
): Promise<{ nextVersion: string } | null> {
  const manifestRow = await fetchVersionManifestFromDb(supabase);
  const manifestObj =
    manifestRow && typeof manifestRow === 'object'
      ? ({ ...manifestRow } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const fromManifest =
    typeof manifestObj.version === 'string' && manifestObj.version.trim()
      ? manifestObj.version.trim()
      : '';
  const fromAppRow = await fetchAppVersionFromDb(supabase);
  const rawCurrent =
    fromManifest ||
    fromAppRow ||
    normalizeVersion(String(bundleVersionFallback ?? '').trim()) ||
    '0.0.0';
  const base = toCanonicalThreePartVersion(normalizeVersion(rawCurrent)) || normalizeVersion(rawCurrent);
  const nextVersion = computeNextPatchVersion(base || '0.0.0');

  const now = new Date();
  const iso = now.toISOString();
  const releaseDate = now.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const releaseTime = now.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const bumpLine = `${PERMISSION_SAVE_BUMP_LINE_PREFIX} — Profile permissions saved; global release ${nextVersion}`;
  const prevChanges = Array.isArray(manifestObj.changes) ? [...(manifestObj.changes as unknown[])] : [];
  const changes = [...prevChanges];
  if (!changes.some((c) => String(c).includes(PERMISSION_SAVE_BUMP_LINE_PREFIX) && String(c).includes(nextVersion))) {
    changes.push(bumpLine);
  }

  const prevDesc = typeof manifestObj.description === 'string' ? manifestObj.description.trim() : '';
  const prevChangelog = typeof manifestObj.changelog === 'string' ? manifestObj.changelog.trim() : '';

  const newManifest: Record<string, unknown> = {
    ...manifestObj,
    version: nextVersion,
    releaseDate: releaseDate || (manifestObj.releaseDate as string) || undefined,
    releaseTime: releaseTime || (manifestObj.releaseTime as string) || undefined,
    changes,
    changelog: prevChangelog ? `${prevChangelog}\n${bumpLine}` : bumpLine,
    description: prevDesc ? `${prevDesc} | ${bumpLine}` : `Permission sync — ${nextVersion}`,
  };

  const rows = [
    { key: SYSTEM_SETTINGS_VERSION_MANIFEST_KEY, value: newManifest },
    { key: 'app_version', value: nextVersion },
    { key: 'last_update_date', value: iso },
  ];

  const { error } = await (supabase as any).from(FLEET_KV_TABLE).upsert(rows, { onConflict: 'key' });
  if (error) {
    console.error('[bumpGlobalVersionAfterProfilePermissionSave]', error);
    return null;
  }
  return { nextVersion };
}
