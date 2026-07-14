/**
 * Alias for staff emails / docs that use `/procedure6-respond?token=…`
 * → canonical public route `/procedure6/respond/:token`.
 */
import { Navigate, useSearchParams } from 'react-router-dom';

export default function Procedure6RespondQueryRedirect() {
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
        <p className="text-muted-foreground text-sm">חסר אסימון תגובה בקישור.</p>
      </div>
    );
  }

  return <Navigate to={`/procedure6/respond/${encodeURIComponent(token)}`} replace />;
}
