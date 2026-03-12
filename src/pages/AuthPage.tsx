import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { PwaInstallButton } from '@/components/PwaInstallButton';
import { toast } from '@/hooks/use-toast';

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

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
        toast({
          title: 'שגיאה בהרשמה',
          description: 'כתובת האימייל כבר רשומה במערכת',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'שגיאה בהרשמה',
          description: error.message,
          variant: 'destructive'
        });
      }
    } else {
      toast({
        title: 'ההרשמה הצליחה!',
        description: 'נשלח אליך אימייל לאימות. אנא בדוק את תיבת הדואר שלך.'
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#020617] p-4">
      {/* Install app – top corner, also available after login in header */}
      <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3">
        <PwaInstallButton variant="auth" />
      </div>
      <Card className="w-full max-w-md border-white/10 bg-[#0d1b2e] text-white shadow-xl shadow-black/40">
        <CardHeader className="text-center space-y-1">
          {/* Dark strip so the white car pops; same idea as dashboard logo box */}
          <div className="mx-auto -mt-1 mb-3 flex justify-center rounded-2xl bg-[#0a1525] px-8 py-6">
            <img
              src="/og-image.png"
              alt="Fleet Manager"
              className="h-auto w-72 max-w-full object-contain object-center drop-shadow-[0_0_24px_rgba(255,255,255,0.4)]"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Fleet Manager Pro</CardTitle>
          <CardDescription className="text-cyan-400/70">
            מערכת ניהול צי רכבים מקצועית
          </CardDescription>
        </CardHeader>
        <CardContent className="text-white">
          <Tabs defaultValue="login" className="w-full">
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
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-white/90">
                    שם מלא
                  </Label>
                  <Input
                    id="signup-name"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
                    name="fullName" 
                    type="text" 
                    placeholder="ישראל ישראלי"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-white/90">
                    אימייל
                  </Label>
                  <Input
                    id="signup-email"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
                    name="email" 
                    type="email" 
                    placeholder="your@email.com"
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-white/90">
                    סיסמה
                  </Label>
                  <Input
                    id="signup-password"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
                    name="password" 
                    type="password" 
                    minLength={6}
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm" className="text-white/90">
                    אימות סיסמה
                  </Label>
                  <Input
                    id="signup-confirm"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40" 
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
