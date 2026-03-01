import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Loader2 } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Car className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold">Fleet Manager Pro</CardTitle>
          <CardDescription>מערכת ניהול צי רכבים מקצועית</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">התחברות</TabsTrigger>
              <TabsTrigger value="signup">הרשמה</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">אימייל</Label>
                  <Input 
                    id="login-email" 
                    name="email" 
                    type="email" 
                    placeholder="your@email.com"
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">סיסמה</Label>
                  <Input 
                    id="login-password" 
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
                  <Label htmlFor="signup-name">שם מלא</Label>
                  <Input 
                    id="signup-name" 
                    name="fullName" 
                    type="text" 
                    placeholder="ישראל ישראלי"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">אימייל</Label>
                  <Input 
                    id="signup-email" 
                    name="email" 
                    type="email" 
                    placeholder="your@email.com"
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">סיסמה</Label>
                  <Input 
                    id="signup-password" 
                    name="password" 
                    type="password" 
                    minLength={6}
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">אימות סיסמה</Label>
                  <Input 
                    id="signup-confirm" 
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
