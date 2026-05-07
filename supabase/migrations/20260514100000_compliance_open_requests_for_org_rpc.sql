-- =============================================================================
-- בקשות ציות פתוחות (sent/opened/pending_admin_review) למרכז הציות —
-- SELECT ישיר לעיתים ריק בגלל RLS/פרופיל; אותה לוגיקת גישה כמו ליסינג (RPC).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compliance_open_requests_for_org(p_org_id uuid)
RETURNS TABLE (
  driver_id uuid,
  entity_type text,
  entity_id uuid,
  task_key text,
  status text,
  sent_at timestamptz,
  metadata jsonb,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.driver_id,
    cr.entity_type,
    cr.entity_id,
    cr.task_key,
    cr.status,
    cr.sent_at,
    cr.metadata,
    cr.updated_at,
    cr.created_at
  FROM public.compliance_requests cr
  WHERE cr.org_id = p_org_id
    AND cr.status IN ('sent', 'opened', 'pending_admin_review')
    AND (
      public.is_platform_super_admin(auth.uid())
      OR public.user_belongs_to_org(auth.uid(), p_org_id)
    )
  ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.compliance_open_requests_for_org(uuid) IS
  'בקשות ציות פתוחות בארגון — מרכז ציות; עוקף מגבלות SELECT על compliance_requests כשצריך.';

REVOKE ALL ON FUNCTION public.compliance_open_requests_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_open_requests_for_org(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
