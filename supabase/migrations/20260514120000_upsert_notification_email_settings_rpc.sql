-- שמירת כתובות מייל והעדפות נושא — עוקף RLS על system_settings (שם רק staff יכול לכתוב).
-- כל משתמש authenticated רשאי לעדכן רק את שני המפתחות האלה (המסך כבר מנהל).

CREATE OR REPLACE FUNCTION public.upsert_notification_email_settings(
  p_emails jsonb DEFAULT NULL,
  p_topic_prefs jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_emails IS NOT NULL THEN
    IF jsonb_typeof(p_emails) <> 'array' THEN
      RAISE EXCEPTION 'p_emails must be a json array' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.system_settings (key, value)
    VALUES ('notification_emails', p_emails)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now();
  END IF;

  IF p_topic_prefs IS NOT NULL THEN
    IF jsonb_typeof(p_topic_prefs) <> 'object' THEN
      RAISE EXCEPTION 'p_topic_prefs must be a json object' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.system_settings (key, value)
    VALUES ('notification_email_topic_prefs', p_topic_prefs)
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_notification_email_settings(jsonb, jsonb) IS
  'שומר notification_emails ו/או notification_email_topic_prefs — ללא תלות ב-RLS staff על system_settings.';

REVOKE ALL ON FUNCTION public.upsert_notification_email_settings(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_notification_email_settings(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
