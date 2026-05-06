-- Point fix: vehicle 82492403 (Toyota RAV4) should be owned by roeima21, not Ravid.

BEGIN;

UPDATE public.vehicles
SET managed_by_user_id = '72c77494-79a5-4ad5-a38a-65d34155a6ca',
    updated_at = now()
WHERE plate_number = '82492403';

SELECT id, plate_number, manufacturer, model, org_id, managed_by_user_id
FROM public.vehicles
WHERE plate_number = '82492403';

COMMIT;
