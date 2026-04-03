-- =============================================================================
-- Staging: הפרדת נתונים רביד מול רועי (Supabase SQL Editor או psql).
-- בדוק SELECT לפני עדכון אם האימיילים אצלכם שונים.
--
-- אחרי שינויי סכימה / העתקת DB: להשלמת שיוך צי מלא הרץ גם
--   scripts/sql/staging_ravid_single_fleet_pin_and_sweep.sql
-- (כל הצי תחת malachiroei@gmail.com; סילברדו 99-888-77 + «רביד הקוף» תחת ravidmalachi@gmail.com).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  ravid_org constant uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
BEGIN
  UPDATE public.vehicles v
  SET org_id = ravid_org
  WHERE regexp_replace(upper(trim(v.plate_number)), '[^A-Z0-9]', '', 'g') = '9988877';

  UPDATE public.drivers d
  SET org_id = ravid_org
  WHERE d.full_name ILIKE '%רביד%קוף%'
     OR d.full_name ILIKE '%ravid%monkey%';

  UPDATE public.profiles p
  SET org_id = ravid_org
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com';

  DELETE FROM public.org_members om
  USING public.profiles p
  WHERE om.user_id = p.id
    AND lower(trim(p.email)) = 'ravidmalachi@gmail.com'
    AND om.org_id IS DISTINCT FROM ravid_org;

  INSERT INTO public.org_members (user_id, org_id)
  SELECT p.id, ravid_org
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
    AND NOT EXISTS (
      SELECT 1
      FROM public.org_members om
      WHERE om.user_id = p.id
        AND om.org_id = ravid_org
    );
END $$;

COMMIT;
