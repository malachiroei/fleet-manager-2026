-- Attach placeholder PDF URLs to seeded forms so download buttons are active

UPDATE public.org_documents
SET
  file_url = '/forms-files/form-practical-test.pdf',
  updated_at = now()
WHERE title = 'טופס מבחן מעשי';

UPDATE public.org_documents
SET
  file_url = '/forms-files/family-health-declaration.pdf',
  updated_at = now()
WHERE title = 'הצהרת בריאות משפחתית';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-upgrade-request.pdf',
  updated_at = now()
WHERE title = 'בקשה לשדרוג רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-delivery-form.pdf',
  updated_at = now()
WHERE title = 'טופס מסירת רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/vehicle-return-form.pdf',
  updated_at = now()
WHERE title = 'טופס החזרת רכב';

UPDATE public.org_documents
SET
  file_url = '/forms-files/personal-details-update.pdf',
  updated_at = now()
WHERE title = 'טופס עדכון פרטים אישיים';

UPDATE public.org_documents
SET
  file_url = '/forms-files/family-authorized-driver.pdf',
  updated_at = now()
WHERE title = 'הצהרת נהג מורשה למשפחה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/exception-travel-approval.pdf',
  updated_at = now()
WHERE title = 'טופס אישור נסיעה חריגה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/near-accident-report.pdf',
  updated_at = now()
WHERE title = 'טופס דיווח כמעט-תאונה';

UPDATE public.org_documents
SET
  file_url = '/forms-files/driver-privacy-declaration.pdf',
  updated_at = now()
WHERE title = 'טופס הצהרת פרטיות נהג';
