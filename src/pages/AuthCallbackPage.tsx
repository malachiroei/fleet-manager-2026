import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

/**
 * Landing page for invite links (e.g. redirectTo from magic link).
 * Accept-invite logic runs in AuthProvider when user is set; this page
 * shows a short "Processing invite..." and then redirects to dashboard
 * so the user sees the correct org immediately.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    const t = setTimeout(() => navigate('/', { replace: true }), 800);
    return () => clearTimeout(t);
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">מעבד את ההזמנה ומעביר לדף הבית...</p>
    </div>
  );
}
