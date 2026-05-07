-- =============================================================================
-- ניקוי הגשות ליסינג «תקועות» (מונע שליחה חוזרת ב־409)
-- טבלה: public.compliance_requests
-- =============================================================================
-- שלב 1 — לראות מה ממתין (הרץ ראשון, העתק את ה-id הרלוונטי):

-- SELECT id, org_id, entity_id, task_key, status, external_recipient_email, proposed_expiry_date, created_at
-- FROM public.compliance_requests
-- WHERE status = 'pending_admin_review'
--   AND entity_type = 'vehicle'
--   AND task_key IN ('annual_licensing', 'insurance')
-- ORDER BY created_at DESC;

-- =============================================================================
-- שלב 2א — לבטל בקשות ספציפיות לפי מזהה (החלף את ה-UUIDים):

-- UPDATE public.compliance_requests
-- SET status = 'expired', updated_at = now()
-- WHERE id IN (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
-- );

-- =============================================================================
-- שלב 2ב — מחיקה מלאה (אם באמת רוצים למחוק מהמסד):

-- DELETE FROM public.compliance_requests
-- WHERE id IN (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
-- );

-- =============================================================================
-- שלב 2ג — לפי לוחית רכב (דורש org_id + entity_id = vehicles.id):

-- SELECT v.id AS vehicle_id, v.plate_number, v.org_id
-- FROM public.vehicles v
-- WHERE v.plate_number ILIKE '%87647203%';

-- אחרי שיש vehicle_id + org_id:
-- UPDATE public.compliance_requests
-- SET status = 'expired', updated_at = now()
-- WHERE org_id = '...org uuid...'
--   AND entity_type = 'vehicle'
--   AND entity_id = '...vehicle uuid...'
--   AND task_key = 'annual_licensing'
--   AND status = 'pending_admin_review';
