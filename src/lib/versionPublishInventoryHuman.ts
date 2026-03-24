import type { VersionPublishInventoryKind } from '@/lib/versionPublishInventory';

export type PublishInventoryHuman = {
  /** כותרת ידידותית בעברית */
  title: string;
  /** מה נכלל בפרסום הגרסה עבור פריט זה */
  description: string;
};

/** מפתח = id במלאי (למשל pages/AddVehiclePage.tsx) */
const OVERRIDES: Record<string, PublishInventoryHuman> = {
  'root/package.json': {
    title: 'תשתית המערכת (Dependencies)',
    description:
      'רשימת החבילות ב-npm — בפרסום נשלח לריפו הפרודקשן יחד עם ה-lockfile כדי שסביבת הבנייה תהיה זהה.',
  },
  'root/package-lock.json': {
    title: 'נעילת גרסאות חבילות (lockfile)',
    description: 'גרסאות מדויקות של כל התלויות — נדרש לבנייה עקבית בפרודקשן.',
  },
  'pages/AddVehiclePage.tsx': {
    title: 'דף הוספת רכב חדש',
    description: 'טופס ומסך להוספת רכב לצי — נשמר ב-snapshot כרכיב הגרסה.',
  },
  'pages/AddDriverPage.tsx': {
    title: 'דף הוספת נהג',
    description: 'יצירת רשומת נהג חדשה במערכת.',
  },
  'pages/AddMaintenancePage.tsx': {
    title: 'דף רישום טיפול במוסך',
    description: 'הזנת טיפול/תחזוקה לרכב.',
  },
  'pages/AdminDashboardPage.tsx': {
    title: 'לוח בקרה למנהל',
    description: 'מסך סיכום וניהול למנהלי מערכת.',
  },
  'pages/AdminSettingsPage.tsx': {
    title: 'הגדרות אדמין',
    description: 'הגדרות מתקדמות, פרסום גרסה וממשקי ניהול.',
  },
  'pages/AdminUsersPage.tsx': {
    title: 'ניהול משתמשי אדמין',
    description: 'רשימה והגדרות משתמשים ברמת מערכת.',
  },
  'pages/AuthPage.tsx': {
    title: 'דף התחברות והרשמה',
    description: 'מסך כניסה למערכת.',
  },
  'pages/AuthCallbackPage.tsx': {
    title: 'השלמת אימות (callback)',
    description: 'מסך מעבר אחרי אימות מייל / ספק זהות.',
  },
  'pages/CompliancePage.tsx': {
    title: 'דף תקינות והתראות',
    description: 'מעקב אחר תוקף טסט, ביטוח והתראות צי.',
  },
  'pages/Dashboard.tsx': {
    title: 'לוח בקרה ראשי',
    description: 'מסך הבית לאחר התחברות — סיכום וקישורים מהירים.',
  },
  'pages/DriverDetailPage.tsx': {
    title: 'פרטי נהג',
    description: 'צפייה בפרופיל נהג בודד.',
  },
  'pages/DriverListPage.tsx': {
    title: 'רשימת נהגים',
    description: 'טבלת כל הנהגים בארגון.',
  },
  'pages/DriverSectionEditPage.tsx': {
    title: 'עריכת מקטע בפרופיל נהג',
    description: 'טופס לעדכון חלק ספציפי בתיק נהג.',
  },
  'pages/EditDriverPage.tsx': {
    title: 'עריכת נהג',
    description: 'עדכון פרטי נהג קיים.',
  },
  'pages/EditVehiclePage.tsx': {
    title: 'עריכת פרטי רכב',
    description: 'שינוי שדות רכב רשום.',
  },
  'pages/FormsPage.tsx': {
    title: 'מרכז טפסים',
    description: 'גישה לטפסים ומסמכים בארגון.',
  },
  'pages/Index.tsx': {
    title: 'עמוד נחיתה (Index)',
    description: 'נתיב כניסה ייעודי.',
  },
  'pages/NotFound.tsx': {
    title: 'עמוד 404',
    description: 'הודעה כשהנתיב לא קיים.',
  },
  'pages/OrgSettingsPage.tsx': {
    title: 'הגדרות ארגון',
    description: 'לוגו, שם ארגון והגדרות כלליות.',
  },
  'pages/Procedure6ComplaintsPage.tsx': {
    title: 'תלונות נוהל 6',
    description: 'ניהול תלונות לפי נוהל.',
  },
  'pages/ReportMileagePage.tsx': {
    title: 'דיווח קילומטראז׳',
    description: 'שליחת דיווח מרחק/דלק וכו׳.',
  },
  'pages/ReportsPage.tsx': {
    title: 'דוחות',
    description: 'צפייה והפקת דוחות.',
  },
  'pages/ReplacementVehicleHubPage.tsx': {
    title: 'מרכז רכב חליפי',
    description: 'ניהול והזנה הקשורה לרכב חליפי (מסירה/החזרה).',
  },
  'pages/ResetPasswordPage.tsx': {
    title: 'איפוס סיסמה',
    description: 'הגדרת סיסמה חדשה אחרי קישור מייל.',
  },
  'pages/ScanReportPage.tsx': {
    title: 'סריקת דוח',
    description: 'העלאה/סריקה של דוח לטיפול.',
  },
  'pages/TeamManagementPage.tsx': {
    title: 'ניהול צוות והזמנות',
    description: 'חברי ארגון, הרשאות גסות והזמנות פתוחות.',
  },
  'pages/TeamManagement.tsx': {
    title: 'ניהול צוות (נתיב alias)',
    description: 'מפנה ל־TeamManagementPage — תיעוד גרסה כולל ניהול צוות.',
  },
  'pages/TransfersPage.tsx': {
    title: 'העברות רכב',
    description: 'מעקב אחר העברות/שינויים ברכבים.',
  },
  'pages/UpdateOdometerPage.tsx': {
    title: 'עדכון מד מרחק',
    description: 'הזנת קילומטראז׳ נוכחי לרכב.',
  },
  'pages/VehicleDeliveryPage.tsx': {
    title: 'מסירת רכב',
    description: 'תהליך מסירת רכב לנהג.',
  },
  'pages/VehicleDetailPage.tsx': {
    title: 'פרטי רכב',
    description: 'כרטיס רכב מלא — פרטים, מסמכים וקישורים.',
  },
  'pages/VehicleHandoverWizard.tsx': {
    title: 'אשף מסירה/החזרה',
    description: 'תהליך מודרך למסירה או החזרת רכב.',
  },
  'pages/VehicleListPage.tsx': {
    title: 'רשימת רכבים',
    description: 'טבלת כל הרכבים בצי.',
  },
  'pages/VehicleReturnPage.tsx': {
    title: 'החזרת רכב',
    description: 'תיעוד החזרת רכב מנהג.',
  },
};

function kindDefaultDescription(kind: VersionPublishInventoryKind, pathId: string): string {
  if (kind === 'page') {
    return `מסך באפליקציה — הקובץ ${pathId} נכלל ב־version_snapshot כדי לתעד איזה חלק מהממשק השתנה בגרסה.`;
  }
  if (kind === 'form') {
    return `טופס או רכיב טפסים — משפיע על הזנת נתונים; נשלח בפרסום לתיעוד שינויי UI/לוגיקה.`;
  }
  if (kind === 'button') {
    return `רכיב כפתור או פעולה — חלק מממשק המשתמש שעשוי להשתנות בין גרסאות.`;
  }
  if (kind === 'infra') {
    return 'פריט תשתית — חשוב לתאום גרסאות build בין סביבות.';
  }
  return `קוד לוגיקה/הוק — ${pathId} משמש לתיעוד שינויים טכניים בגרסה.`;
}

/**
 * כותרת ותיאור בעברית לפריט במלאי הפרסום.
 */
export function getPublishInventoryHuman(
  id: string,
  technicalName: string,
  kind: VersionPublishInventoryKind,
): PublishInventoryHuman {
  const hit = OVERRIDES[id];
  if (hit) return hit;

  let title = technicalName.replace(/\.(tsx|ts)$/i, '');
  if (kind === 'page' && /Page$/i.test(title)) {
    title = `דף ${title.replace(/Page$/i, '').replace(/([A-Z])/g, ' $1').trim()}`;
  } else if (kind === 'form' && /Form$/i.test(title)) {
    title = `טופס ${title.replace(/Form$/i, '').replace(/([A-Z])/g, ' $1').trim()}`;
  } else {
    title = `${kind === 'page' ? 'דף' : kind === 'form' ? 'טופס' : 'רכיב'} ${title.replace(/([A-Z])/g, ' $1').trim()}`;
  }

  return {
    title: title.trim() || technicalName,
    description: kindDefaultDescription(kind, id),
  };
}
