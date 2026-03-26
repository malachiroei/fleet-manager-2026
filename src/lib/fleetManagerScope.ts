/**
 * PostgREST filter: rows visible in a manager's fleet list when `managed_by_user_id` is used.
 * NULL = org-shared legacy row; non-null = exclusive to that manager (profiles.id / auth.uid()).
 */
export function fleetManagerVisibilityOrFilter(viewerUserId: string): string {
  return `managed_by_user_id.is.null,managed_by_user_id.eq.${viewerUserId}`;
}
