-- מסך מסירת רכב: להסיר את טופס המסירה הישן מהבחירה; להפעיל את «טופס קבלת רכב» (PDF מובנה) כשסומן למסירה

UPDATE public.org_documents
SET include_in_delivery = false
WHERE btrim(title) = 'טופס מסירת רכב';

UPDATE public.org_documents
SET include_in_delivery = true
WHERE coalesce(json_schema->>'builtin_template_key', '') = 'system-reception-form-printable';
