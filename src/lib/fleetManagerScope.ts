import type { Profile } from '@/types/fleet';

/**
 * משתמש שמדווח למנהל ארגון (צוות תחת מנהל צי) — לא רואה את מאגר השורות המשותף (NULL)
 * של הארגון, רק נכסים ששויכו אליו במפורש.
 */
export function profileUsesStrictFleetManagedSlice(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    (profile.managed_by_user_id ?? '').trim() || (profile.parent_admin_id ?? '').trim(),
  );
}

/**
 * PostgREST filter: rows visible in a manager's fleet list when `managed_by_user_id` is used.
 * NULL = org-shared legacy row; non-null = exclusive to that manager (profiles.id / auth.uid()).
 * strictOwnManagedOnly: מנהל-משנה תחת מנהל אחר — רק שורות עם managed_by_user_id שלו.
 */
export function fleetManagerVisibilityOrFilter(
  viewerUserId: string,
  strictOwnManagedOnly: boolean,
): string {
  if (strictOwnManagedOnly) {
    return `managed_by_user_id.eq.${viewerUserId}`;
  }
  return `managed_by_user_id.is.null,managed_by_user_id.eq.${viewerUserId}`;
}

/** איך לסנן נכסי צי לפי managed_by_user_id (בשילוב org_id). */
export type FleetManagedByQueryMode = 'none' | 'org_pool_or_own' | 'own_only';

/**
 * none — כל הארגון (למשל viewer / משתמש בלי היררכיה).
 * org_pool_or_own — מנהל/אדמין ברמת ארגון: מאגר NULL + שורות ששויכו אליו.
 * own_only — מנהל-משנה או משתמש שמדווח למנהל: רק שורות עם managed_by_user_id = auth uid (בלי מאגר NULL).
 */
export function resolveFleetManagedByQueryMode(opts: {
  viewAsProfilePending: boolean;
  isDriverContextOnly: boolean;
  fleetManagerListUserId: string | null;
  profileHierarchyStrict: boolean;
  fleetListSubjectIsElevated: boolean;
}): FleetManagedByQueryMode {
  const {
    viewAsProfilePending,
    isDriverContextOnly,
    fleetManagerListUserId,
    profileHierarchyStrict,
    fleetListSubjectIsElevated,
  } = opts;
  if (viewAsProfilePending || isDriverContextOnly || !fleetManagerListUserId) return 'none';
  if (profileHierarchyStrict) return 'own_only';
  if (fleetListSubjectIsElevated) return 'org_pool_or_own';
  return 'none';
}
