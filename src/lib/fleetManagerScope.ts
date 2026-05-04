import { isPlatformSuperOwnerEmail, isRavidManagerEmail } from '@/lib/fleetBootstrapEmails';

/**
 * מנהל פלטפורמה: רכבים/נהגים ב־`org_id` אחר (למשל צי ראשי) אבל `managed_by` = הוא — עדיין יופיעו ברשימה
 * כשהמתג על «ארגון ראשי» (שאינו תואם ל־org_id בטבלה).
 */
export function orgOrManagedByUserFilter(orgId: string, profileId: string): string {
  return `org_id.eq.${orgId},managed_by_user_id.eq.${profileId}`;
}

/** סינון לקוח (התראות ציות וכו'): אותו היקף כמו רשימות רכבים לבעל פלטפורמה */
export function rowInPlatformOwnerFleetScope(
  rowOrgId: string | null | undefined,
  managedByUserId: string | null | undefined,
  effectiveOrgId: string,
  viewerProfileId: string,
  isPlatformSuperOwner: boolean,
): boolean {
  if (!isPlatformSuperOwner) {
    return rowOrgId === effectiveOrgId;
  }
  return rowOrgId === effectiveOrgId || managedByUserId === viewerProfileId;
}

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

export type TenantFleetViewProfileLike = {
  id: string;
  email: string | null;
  parent_admin_id?: string | null;
  managed_by_user_id?: string | null;
};

/**
 * PostgREST chain: מנהל פלטפורמה — «הצי שלי» (or org+managed_by אצלו) או «צפייה באדמין צי» (כמו אותו אדמין).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPlatformOwnerFleetListFilter(
  q: any,
  options: {
    orgId: string;
    isPlatformSuperOwner: boolean;
    platformOwnerId: string;
    tenantViewProfile: TenantFleetViewProfileLike | null | undefined;
    /** נבחר אדמין אבל profiles לא הוחזר — נופלים ל־org בלבד */
    tenantViewLookupFailed?: boolean;
  },
) {
  const { orgId, isPlatformSuperOwner, platformOwnerId, tenantViewProfile, tenantViewLookupFailed } = options;
  if (!isPlatformSuperOwner || !platformOwnerId) {
    return q.eq('org_id', orgId);
  }
  if (tenantViewLookupFailed) {
    return q.eq('org_id', orgId);
  }
  if (tenantViewProfile) {
    const te = (tenantViewProfile.email ?? '').trim();
    let out = q.eq('org_id', orgId);
    if (!isRavidManagerEmail(te) && !isPlatformSuperOwnerEmail(te)) {
      const parent = (tenantViewProfile.parent_admin_id ?? tenantViewProfile.managed_by_user_id ?? '').trim() || null;
      out = out.or(
        fleetManagerVisibilityOrFilter(tenantViewProfile.id, {
          parentFleetOwnerProfileId: parent,
        }),
      );
    }
    return out;
  }
  return q.or(orgOrManagedByUserFilter(orgId, platformOwnerId));
}

/** שורה ברשימת צי / התראות — תואם {@link applyPlatformOwnerFleetListFilter} */
export function rowMatchesPlatformOrTenantFleetScope(
  rowOrgId: string | null | undefined,
  managedByUserId: string | null | undefined,
  effectiveOrgId: string,
  options: {
    isPlatformSuperOwner: boolean;
    platformOwnerProfileId: string;
    tenantViewProfile: TenantFleetViewProfileLike | null | undefined;
    tenantViewLookupFailed?: boolean;
  },
): boolean {
  const { isPlatformSuperOwner, platformOwnerProfileId, tenantViewProfile, tenantViewLookupFailed } = options;
  if (!isPlatformSuperOwner) {
    return rowOrgId === effectiveOrgId;
  }
  if (tenantViewLookupFailed) {
    return rowOrgId === effectiveOrgId;
  }
  if (tenantViewProfile) {
    if (rowOrgId !== effectiveOrgId) return false;
    const te = (tenantViewProfile.email ?? '').trim();
    if (isRavidManagerEmail(te)) return true;
    return fleetRowVisibleUnderManagerSlice(
      managedByUserId,
      tenantViewProfile.id,
      (tenantViewProfile.parent_admin_id ?? tenantViewProfile.managed_by_user_id ?? '').trim() || null,
    );
  }
  return rowInPlatformOwnerFleetScope(
    rowOrgId,
    managedByUserId,
    effectiveOrgId,
    platformOwnerProfileId,
    true,
  );
}
