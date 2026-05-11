-- הסרת עותק HTML ישן של «טופס קבלת רכב» (אם קיים).
-- המסמך המלא מופק ממסמך מובנה: הרצה מחדש של «סנכרון מסמכי מערכת» במרכז הטפסים (מפתח system-reception-form-printable).

DELETE FROM public.org_documents
WHERE file_url = '/forms/vehicle-receipt-form-print-he.html';
