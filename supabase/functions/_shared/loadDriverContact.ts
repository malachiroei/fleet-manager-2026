import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DriverContact = {
  phone: string | null;
  email: string | null;
  full_name: string | null;
};

/**
 * Load driver phone/email for Procedure 6 staff emails.
 * Scoped by org_id when provided (multi-tenant).
 */
export async function loadDriverContact(
  admin: SupabaseClient,
  driverId: string | null | undefined,
  orgId?: string | null,
): Promise<DriverContact | null> {
  const id = String(driverId ?? '').trim();
  if (!id) return null;

  let q = admin.from('drivers').select('full_name, phone, email').eq('id', id);
  const oid = String(orgId ?? '').trim();
  if (oid) q = q.eq('org_id', oid);

  let { data, error } = await q.maybeSingle();
  if (error) {
    console.warn('[loadDriverContact]', error.message);
  }
  // Legacy rows / org mismatch: retry by id only
  if (!data && oid) {
    const retry = await admin.from('drivers').select('full_name, phone, email').eq('id', id).maybeSingle();
    data = retry.data;
    if (retry.error) console.warn('[loadDriverContact] retry', retry.error.message);
  }
  if (!data) return null;
  return {
    full_name: typeof data.full_name === 'string' ? data.full_name : null,
    phone: typeof data.phone === 'string' ? data.phone.trim() || null : null,
    email: typeof data.email === 'string' ? data.email.trim() || null : null,
  };
}
