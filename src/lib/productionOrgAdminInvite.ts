import type { ProfilePermissions } from '@/types/fleet';

/** Full admin permission set for new production org owners (org_invitations.permissions). */
export const PRODUCTION_NEW_ORG_ADMIN_PERMISSIONS: ProfilePermissions = {
  manage_team: true,
  manage_vehicles: true,
  reports: true,
  fleet_access: true,
  report_mileage: true,
  forms: true,
};

export const PRODUCTION_INVITE_METADATA = {
  target_env: 'production' as const,
  redirect_to: 'https://fleet-manager-pro.vercel.app/auth',
};

export function newClientOrganizationId(): string {
  return crypto.randomUUID();
}
