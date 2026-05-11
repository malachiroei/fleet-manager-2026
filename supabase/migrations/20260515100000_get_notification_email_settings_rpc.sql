-- קריאת כתובות מייל והעדפות נושא — עוקף RLS על SELECT אם הוגדר חסימה, ומחזיר תמיד את הערך האמיתי מהטבלה.

CREATE OR REPLACE FUNCTION public.get_notification_email_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN jsonb_build_object(
    'emails',
    COALESCE(
      (SELECT value FROM public.system_settings WHERE key = 'notification_emails'),
      '[]'::jsonb
    ),
    'topic_prefs',
    COALESCE(
      (SELECT value FROM public.system_settings WHERE key = 'notification_email_topic_prefs'),
      '{}'::jsonb
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_notification_email_settings() IS
  'מחזיר notification_emails + notification_email_topic_prefs — קריאה עקבית אחרי upsert_notification_email_settings.';

REVOKE ALL ON FUNCTION public.get_notification_email_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_email_settings() TO authenticated;

NOTIFY pgrst, 'reload schema';
