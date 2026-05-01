-- זרימת ליסינג: בקשות רישוי שנתי / ביטוח לנציג חיצוני, הגשה לאישור מנהל
ALTER TABLE public.compliance_requests ALTER COLUMN driver_email DROP NOT NULL;

ALTER TABLE public.compliance_requests
  ADD COLUMN IF NOT EXISTS external_recipient_email text;

ALTER TABLE public.compliance_requests
  ADD COLUMN IF NOT EXISTS proposed_expiry_date date;

ALTER TABLE public.compliance_requests
  ADD COLUMN IF NOT EXISTS submitted_document_url text;

ALTER TABLE public.compliance_requests DROP CONSTRAINT IF EXISTS compliance_requests_status_check;

ALTER TABLE public.compliance_requests ADD CONSTRAINT compliance_requests_status_check
  CHECK (status IN ('sent', 'opened', 'completed', 'expired', 'pending_admin_review'));

CREATE INDEX IF NOT EXISTS compliance_requests_pending_admin_org_idx
  ON public.compliance_requests (org_id)
  WHERE status = 'pending_admin_review';

COMMENT ON COLUMN public.compliance_requests.external_recipient_email IS 'מייל נציג ליסינג כשהזרימה אינה לנהג.';
COMMENT ON COLUMN public.compliance_requests.proposed_expiry_date IS 'תאריך תוקף שהנציג הגיש; יחול אחרי אישור מנהל.';
