-- Ensure forms manager email is present for upload visibility fallback

DO $$
DECLARE
  existing_id uuid;
  existing_admin_email text;
BEGIN
  SELECT id, admin_email
  INTO existing_id, existing_admin_email
  FROM public.organization_settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.organization_settings (admin_email)
    VALUES ('malachiroei@gmail.com');
  ELSE
    IF position('malachiroei@gmail.com' in coalesce(existing_admin_email, '')) = 0 THEN
      UPDATE public.organization_settings
      SET admin_email = trim(both ',' from concat_ws(',', nullif(existing_admin_email, ''), 'malachiroei@gmail.com')),
          updated_at = now()
      WHERE id = existing_id;
    END IF;
  END IF;
END $$;
