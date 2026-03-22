/**
 * v2.7.61 — Clear versioning / permission-related localStorage when Supabase project ref changes
 * or when environment guard fails, so another DB cannot leave "ghost" acks or org selection.
 */
import { clearFleetClientReleaseLocalStorage } from '@/lib/fleetClientReleaseStorage';

/** Last bound project ref for this origin (lowercase). */
export const FLEET_BOUND_SUPABASE_PROJECT_REF_KEY = 'fleet-manager-bound-supabase-project-ref';

const PERMISSION_RELATED_KEYS = ['fleet-manager-active-org', 'is_admin'] as const;

/**
 * Versioning + manifest ack + org/permission hints tied to a Supabase project.
 * Does not remove language/theme or unrelated admin upload timestamps.
 */
export function purgeLocalStorageForSupabaseEnvironmentSwitch(): void {
  clearFleetClientReleaseLocalStorage();
  try {
    for (const k of PERMISSION_RELATED_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

/**
 * v2.7.64 — כשל ב-ref guard: ניקוי מלא של localStorage למקור (בידוד טסטים / מניעת סשן רפאים).
 */
export function clearLocalStorageOnSupabaseEnvironmentGuardFailure(): void {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
}
