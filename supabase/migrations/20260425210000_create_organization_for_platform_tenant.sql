-- =============================================================================
-- הזמנת אדמין ארגון חדש ע"י חשבון על: INSERT ל-organizations נחסם ע"י RLS
-- (can_org_admin_write דורש כבר שיוך לארגון). RPC ב-SECURITY DEFINER יוצר
-- ארגון נפרד למוזמן בלי לשבור את מדיניות ה-RLS הקיימת.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_organization_for_platform_tenant(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.user_may_cross_org_fleet_read(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_name IS NULL THEN
    v_name := 'ארגון חדש';
  END IF;

  INSERT INTO public.organizations (id, name)
  VALUES (gen_random_uuid(), left(v_name, 240))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_organization_for_platform_tenant(text) IS
  'Platform owner only: creates a new organizations row for an invited org admin (isolated tenant).';

REVOKE ALL ON FUNCTION public.create_organization_for_platform_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_for_platform_tenant(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
