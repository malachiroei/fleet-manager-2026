-- =============================================================================
-- שליפת הגשת ליסינג (pending_admin_review) לפי מזהה — ללא תלות ב-RLS על SELECT ישיר,
-- אחרי שהלקוח קיבל existing_request_id מ־409 (השורה קיימת אבל לא נראית ב-list).
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
      OR (
        public.user_belongs_to_org(auth.uid(), cr.org_id)
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles pr
            WHERE pr.id = auth.uid()
              AND (
                COALESCE(pr.is_system_admin, false)
                OR COALESCE(pr.permissions, '{}'::jsonb) @> '{"compliance":true}'::jsonb
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND lower(trim(both from ur.role::text)) IN ('admin', 'fleet_manager')
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) IS
  'מחזיר שורת compliance_requests למסך אישור ליסינג כשיש מזהה מתשובת 409; דילוג על מגבלות SELECT של RLS כשיש הרשאת ציות/אדמין ארגון.';

REVOKE ALL ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_pending_vehicle_renewal_for_viewer(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
