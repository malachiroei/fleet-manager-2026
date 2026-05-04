/**
 * PostgREST filter: rows visible in a manager's fleet list when `managed_by_user_id` is used.
 * NULL = org-shared legacy row; non-null = exclusive to that manager (profiles.id / auth.uid()).
 * Delegates under a parent admin (`parentFleetOwnerProfileId`) also see rows owned by that parent.
 */
export function fleetManagerVisibilityOrFilter(
  viewerUserId: string,
  options?: { parentFleetOwnerProfileId?: string | null },
): string {
  const parts = ['managed_by_user_id.is.null', `managed_by_user_id.eq.${viewerUserId}`];
  const parent = options?.parentFleetOwnerProfileId?.trim();
  if (parent && parent !== viewerUserId) {
    parts.push(`managed_by_user_id.eq.${parent}`);
  }
  return parts.join(',');
}

/** Client-side filter aligned with {@link fleetManagerVisibilityOrFilter} (e.g. compliance rows). */
export function fleetRowVisibleUnderManagerSlice(
  managedByUserId: string | null | undefined,
  fleetManagerListUserId: string | null,
  parentFleetOwnerProfileId: string | null,
): boolean {
  if (!fleetManagerListUserId) return true;
  if (managedByUserId == null || String(managedByUserId).trim() === '') return true;
  const m = String(managedByUserId);
  if (m === fleetManagerListUserId) return true;
  const p = parentFleetOwnerProfileId?.trim();
  return Boolean(p && m === p);
}
