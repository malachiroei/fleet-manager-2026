-- =============================================================================
-- user_may_cross_org_fleet_read: היה רק malachiroei@gmail.com — רביד (ravidmalachi)
-- לא עבר INSERT/צי כשהמייל לא תואם. מיישרים ל־OWNERS ב־fleetBootstrapEmails.ts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_may_cross_org_fleet_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(trim(coalesce(u.email, ''))) IN (
        'malachiroei@gmail.com',
        'ravidmalachi@gmail.com'
      )
  );
$$;

COMMENT ON FUNCTION public.user_may_cross_org_fleet_read(uuid) IS
  'Platform bootstrap owners may cross-org fleet read/write helpers (align with fleetBootstrapEmails OWNERS).';

NOTIFY pgrst, 'reload schema';
