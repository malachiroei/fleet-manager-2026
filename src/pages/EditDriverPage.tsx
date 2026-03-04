import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDriver, useUpdateDriver } from '@/hooks/useDrivers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Loader2, User, CreditCard, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

export default function EditDriverPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: driver, isLoading } = useDriver(id || '');
  const updateDriver = useUpdateDriver();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
            <Skeleton className="h-6 w-48" />
          </div></div>
        </header>
        <main className="container py-6 space-y-4">
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4"><div className="flex items-center gap-3">
            <Link to="/drivers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
            <h1 className="font-bold text-xl">נהג לא נמצא</h1>
          </div></div>
        </header>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      await updateDriver.mutateAsync({
        id: driver.id,
        full_name: formData.get('full_name') as string,
        id_number: formData.get('id_number') as string,
        license_expiry: formData.get('license_expiry') as string,
        phone: formData.get('phone') as string || null,
        email: formData.get('email') as string || null,
        health_declaration_date: formData.get('health_declaration_date') as string || null,
        safety_training_date: formData.get('safety_training_date') as string || null,
        address: formData.get('address') as string || null,
        job_title: formData.get('job_title') as string || null,
        department: formData.get('department') as string || null,
        license_number: formData.get('license_number') as string || null,
        regulation_585b_date: formData.get('regulation_585b_date') as string || null,
      });
      toast.success('הנהג עודכן בהצלחה');
      navigate(`/drivers/${driver.id}`);
    } catch (error) {
      toast.error('שגיאה בעדכון הנהג');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to={`/drivers/${driver.id}`}><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
            <h1 className="font-bold text-xl">עריכת נהג - {driver.full_name}</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <CardTitle>פרטים אישיים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="full_name">שם מלא *</Label>
                  <Input id="full_name" name="full_name" defaultValue={driver.full_name} required />
                </div>
                <div>
                  <Label htmlFor="id_number">תעודת זהות *</Label>
                  <Input id="id_number" name="id_number" defaultValue={driver.id_number} required dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="phone">טלפון</Label>
                  <Input id="phone" name="phone" type="tel" defaultValue={driver.phone || ''} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input id="email" name="email" type="email" defaultValue={driver.email || ''} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">כתובת מגורים</Label>
                  <Input id="address" name="address" defaultValue={driver.address || ''} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>מידע מקצועי</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="job_title">תפקיד</Label>
                  <Input id="job_title" name="job_title" defaultValue={driver.job_title || ''} />
                </div>
                <div>
                  <Label htmlFor="department">מחלקה</Label>
                  <Input id="department" name="department" defaultValue={driver.department || ''} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle>רישיון ותאימות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="license_number">מספר רישיון נהיגה</Label>
                  <Input id="license_number" name="license_number" defaultValue={driver.license_number || ''} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="license_expiry">תוקף רישיון נהיגה *</Label>
                  <Input id="license_expiry" name="license_expiry" type="date" defaultValue={driver.license_expiry} required />
                </div>
                <div>
                  <Label htmlFor="health_declaration_date">תאריך הצהרת בריאות</Label>
                  <Input id="health_declaration_date" name="health_declaration_date" type="date" defaultValue={driver.health_declaration_date || ''} />
                </div>
                <div>
                  <Label htmlFor="safety_training_date">תאריך הדרכת בטיחות</Label>
                  <Input id="safety_training_date" name="safety_training_date" type="date" defaultValue={driver.safety_training_date || ''} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="regulation_585b_date">תאריך בדיקת תקנה 585ב'</Label>
                  <Input id="regulation_585b_date" name="regulation_585b_date" type="date" defaultValue={driver.regulation_585b_date || ''} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור שינויים
            </Button>
            <Link to={`/drivers/${driver.id}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">ביטול</Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
