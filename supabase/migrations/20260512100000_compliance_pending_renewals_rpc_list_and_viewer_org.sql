-- =============================================================================
-- ליסינג: רשימת «ממתין לאישור מנהל» לא נטענת אם SELECT ישיר על compliance_requests חסום
-- לעומת ארגון שהמשתמש שייך אליו. RPC ב-SECURITY DEFINER + user_belongs_to_org (וכן פלטפורמה).
-- מרחיבים גם compliance_pending_vehicle_renewal_for_viewer לאותו תנאי (אחרת 409 לא מזריק שורה).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(p_request_id uuid)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  task_key text,
  task_label text,
  proposed_expiry_date date,
  submitted_document_url text,
  external_recipient_email text,
  request_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id,
    cr.entity_id,
    cr.task_key,
    cr.task_label,
    cr.proposed_expiry_date,
    cr.submitted_document_url,
    cr.external_recipient_email,
    cr.request_url
  FROM public.compliance_requests cr
  WHERE cr.id = p_request_id
    AND cr.status = 'pending_admin_review'
    AND cr.entity_type = 'vehicle'
    AND cr.task_key IN ('annual_licensing', 'insurance')
    AND (
      public.is_platform_super_admin(auth.uid())
      OR public.user_belongs_to_org(auth.uid(), cr.org_id)
    );
$$;

COMMENT ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) IS
  'שורת הגשת ליסינג pending_admin_review לפי id — לצפייה מאומתת בארגון (או פלטפורמה), ללא תלות ב-SELECT RLS.';

CREATE OR REPLACE FUNCTION public.compliance_pending_vehicle_renewals_for_org(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  task_key text,
  task_label text,
  proposed_expiry_date date,
  submitted_document_url text,
  external_recipient_email text,
  request_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id,
    cr.entity_id,
    cr.task_key,
    cr.task_label,
    cr.proposed_expiry_date,
    cr.submitted_document_url,
    cr.external_recipient_email,
    cr.request_url
  FROM public.compliance_requests cr
  WHERE cr.org_id = p_org_id
    AND cr.status = 'pending_admin_review'
    AND cr.entity_type = 'vehicle'
    AND cr.task_key IN ('annual_licensing', 'insurance')
    AND (
      public.is_platform_super_admin(auth.uid())
      OR public.user_belongs_to_org(auth.uid(), p_org_id)
    )
  ORDER BY cr.created_at DESC;
$$;

COMMENT ON FUNCTION public.compliance_pending_vehicle_renewals_for_org(uuid) IS
  'כל הגשות ליסינג ממתינות לאישור בארגון — לטעינת מרכז ציות; זהים לתחום user_belongs_to_org או בעל פלטפורמה.';

REVOKE ALL ON FUNCTION public.compliance_pending_vehicle_renewals_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_pending_vehicle_renewals_for_org(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
