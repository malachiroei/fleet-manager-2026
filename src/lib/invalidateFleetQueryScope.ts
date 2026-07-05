import type { QueryClient } from '@tanstack/react-query';

/** שורשי מפתחות React Query שתלויים ב־org / משתמש פעיל — בלי `clear()` שמפיל את כל האפליקציה. */
const FLEET_SCOPED_QUERY_ROOTS = [
  'dashboard-stats',
  'compliance-alerts',
  'vehicles',
  'drivers',
  'active-driver-vehicle-assignments',
  'feature-flags',
  'team-members',
  'org-invitations',
  'view-as-target-roles',
  'view-as-scoped-driver',
  'platform-tenant-fleet-view-profile',
] as const;

export function invalidateFleetScopedQueries(client: QueryClient): void {
  for (const root of FLEET_SCOPED_QUERY_ROOTS) {
    void client.invalidateQueries({ queryKey: [root] });
  }
}

/** מונע invalidation חוזר בכל mount של Dashboard (חזרה לבית) — רק כשהיקף org/view-as באמת השתנה. */
let lastFleetScopeInvalidateKey: string | null = null;

export function invalidateFleetScopedQueriesIfScopeChanged(
  client: QueryClient,
  scopeKey: string,
): void {
  if (lastFleetScopeInvalidateKey === scopeKey) return;
  lastFleetScopeInvalidateKey = scopeKey;
  invalidateFleetScopedQueries(client);
}

/** רענון דגלי UI רק כשמחליפים ארגון פעיל — לא בכל כניסה מחדש לדשבורד. */
let lastFeatureFlagsInvalidatedOrgId: string | null = null;

export function invalidateFeatureFlagQueriesIfOrgChanged(
  client: QueryClient,
  orgId: string | null | undefined,
): void {
  const org = (orgId ?? '').trim();
  if (!org || lastFeatureFlagsInvalidatedOrgId === org) return;
  lastFeatureFlagsInvalidatedOrgId = org;
  void client.invalidateQueries({ queryKey: ['feature-flags'] });
  void client.invalidateQueries({ queryKey: ['user-feature-overrides'] });
  void client.invalidateQueries({ queryKey: ['feature-flags-user-overrides-list'] });
}
