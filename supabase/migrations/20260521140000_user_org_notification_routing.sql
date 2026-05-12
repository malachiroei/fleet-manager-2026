-- ניתוב התראות מייל לפי משתמש + ארגון (כל אדמין מגדיר לעצמו רשימה והעדפות נושא).
-- אם אין שורות לארגון — Edge Functions נופלות ל-legacy ב-system_settings (התנהגות קודמת).

CREATE TABLE IF NOT EXISTS public.user_org_notification_routing (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_org_notification_routing_pkey PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_notification_routing_org_id
  ON public.user_org_notification_routing (org_id);

COMMENT ON TABLE public.user_org_notification_routing IS
  'רשימת מיילים והעדפות נושא — לכל משתמש בנפרד בתוך ארגון; שליחת מיילים מאחדת את כל השורות של org_id.';

ALTER TABLE public.user_org_notification_routing ENABLE ROW LEVEL SECURITY;

-- קריאה: כל חבר בארגון רואה את כל שורות הניתוב של אותו ארגון (מנהלים רואים מי הגדיר מה).
CREATE POLICY "user_org_notif_select_org_members"
  ON public.user_org_notification_routing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_members m
      WHERE m.org_id = user_org_notification_routing.org_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "user_org_notif_insert_own_member"
  ON public.user_org_notification_routing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.org_members m
      WHERE m.org_id = org_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "user_org_notif_update_own"
  ON public.user_org_notification_routing
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_org_notif_delete_own"
  ON public.user_org_notification_routing
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
