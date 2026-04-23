-- Forms Center: metadata columns + seeded templates + JSON schemas

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'תפעול',
  ADD COLUMN IF NOT EXISTS json_schema jsonb,
  ADD COLUMN IF NOT EXISTS autofill_fields text[] NOT NULL DEFAULT ARRAY[]::text[];

DO $$
BEGIN
  -- פרו: ערכי category ישנים / תעתיקים — חייבים להתאים לפני CHECK
  UPDATE public.org_documents
  SET category = 'מסמכים אישיים'
  WHERE btrim(category) IN ('מסמכי אישור', 'מסמכי אישורים');

  UPDATE public.org_documents SET category = 'בטיחות' WHERE lower(btrim(category)) = 'safety';
  -- English keys from prod (distinct categories export: compliance, maintenance, safety, …)
  UPDATE public.org_documents
  SET category = 'תפעול'
  WHERE lower(btrim(category)) IN ('general', 'operations', 'maintenance', 'compliance');

  UPDATE public.org_documents
  SET category = 'תפעול'
  WHERE category IS NULL
     OR btrim(category) = ''
     OR btrim(category) NOT IN ('תפעול', 'בטיחות', 'מסמכים אישיים');

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'org_documents_category_check'
      AND conrelid = 'public.org_documents'::regclass
  ) THEN
    ALTER TABLE public.org_documents
      ADD CONSTRAINT org_documents_category_check
      CHECK (category IN ('תפעול', 'בטיחות', 'מסמכים אישיים'));
  END IF;
END $$;

WITH seed_data AS (
  SELECT *
  FROM (
    VALUES
      (
        'טופס מבחן מעשי',
        'הערכת נהיגה מעשית לפני קבלת רכב חברה.',
        'בטיחות',
        ARRAY[]::text[],
        '{"type":"object","title":"טופס מבחן מעשי","required":["employee_name","id_number","vehicle_number","date","vehicle_control","observation","traffic_sign_compliance"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"vehicle_control":{"type":"integer","title":"שליטה ברכב (1-5)","minimum":1,"maximum":5},"observation":{"type":"integer","title":"הסתכלות (1-5)","minimum":1,"maximum":5},"traffic_sign_compliance":{"type":"integer","title":"ציות לתמרורים (1-5)","minimum":1,"maximum":5},"tester_notes":{"type":"string","title":"הערות בוחן"}}}'::jsonb,
        false,
        true,
        true,
        10
      ),
      (
        'הצהרת בריאות משפחתית',
        'הצהרת בריאות שנתית לנהג ולשימוש משפחתי ברכב.',
        'בטיחות',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"הצהרת בריאות משפחתית","required":["employee_name","id_number","date","health_confirm"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"health_confirm":{"type":"boolean","title":"מאשר/ת כשירות רפואית לנהיגה"},"medical_notes":{"type":"string","title":"הערות רפואיות"}}}'::jsonb,
        false,
        true,
        true,
        20
      ),
      (
        'בקשה לשדרוג רכב',
        'בקשת עובד לשדרוג רכב חברה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"בקשה לשדרוג רכב","required":["employee_name","id_number","vehicle_number","date","upgrade_reason"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב נוכחי","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"upgrade_reason":{"type":"string","title":"סיבת הבקשה"},"requested_model":{"type":"string","title":"דגם מבוקש"}}}'::jsonb,
        false,
        true,
        false,
        30
      ),
      (
        'טופס מסירת רכב',
        'אימות קבלת רכב ואביזרים בעת מסירה.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס מסירת רכב","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"}}}'::jsonb,
        true,
        true,
        true,
        40
      ),
      (
        'טופס החזרת רכב',
        'אימות החזרת רכב ואביזרים בתום שימוש.',
        'תפעול',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"טופס החזרת רכב","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"damage_notes":{"type":"string","title":"הערות נזק"}}}'::jsonb,
        true,
        true,
        true,
        50
      ),
      (
        'טופס עדכון פרטים אישיים',
        'עדכון פרטים אישיים ופרטי התקשרות של הנהג.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','date']::text[],
        '{"type":"object","title":"טופס עדכון פרטים אישיים","required":["employee_name","id_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"phone":{"type":"string","title":"טלפון"},"email":{"type":"string","title":"אימייל"},"address":{"type":"string","title":"כתובת"}}}'::jsonb,
        false,
        true,
        false,
        60
      ),
      (
        'הצהרת נהג מורשה למשפחה',
        'הצהרת שימוש ברכב על ידי בני משפחה מורשים.',
        'מסמכים אישיים',
        ARRAY['employee_name','id_number','vehicle_number','date']::text[],
        '{"type":"object","title":"הצהרת נהג מורשה למשפחה","required":["employee_name","id_number","vehicle_number","date"],"properties":{"employee_name":{"type":"string","title":"שם עובד","x-autofill":"employee_name"},"id_number":{"type":"string","title":"תעודת זהות","x-autofill":"id_number"},"vehicle_number":{"type":"string","title":"מספר רכב","x-autofill":"vehicle_number"},"date":{"type":"string","title":"תאריך","x-autofill":"date"},"family_driver_name":{"type":"string","title":"שם בן משפחה"},"family_driver_id":{"type":"string","title":"ת.ז בן משפחה"}}}'::jsonb,
        false,
        true,
        true,
        70
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
  FROM seed_data s
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
FROM seed_data s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.org_documents d
  WHERE d.title = s.title
);
