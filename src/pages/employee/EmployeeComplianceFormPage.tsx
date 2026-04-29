import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

export default function EmployeeComplianceFormPage() {
  const { token } = useParams<{ token: string }>();

  const tokenPreview = useMemo(() => {
    const t = String(token ?? '').trim();
    if (!t) return 'לא סופק טוקן בטופס';
    if (t.length <= 10) return t;
    return `${t.slice(0, 6)}...${t.slice(-4)}`;
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-white/10 bg-slate-900/50 p-6 text-right">
        <h1 className="text-2xl font-bold text-white">טופס ציות עובד</h1>
        <p className="mt-3 text-sm text-slate-300">
          דף זה נטען בהצלחה דרך קישור ציבורי. המשך המימוש של הטופס יחובר כאן.
        </p>
        <p className="mt-4 text-xs text-slate-400">מזהה קישור: {tokenPreview}</p>
        <div className="mt-6">
          <Link to="/" className="text-sm text-cyan-300 hover:text-cyan-200">
            חזרה למסך הראשי
          </Link>
        </div>
      </div>
    </main>
  );
}
