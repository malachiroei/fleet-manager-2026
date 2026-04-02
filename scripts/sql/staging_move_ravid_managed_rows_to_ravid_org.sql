-- =============================================================================
-- Staging: רכבים ונהגים שמנוהלים ע״י רביד (managed_by_user_id) → org של רביד.
-- כך התאמה ל־effectiveOrgId כשהמשתמש מחובר כרביד (profiles.org_id = ארגון רביד).
-- הרץ ב-SQL Editor של הסטייג׳ינג אחרי שיש profiles לרביד.
-- =============================================================================

DO $$
DECLARE
  ravid_org uuid := '2bb0f9c3-b210-4099-b0c5-de92794d5cc9';
BEGIN
  UPDATE public.vehicles v
  SET org_id = ravid_org
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
    AND v.managed_by_user_id = p.id;

  UPDATE public.drivers d
  SET org_id = ravid_org
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'ravidmalachi@gmail.com'
    AND d.managed_by_user_id = p.id;
END $$;
