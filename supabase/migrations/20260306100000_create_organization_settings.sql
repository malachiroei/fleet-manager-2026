-- ─────────────────────────────────────────────────────────────────────────────
-- organization_settings  (singleton table — always exactly one row)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name              text NOT NULL DEFAULT '',
  org_id_number         text NOT NULL DEFAULT '',
  admin_email           text NOT NULL DEFAULT '',
  health_statement_text text NOT NULL DEFAULT '',
  vehicle_policy_text   text NOT NULL DEFAULT '',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Only the service role / authenticated users can read/write
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read org settings"
  ON public.organization_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated upsert org settings"
  ON public.organization_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed default row with the existing hardcoded texts
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.organization_settings (
  org_name,
  org_id_number,
  admin_email,
  health_statement_text,
  vehicle_policy_text
) VALUES (
  '',
  '',
  '',
  -- health_statement_text: one declaration per line
  E'אינני סובל/ת ממחלת עצבים, אפילפסיה או מחלה העלולה לגרום לאובדן הכרה בזמן נהיגה.\nכושר הראייה שלי תקין (עם תיקון אופטי אם נדרש) ואני מחזיק/ה משקפי ראייה/עדשות בעת הצורך.\nכושר השמיעה שלי תקין ואינני סובל/ת מלקות שמיעה משמעותית.\nאינני נוטל/ת תרופות הגורמות לנמנום, ירידת ריכוז או פגיעה בכושר הנהיגה.\nמצב בריאותי הכללי מאפשר נהיגה בטוחה, ואני כשיר/ה פיזית לנהוג ברכב זה.\nאני מצהיר/ה כי כל הפרטים לעיל נכונים ומדויקים, ואני מודע/ת לאחריותי בנהיגה.',
  -- vehicle_policy_text: one clause per line
  E'הרכב ישמש לצרכי עבודה בלבד, לנסיעות מוסמכות על-פי תפקיד המחזיק.\nחל איסור מוחלט על נהיגה תחת השפעת אלכוהול, סמים או תרופות המשפיעות על הנהיגה.\nחל איסור על נהיגה במצב עייפות. הנהג חייב להפסיק לנסוע ולנוח.\nהנהג חייב לציית לכל חוקי התנועה ולשמור על בטיחות הנסיעה בכל עת.\nהנהג אחראי לבצע בדיקות שגרתיות: מפלס שמן, מים, לחץ צמיגים לפני נסיעה.\nכל תאונה — יש לדווח לממונה ולמחלקת הרכב באופן מיידי, ללא דיחוי.\nכל נזק לרכב, יהיה קטן ככל שיהיה, יש לדווח ולתעד בטרם לקיחת הרכב.\nחל איסור מוחלט על עישון, אכילה ושתייה ברכב המגורים/נוסעים.\nהנהג מחויב להחזיר את הרכב נקי ומסודר, ולדאוג לניקיון שוטף.\nחניה תבוצע במקומות מורשים בלבד. דוחות חניה בגין חניה אסורה — על חשבון הנהג.\nעמלות כבישי אגרה (כביש 6, מנהרות וכד׳) — יחויבו על חשבון הנהג, אלא אם הוסמך אחרת.\nחל איסור להשתמש ברכב למטרות אישיות מחוץ לשעות ולמסגרת האישור שניתן.\nהנהג אינו רשאי להשכיר, להלוות או להעביר את הרכב לצד שלישי כלשהו.\nחל איסור מוחלט לבצע שינויים, תוספות או שדרוגים ברכב ללא אישור מחלקת הרכב.\nנסיעה מחוץ לגבולות ישראל מחייבת אישור מפורש מראש ממנהל המחלקה.\nאין להשאיר חפצי ערך או ציוד ארגוני ברכב בעת חנייה. הסיכון — על הנהג.\nהנהג מחויב לעדכן קריאת מד-אמת בכל תחילת חודש ועם סיום נסיעה עסקית.\nהנהג אחראי לוודא שהביטוח והרישיונות בתוקף. נסיעה עם רישיון פג תוקף — אחריות הנהג.\nרכב חברה אינו מבוטח לשימוש פרטי מלא; נהיגה חריגה עלולה לגרור חיוב אישי בנזק.\nהחזרת הרכב תיעשה באותו מצב כפי שהוחזר, כולל מפתחות, ניירות ואביזרים.\nהפרת נוהל זה תגרור נקיטת הליכים משמעתיים וגישת אחריות אישית לנזקים.'
) ON CONFLICT DO NOTHING;
