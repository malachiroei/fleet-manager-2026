/**
 * בטסט (fleet-manager-dev): מוסיף ל־pending_changes ב-Supabase את שורות ה־UI ל־2.7.8
 * (טוקנים יציבים — תואמים ל־version_manifest אחרי פרסום ול־AppLayout).
 * דורש הרשאת upsert ל־system_settings (משתמש מחובר).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  FLEET_UI_FEATURE_BOLD_VERSION_TOKEN,
  FLEET_UI_FEATURE_STAR_HEADER_TOKEN,
  FLEET_UI_PENDING_LINE_BOLD,
  FLEET_UI_PENDING_LINE_STAR,
} from '@/lib/fleetPublishedUiFeatures';
import { FLEET_KV_TABLE } from '@/lib/fleetKvTable';
import { isFleetManagerTestHost } from '@/lib/pwaPromptRegister';
import { SYSTEM_SETTINGS_PENDING_CHANGES_KEY } from '@/lib/versionManifest';

export async function seedPendingUiFeatures278IfMissing(): Promise<void> {
  if (!isFleetManagerTestHost()) return;
  try {
    const { data, error } = await (supabase as any)
      .from(FLEET_KV_TABLE)
      .select('value')
      .eq('key', SYSTEM_SETTINGS_PENDING_CHANGES_KEY)
      .maybeSingle();
    if (error) return;
    const raw = data?.value as { changes?: unknown } | undefined;
    const existing = Array.isArray(raw?.changes)
      ? (raw!.changes as unknown[]).map((x) => String(x))
      : [];
    let next = [...existing];
    if (!next.some((s) => s.includes(FLEET_UI_FEATURE_BOLD_VERSION_TOKEN))) {
      next.push(FLEET_UI_PENDING_LINE_BOLD);
    }
    if (!next.some((s) => s.includes(FLEET_UI_FEATURE_STAR_HEADER_TOKEN))) {
      next.push(FLEET_UI_PENDING_LINE_STAR);
    }
    if (next.length === existing.length) return;
    const { error: upErr } = await (supabase as any).from(FLEET_KV_TABLE).upsert(
      { key: SYSTEM_SETTINGS_PENDING_CHANGES_KEY, value: { changes: next } },
      { onConflict: 'key' }
    );
    if (upErr) console.warn('[testPendingChangeSeed] upsert pending_changes:', upErr);
  } catch {
    // ignore
  }
}
