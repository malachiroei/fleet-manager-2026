-- Move remaining drivers owned by roeima21 to Ravid in shared org,
-- but keep roeima21 self profile/driver row under roeima21.

BEGIN;

-- IDs in this project:
-- org       = 2bb0f9c3-b210-4099-b0c5-de92794d5cc9
-- ravid     = 26854798-162b-4369-b34b-3010267678bd
-- roeima21  = 72c77494-79a5-4ad5-a38a-65d34155a6ca

-- Preview:
SELECT id, full_name, email, user_id, managed_by_user_id
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
ORDER BY full_name;

-- Keep roeima21 own row under roeima21, move others to Ravid.
UPDATE public.drivers d
SET managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
    updated_at = now()
WHERE d.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND d.managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
  AND NOT (
    d.user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
    OR lower(trim(coalesce(d.email, ''))) = 'roeima21@gmail.com'
  );

-- Verify:
SELECT managed_by_user_id, count(*) AS n
FROM public.drivers
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
GROUP BY managed_by_user_id
ORDER BY n DESC;

COMMIT;
