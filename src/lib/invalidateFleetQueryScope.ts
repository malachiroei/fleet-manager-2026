import type { QueryClient } from '@tanstack/react-query';

/** שורשי מפתחות React Query שתלויים ב־org / משתמש פעיל — בלי `clear()` שמפיל את כל האפליקציה. */
const FLEET_SCOPED_QUERY_ROOTS = [
  'dashboard-stats',
  'compliance-alerts',
  'vehicles',
  'drivers',
  'feature-flags',
  'team-members',
  'org-invitations',
  'view-as-target-roles',
  'view-as-scoped-driver',
] as const;

export function invalidateFleetScopedQueries(client: QueryClient): void {
  for (const root of FLEET_SCOPED_QUERY_ROOTS) {
    void client.invalidateQueries({ queryKey: [root] });
  }
}
