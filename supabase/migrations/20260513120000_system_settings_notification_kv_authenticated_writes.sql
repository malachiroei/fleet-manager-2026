-- מאפשר לכל משתמש מחובר לערוך מפתחות התראות מייל (-- notification_emails, notification_email_topic_prefs)
-- בלי צורך ב-user_has_fleet_staff_privileges — כדי שהגדרות «כתובות מייל» יישמרו אצל מנהלי צי בפועל.
-- מדיניות staff הקיימת נשארת; מדיניות זו מתווספת (ב-PostgreSQL RLS למדיניות מרובות — OR בין מתירות).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    DROP POLICY IF EXISTS "system_settings_notification_kv_insert_authenticated" ON public.system_settings;
    DROP POLICY IF EXISTS "system_settings_notification_kv_update_authenticated" ON public.system_settings;
    DROP POLICY IF EXISTS "system_settings_notification_kv_delete_authenticated" ON public.system_settings;
    EXECUTE $sql$
      CREATE POLICY "system_settings_notification_kv_insert_authenticated"
        ON public.system_settings FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND key IN ('notification_emails', 'notification_email_topic_prefs')
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_notification_kv_update_authenticated"
        ON public.system_settings FOR UPDATE TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND key IN ('notification_emails', 'notification_email_topic_prefs')
        )
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND key IN ('notification_emails', 'notification_email_topic_prefs')
        );
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "system_settings_notification_kv_delete_authenticated"
        ON public.system_settings FOR DELETE TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND key IN ('notification_emails', 'notification_email_topic_prefs')
        );
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
