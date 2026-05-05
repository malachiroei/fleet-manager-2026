-- Repair visibility split in shared org (Ravid vs roeima21) after temporary NULL reset.
-- Goal:
-- 1) Ravid delegates (arikzohargold, malachiroei1) should see Ravid fleet.
-- 2) roeima21 should not see Ravid fleet unless explicitly owned by roeima21.

BEGIN;

-- Known ids in this project:
-- org:        2bb0f9c3-b210-4099-b0c5-de92794d5cc9
-- ravid:      26854798-162b-4369-b34b-3010267678bd
-- roeima21:   72c77494-79a5-4ad5-a38a-65d34155a6ca

-- 1) Drivers: keep roeima21 self row owned by roeima21 (if exists),
--    move all other NULL-owned drivers in this org to Ravid.
UPDATE public.drivers d
SET managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca',
    updated_at = now()
WHERE d.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND d.managed_by_user_id IS NULL
  AND (
    d.user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca'
    OR lower(trim(coalesce(d.email, ''))) = 'roeima21@gmail.com'
  );

UPDATE public.drivers d
SET managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
    updated_at = now()
WHERE d.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND d.managed_by_user_id IS NULL;

-- 2) Vehicles: any NULL-owned vehicle in this shared org => Ravid.
UPDATE public.vehicles v
SET managed_by_user_id = '26854798-162b-4369-b34b-3010267678bd',
    updated_at = now()
WHERE v.org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND v.managed_by_user_id IS NULL;

COMMIT;

-- Verify after run:
-- SELECT managed_by_user_id, count(*) FROM public.drivers
-- WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9' GROUP BY managed_by_user_id;
-- SELECT managed_by_user_id, count(*) FROM public.vehicles
-- WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9' GROUP BY managed_by_user_id;
