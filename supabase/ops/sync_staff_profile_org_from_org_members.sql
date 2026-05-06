-- דוגמה: להתאים profiles.org_id ל־org_id אם יש שורה ב־org_members בלי נגיעה בנהגים.
-- החלף את :org_id ב־UUID הארגון (למשל של רביד) והרץ בשעת הצורך.

-- UPDATE public.profiles p
-- SET org_id = m.org_id,
--     updated_at = now()
-- FROM public.org_members m
-- WHERE m.user_id = p.id
--   AND m.org_id = :org_id::uuid
--   AND (p.org_id IS DISTINCT FROM m.org_id);

-- ודא שלכל עובד שנמצא בארגון זה יש רשומת org_members:
-- INSERT INTO public.org_members (user_id, org_id)
-- SELECT p.id, :org_id::uuid
-- FROM public.profiles p
-- WHERE lower(trim(p.email)) IN ('...', '...')
--   AND NOT EXISTS (
--     SELECT 1 FROM public.org_members om
--     WHERE om.user_id = p.id AND om.org_id = :org_id::uuid
--   );
