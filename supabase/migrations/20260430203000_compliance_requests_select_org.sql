-- מאפשר לחברים מחוברים בארגון לקרוא בקשות ציות לצורך תצוגת סטטוס במסך הניהול
CREATE POLICY "compliance_requests_select_same_org"
  ON public.compliance_requests
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), org_id));
