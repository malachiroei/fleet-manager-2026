-- דוגמה: שיוך רכב לפי מספר רישוי + נהג למנהל צי (Ravid) — להריץ ב-SQL Editor אחרי שמילאת UUID.
--
-- אבחון לפני עדכון (Traverse / 80820602):
--   SELECT v.id, v.plate_number, v.org_id, v.assigned_driver_id, v.managed_by_user_id,
--          d.full_name AS driver_name, d.user_id AS driver_auth_user, d.managed_by_user_id AS driver_managed_by
--   FROM public.vehicles v
--   LEFT JOIN public.drivers d ON d.id = v.assigned_driver_id
--   WHERE v.plate_number = '80820602';
--
-- איך למצוא UUID של Ravid:
--   SELECT id, email, full_name FROM public.profiles WHERE email ILIKE '%ravid%';
--
-- הקשר בין טבלאות:
--   vehicles.assigned_driver_id → drivers.id
--   drivers.user_id → auth user של הנהג (אופציונלי)
--   vehicles.managed_by_user_id / drivers.managed_by_user_id → profiles.id של מנהל הצי הבלעדי
--
-- להחליף את שני ה-UUID לפני הרצה:

-- \set ravid_profile_id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

UPDATE public.vehicles v
SET managed_by_user_id = 'REPLACE_RAVID_PROFILE_UUID'::uuid
WHERE v.plate_number = '80820602';

-- אופציונלי: סמן את הנהג המשויך לאותו רכב (דרך assigned_driver_id)
UPDATE public.drivers d
SET managed_by_user_id = 'REPLACE_RAVID_PROFILE_UUID'::uuid
WHERE d.id IN (
  SELECT v.assigned_driver_id
  FROM public.vehicles v
  WHERE v.plate_number = '80820602' AND v.assigned_driver_id IS NOT NULL
);
