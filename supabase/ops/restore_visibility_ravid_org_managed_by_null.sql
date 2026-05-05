-- Emergency visibility restore (Ravid org):
-- Use this if delegate users lost fleet visibility after managed_by bulk updates.
-- Effect: makes rows org-shared again by nulling managed_by_user_id in the target org.

BEGIN;

-- TODO: replace with the exact org id if different in your project.
-- Known Ravid org in this workspace:
-- 2bb0f9c3-b210-4099-b0c5-de92794d5cc9

UPDATE public.vehicles
SET managed_by_user_id = NULL
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id IS NOT NULL;

UPDATE public.drivers
SET managed_by_user_id = NULL
WHERE org_id = '2bb0f9c3-b210-4099-b0c5-de92794d5cc9'
  AND managed_by_user_id IS NOT NULL;

COMMIT;
