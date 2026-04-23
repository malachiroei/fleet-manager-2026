-- =============================================================================
-- פרו: profiles.org_id של רביד לפעמים הועתק לצי הראשי (כמו רועי) — RLS של
-- «עמיתים באותו ארגון» לא מאפשר לראות את ROEIMA21 ב־RAVID_FLEET_ORG_ID.
-- עדכון חד־פעמי כשהשילוב תואם (מייל רביד + org = main fleet fallback).
-- אם ה־UUID של ארגון רביד אצלך שונה — ערוך את ה־SET או השתמש ב־SQL ידני.
-- =============================================================================

UPDATE public.profiles AS p
SET
  org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'::uuid,
  updated_at = now()
WHERE lower(trim(coalesce(p.email, ''))) = 'ravidmalachi@gmail.com'
  AND p.org_id = '857f2311-2ec5-41d3-8e32-dacd450a9a77'::uuid;

-- אופציונלי: חברות ב־org_members (אם הטבלה בשימוש ואין שורה)
INSERT INTO public.org_members (user_id, org_id)
SELECT p.id, '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'::uuid
FROM public.profiles p
WHERE lower(trim(coalesce(p.email, ''))) = 'ravidmalachi@gmail.com'
ON CONFLICT (user_id, org_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
