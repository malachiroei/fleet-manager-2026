import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { getBrandLogoUrl } from '@/components/BrandLogo';
import { PwaInstallButton } from '@/components/PwaInstallButton';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

const RESET_PASSWORD_REDIRECT = () => `${window.location.origin}/reset-password`;

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /** נחיתה מהזמנה: ?org_id=... + email + signup=1 — מאלץ לשונית הרשמה ומסיר סשן קודם. */
  const inviteOrgId = useMemo(
    () => (searchParams.get('org_id') ?? '').trim(),
    [searchParams],
  );
  const inviteEmail = useMemo(
    () => (searchParams.get('email') ?? '').trim().toLowerCase(),
    [searchParams],
  );
  const isInviteLanding = Boolean(inviteOrgId);
  const defaultTab = isInviteLanding || searchParams.get('signup') === '1' ? 'signup' : 'login';

  /**
   * אם נחיתה מהזמנה ויש סשן ישן (שוב, מסיבה כלשהי) — מתנתקים מיידית כדי שהמוזמן
   * יראה את טופס ההרשמה ולא יזרוק אותו ל-`/` עם פרופיל זר/חסר.
   */
  useEffect(() => {
    if (!isInviteLanding) return;
    if (!user) return;
    void supabase.auth.signOut();
  }, [isInviteLanding, user]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        title: 'שגיאה בהתחברות',
        description: error.message === 'Invalid login credentials' 
          ? 'אימייל או סיסמה שגויים'
          : error.message,
        variant: 'destructive'
      });
    } else {
      navigate('/');
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const fullName = formData.get('fullName') as string;

    if (password !== confirmPassword) {
      toast({
        title: 'שגיאה',
        description: 'הסיסמאות אינן תואמות',
        variant: 'destructive'
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'שגיאה',
        description: 'הסיסמה חייבת להכיל לפחות 6 תווים',
        variant: 'destructive'
      });
      setIsLoading(false);
      return;
    }

    const { error } = await signUp(email, password, fullName);

    if (error) {
      if (error.message.includes('already registered')) {
        sonnerToast.error('שגיאה בהרשמה: כתובת האימייל כבר רשומה במערכת');
      } else {
        const detailedMessage = `שגיאת API בהרשמה: ${error.message}`;
        sonnerToast.error(detailedMessage);
        toast({
          title: 'שגיאה בהרשמה',
          description: detailedMessage,
          variant: 'destructive'
        });
      }
    } else if (isInviteLanding) {
      /** הרשמה מהזמנה: מצפים לאישור מנהל לפני גישה ל-app — `AppLayout` יציג מסך מתאים. */
      toast({
        title: 'ההרשמה הצליחה',
        description: 'החשבון ממתין לאישור מנהל. תקבל גישה למערכת מיד עם האישור.',
      });
      navigate('/', { replace: true });
    } else {
      toast({
        title: 'ההרשמה הצליחה!',
        description: 'נשלח אליך אימייל לאימות. אנא בדוק את תיבת הדואר שלך.'
      });
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotPasswordEmail.trim();
    if (!email) {
      toast({ title: 'נא להזין אימייל', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: RESET_PASSWORD_REDIRECT(),
    });
    setIsLoading(false);
    if (error) {
      toast({
        title: 'שגיאה בשליחת קישור לאיפוס',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setForgotPasswordSent(true);
    toast({
      title: 'נשלח קישור לאימייל',
      description: 'לחץ על הקישור באימייל כדי לאפס את הסיסמה. ייתכן שיופיע בתיקיית דואר זבל.',
    });
  };

  return (
    <div className="fleet-screen-page relative flex min-h-[100dvh] items-center justify-center p-2 sm:p-4 [@media(max-height:740px)]:p-1">
      {/* Install app – top corner, also available after login in header */}
      <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3">
        <PwaInstallButton variant="auth" />
      </div>
      <Card className="w-full max-w-md border-white/10 bg-[#0d1b2e] text-white shadow-xl shadow-black/40 max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <CardHeader className="text-center space-y-1 py-4 sm:py-5 [@media(max-height:760px)]:py-2 [@media(max-height:760px)]:space-y-0.5">
          {/* Dark strip so the white car pops; same idea as dashboard logo box */}
          <div className="mx-auto -mt-1 mb-2 flex justify-center rounded-2xl bg-[#0a1525] px-6 py-4 sm:px-8 sm:py-5 [@media(max-height:760px)]:mb-1 [@media(max-height:760px)]:px-4 [@media(max-height:760px)]:py-2">
            <img
              src={getBrandLogoUrl()}
              alt="Fleet Manager"
              className="h-auto w-56 sm:w-64 max-w-full max-h-[18vh] object-contain object-center drop-shadow-[0_0_24px_rgba(255,255,255,0.4)] [@media(max-height:760px)]:w-44 [@media(max-height:760px)]:max-h-[12vh]"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-white [@media(max-height:760px)]:text-xl">Fleet Manager Pro</CardTitle>
          <CardDescription className="text-cyan-400/70 [@media(max-height:760px)]:text-xs">
            מערכת ניהול צי רכבים מקצועית
          </CardDescription>
        </CardHeader>
        <CardContent className="text-white">
          {isInviteLanding ? (
            <div className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-center text-[13px] leading-snug text-cyan-100">
              קיבלת הזמנה להצטרף ל-Fleet Manager Pro. בצע הרשמה עם הסיסמה שתבחר —
              לאחר אישור המנהל תקבל גישה למערכת.
            </div>
          ) : null}
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/10 p-1 text-white/70">
              <TabsTrigger
                value="login"
                className="data-[state=active]:bg-[#0a1525] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                התחברות
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-[state=active]:bg-[#0a1525] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                הרשמה
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              {forgotPasswordSent ? (
                <div className="space-y-4 text-center">
                  <p className="text-cyan-200 text-sm">
                    נשלח אליך אימייל עם קישור לאיפוס סיסמה. לחץ על הקישור וקבע סיסמה חדשה.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-white/20 text-white hover:bg-white/10"
                    onClick={() => { setForgotPasswordSent(false); setForgotPassword(false); }}
                  >
                    חזרה להתחברות
                  </Button>
                </div>
              ) : forgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-white/90">
                      אימייל
                    </Label>
                    <Input
                      id="forgot-email"
                      className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                      type="email"
                      placeholder="your@email.com"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      required
                      dir="ltr"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                    שלח קישור לאיפוס סיסמה
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setForgotPassword(false); setForgotPasswordEmail(''); }}
                    className="w-full text-center text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    חזרה להתחברות
                  </button>
                </form>
              ) : (
                <>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-white/90">
                        אימייל
                      </Label>
                      <Input
                        id="login-email"
                        className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
                        name="email" 
                        type="email" 
                        placeholder="your@email.com"
                        required
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-white/90">
                        סיסמה
                      </Label>
                      <Input
                        id="login-password"
                        className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
                        name="password" 
                        type="password" 
                        required
                        dir="ltr"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                      התחבר
                    </Button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setForgotPassword(true)}
                    className="w-full text-center text-cyan-400 hover:text-cyan-300 text-sm mt-2"
                  >
                    שכחת סיסמה?
                  </button>
                </>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 [@media(max-height:760px)]:space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="signup-name" className="text-white/90">
                    שם מלא
                  </Label>
                  <Input
                    id="signup-name"
                    className="h-9 border-white/15 bg-white/5 text-white placeholder:text-white/40"
                    name="fullName"
                    type="text"
                    placeholder="ישראל ישראלי"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-email" className="text-white/90">
                    אימייל
                  </Label>
                  <Input
                    id="signup-email"
                    className="h-9 border-white/15 bg-white/5 text-white placeholder:text-white/40"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    required
                    dir="ltr"
                    /** הזמנה ⇒ מילוי-מראש של המייל (קריאה בלבד; מונע טעות בכתובת). */
                    defaultValue={inviteEmail || undefined}
                    readOnly={Boolean(inviteEmail)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-password" className="text-white/90">
                    סיסמה
                  </Label>
                  <Input
                    id="signup-password"
                    className="h-9 border-white/15 bg-white/5 text-white placeholder:text-white/40"
                    name="password"
                    type="password"
                    minLength={6}
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-confirm" className="text-white/90">
                    אימות סיסמה
                  </Label>
                  <Input
                    id="signup-confirm"
                    className="h-9 border-white/15 bg-white/5 text-white placeholder:text-white/40"
                    name="confirmPassword"
                    type="password"
                    required
                    dir="ltr"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                  הירשם
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
