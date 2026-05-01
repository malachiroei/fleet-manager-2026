/**
 * טקסט הצהרת הבריאות — זהה במייל (Edge), בטופס הציבורי ובמסמך התמונה הממוזער.
 */
export function healthDeclarationSignerLine(driverName: string): string {
  const n = driverName.trim();
  return `אני החתום מטה: ${n || '________________'}`;
}

/** פסקאות גוף ההצהרה (בלי שורת «אני החתום מטה» וללא «חתימה:» בסוף — נוספים בנפרד במסמך) */
export const HEALTH_DECLARATION_PARAGRAPHS: readonly string[] = [
  'מצהיר בזה כי לא נתגלו אצלי, למיטב ידיעתי, מגבלות במערכת העצבים, העצמות, הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.',
  '1. לא נפסלתי מלהחזיק ברישיון נהיגה מבית משפט רשות הרישוי או קצין משטרה, ולחלופין רישיון הנהיגה אשר ברשותי לא הושעה על ידי גורמים כאמור.',
  '2. אין לי כל מגבלה בריאותית או רפואית המונעת ממני להחזיק ברישיון נהיגה.',
  '3. אינני צורך סמים.',
  '4. אינני צורך אלכוהול מעבר לכמות המותרת על פי דין בעת נהיגה. אני מתחייב/ת כי במידה ויוטלו הגבלות איזה שהן על רישיון הנהיגה אשר ברשותי ולחלופין, במידה יחול שינוי במצב בריאותי באופן המונע ממני מלהמשיך ולנהוג, אדווח על כך מיידית לקצין הבטיחות.',
  '5. הנני מצהיר/ה בזאת כי קיבלתי הדרכה לצורך תפעול וההפעלה של הרכב.',
  'ידוע לי שלפי תקנה 585א קצין הבטיחות בתעבורה בחברה מחויב לבדוק את נתוני רישיון הנהיגה שלי במשרד הרישוי.',
  'אני מצהיר בזה כי הצהרתי הנ״ל אמת.',
];

type HealthDeclarationLegalContentProps = {
  driverName: string;
  className?: string;
};

/** תצוגת ההצהרה לטופס ציבורי / תבנית הדפסה */
export function HealthDeclarationLegalContent({ driverName, className }: HealthDeclarationLegalContentProps) {
  return (
    <div className={className} dir="rtl">
      <p className="mb-3 text-base font-bold leading-relaxed text-black">{healthDeclarationSignerLine(driverName)}</p>
      <div className="space-y-3 text-sm leading-relaxed text-black">
        {HEALTH_DECLARATION_PARAGRAPHS.map((p, i) => (
          <p key={i} className="text-justify">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
