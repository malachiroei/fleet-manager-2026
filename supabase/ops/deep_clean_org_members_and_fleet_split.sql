-- =============================================================================
-- Deep clean — להרצה חד-פעמית ב-SQL Editor של Supabase (כל הבלוק בסדר).
-- 1) ניקוי כפילויות org_members
-- 2) UNIQUE (user_id, org_id)
-- 3) UPSERT organizations (שלושת המזהים)
-- 4) חלוקת רכבים ונהגים: 6 → ארגון על (2bb0f9c3…) | 5 → רביד (1111…) | השאר → רועי21 (2222…)
-- 5) ניקוי managed_by_user_id סותר org
--
-- ארגונים:
--   ארגון על (בעל פלטפורמה): 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
--   ארגון 1 (רביד):          11111111-2222-3333-4444-555555555555
--   ארגון 2 (רועי21):        22222222-3333-4444-5555-666666666666
-- =============================================================================

BEGIN;

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, org_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.org_members
)
DELETE FROM public.org_members om
USING ranked r
WHERE om.id = r.id
  AND r.rn > 1;

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_user_org;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_user_org UNIQUE (user_id, org_id);

INSERT INTO public.organizations (id, name)
VALUES
  (
    '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'::uuid,
    'ארגון על — בעל פלטפורמה (רועי)'
  ),
  (
    '11111111-2222-3333-4444-555555555555'::uuid,
    'ארגון 1 — רביד'
  ),
  (
    '22222222-3333-4444-5555-666666666666'::uuid,
    'ארגון 2 — רועי21'
  )
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

UPDATE public.vehicles v
SET org_id = CASE
  WHEN n.rn <= 6 THEN '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'::uuid
  WHEN n.rn <= 11 THEN '11111111-2222-3333-4444-555555555555'::uuid
  ELSE '22222222-3333-4444-5555-666666666666'::uuid
END,
updated_at = COALESCE(v.updated_at, now())
FROM (
  SELECT id,
    row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM public.vehicles
) n
WHERE v.id = n.id;

UPDATE public.drivers d
SET org_id = CASE
  WHEN n.rn <= 6 THEN '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'::uuid
  WHEN n.rn <= 11 THEN '11111111-2222-3333-4444-555555555555'::uuid
  ELSE '22222222-3333-4444-5555-666666666666'::uuid
END,
updated_at = COALESCE(d.updated_at, now())
FROM (
  SELECT id,
    row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM public.drivers
) n
WHERE d.id = n.id;

UPDATE public.vehicles v
SET managed_by_user_id = NULL,
    updated_at = COALESCE(v.updated_at, now())
WHERE v.managed_by_user_id IS NOT NULL
  AND (
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.managed_by_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v.managed_by_user_id
        AND v.org_id IS NOT NULL
        AND p.org_id IS DISTINCT FROM v.org_id
    )
  );

UPDATE public.drivers d
SET managed_by_user_id = NULL,
    updated_at = COALESCE(d.updated_at, now())
WHERE d.managed_by_user_id IS NOT NULL
  AND (
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = d.managed_by_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = d.managed_by_user_id
        AND d.org_id IS NOT NULL
        AND p.org_id IS DISTINCT FROM d.org_id
    )
  );

COMMIT;
