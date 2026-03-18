-- Add 3 more forms so Forms Center includes 10 seeded records

WITH extra_seed AS (
  SELECT *
  FROM (
    VALUES
      (
        'טופס אישור נסיעה חריגה',
        'בקשה ואישור לנסיעה חריגה מחוץ למסגרת השגרה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס אישור נסיעה חריגה","required":["employee_name","id_number","vehicle_number","date","exception_reason"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"exception_reason":{"type":"string","title":"סיבת החריגה"}}}'::jsonb,
        true,
        true,
        true,
        80
      ),
      (
        'טופס דיווח כמעט-תאונה',
        'דיווח בטיחותי על אירוע כמעט-תאונה ללא נזק בפועל.',
        'בטיחות',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס דיווח כמעט-תאונה","required":["employee_name","id_number","vehicle_number","date","incident_description"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"incident_description":{"type":"string","title":"תיאור האירוע"}}}'::jsonb,
        false,
        true,
        true,
        90
      ),
      (
        'טופס הצהרת פרטיות נהג',
        'אישור נהג לעיבוד נתונים ושמירה על פרטיות.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"טופס הצהרת פרטיות נהג","required":["employee_name","id_number","date","consent"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"consent":{"type":"boolean","title":"מאשר/ת את מדיניות הפרטיות"}}}'::jsonb,
        false,
        true,
        false,
        100
      )
  ) AS t(
    title,
    description,
    category,
    autofill_fields,
    json_schema,
    include_in_handover,
    is_standalone,
    requires_signature,
    sort_order
  )
),
updated_rows AS (
  UPDATE public.org_documents d
  SET
    description = s.description,
    category = s.category,
    autofill_fields = s.autofill_fields,
    json_schema = s.json_schema,
    include_in_handover = s.include_in_handover,
    is_standalone = s.is_standalone,
    requires_signature = s.requires_signature,
    sort_order = s.sort_order,
    is_active = true,
    updated_at = now()
  FROM extra_seed s
  WHERE d.title = s.title
  RETURNING d.title
)
INSERT INTO public.org_documents (
  title,
  description,
  category,
  autofill_fields,
  json_schema,
  include_in_handover,
  is_standalone,
  requires_signature,
  sort_order,
  is_active
)
SELECT
  s.title,
  s.description,
  s.category,
  s.autofill_fields,
  s.json_schema,
  s.include_in_handover,
  s.is_standalone,
  s.requires_signature,
  s.sort_order,
  true
FROM extra_seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.org_documents d
  WHERE d.title = s.title
);
