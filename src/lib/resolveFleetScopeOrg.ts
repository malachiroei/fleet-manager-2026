import type { Profile } from '@/types/fleet';

/**
 * מזהה ארגון לצי בלקוח: אם `profiles.org_id` לא תואם ל־org_members (למשל אחרי פיצול DB),
 * נעדיף ארגון מרשימת החברות שלא להציג צי ריק בזמן ש־RLS כבר מאפשר קריאה לפי החברות.
 */
export function resolveLockedFleetOrgIdForStaff(
  profile: Profile | null,
  memberOrgs: readonly { id: string }[],
): string | null {
  const pid = ((profile?.org_id ?? '') as string).trim() || null;
  const members = memberOrgs ?? [];
  if (members.length === 0) return pid;
  if (pid && members.some((o) => o.id === pid)) return pid;
  const first = members[0]?.id;
  return ((first ?? '') as string).trim() || pid;
}
