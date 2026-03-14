import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { PwaInstallButton } from '@/components/PwaInstallButton';

export default function ResetPasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // After recovery link, Supabase sets session from URL hash; allow a short moment for auth to settle
  const [allowRedirect, setAllowRedirect] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAllowRedirect(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!allowRedirect || authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, allowRedirect, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: 'שגיאה',
        description: 'הסיסמאות אינן תואמות',
        variant: 'destructive',
      });
      return;
    }
    if (password.length < 6) {
      toast({
        title: 'שגיאה',
        description: 'הסיסמה חייבת להכיל לפחות 6 תווים',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'שגיאה בעדכון הסיסמה',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setSuccess(true);
    toast({ title: 'הסיסמה עודכנה בהצלחה' });
    setTimeout(() => navigate('/', { replace: true }), 1500);
  };

  if (authLoading || (!user && !allowRedirect)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-4">
        <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3">
          <PwaInstallButton variant="auth" />
        </div>
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
        <p className="mt-4 text-white/70 text-sm">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-4">
        <Card className="w-full max-w-md border-white/10 bg-[#0d1b2e] text-white">
          <CardContent className="pt-6 text-center">
            <p className="text-cyan-200">הסיסמה עודכנה. מעביר לדף הבית...</p>
            <Loader2 className="h-8 w-8 animate-spin mx-auto mt-4 text-cyan-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] p-4">
      <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3">
        <PwaInstallButton variant="auth" />
      </div>
      <Card className="w-full max-w-md border-white/10 bg-[#0d1b2e] text-white shadow-xl shadow-black/40">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto mb-3 flex justify-center rounded-2xl bg-[#0a1525] p-4">
            <Lock className="h-12 w-12 text-cyan-400" />
          </div>
          <CardTitle className="text-xl font-bold text-white">עדכון סיסמה</CardTitle>
          <CardDescription className="text-cyan-400/70">
            הזן סיסמה חדשה. יש להשתמש בלפחות 6 תווים.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-white/90">
                סיסמה חדשה
              </Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                placeholder="••••••••"
                minLength={6}
                required
                dir="ltr"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-white/90">
                אימות סיסמה
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                placeholder="••••••••"
                minLength={6}
                required
                dir="ltr"
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              עדכן סיסמה
            </Button>
          </form>
          <p className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="text-cyan-400 hover:text-cyan-300 text-sm underline"
            >
              חזרה להתחברות
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
