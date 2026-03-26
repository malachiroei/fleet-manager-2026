-- אבחון View As / צי — להרצה ידנית ב-SQL Editor (לא migration)
--
-- הרכבים בפרויקט מסוננים לפי org_id (לא לפי auth.uid()).
-- שיוך לנהג: assigned_driver_id → drivers.id; drivers.user_id → auth (אופציונלי).
-- הפרדה בין מנהלי צי באותו org: vehicles.managed_by_user_id / drivers.managed_by_user_id
-- (NULL = משותף לכל המנהלים; UUID של profiles.id = בלעדי למנהל הזה).
--
-- כשמציגים View As למנהל/מנהל צי באותו org — תראה את אותו צי ארגוני (זה צפוי).
-- כשמציגים View As לנהג (רק driver ב-user_roles) — האפליקציה מסננת רכבים עם
-- assigned_driver_id = שורת הנהג שבה drivers.user_id = המשתמש המוחלף.

-- החלף ב-UUID הארגון שלך:
-- \set org '857f2311-2ec5-41d3-8e32-dacd450a9a77'

SELECT 'vehicles per org' AS section, org_id, count(*) AS n
FROM public.vehicles
GROUP BY org_id
ORDER BY n DESC;

SELECT 'drivers linked to auth user (user_id)' AS section, d.id AS driver_id, d.full_name, d.user_id, d.org_id
FROM public.drivers d
WHERE d.user_id IS NOT NULL
ORDER BY d.org_id, d.full_name;

SELECT 'vehicles assigned to drivers with user_id' AS section,
  v.id AS vehicle_id, v.plate_number, v.org_id, v.assigned_driver_id, d.user_id AS driver_auth_user_id
FROM public.vehicles v
LEFT JOIN public.drivers d ON d.id = v.assigned_driver_id
WHERE v.assigned_driver_id IS NOT NULL
LIMIT 50;
