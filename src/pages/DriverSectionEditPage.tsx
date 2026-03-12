/**
 * עמוד ממוקד למשבצת אחת בלבד — רק השדות של אותה קטגוריה + שמירה.
 * מקושר מכרטיס הרשימה (לחיצה על משבצת).
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDriver, useUpdateDriver } from '@/hooks/useDrivers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Loader2, User, CreditCard, Briefcase, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatSupabaseError } from '@/lib/supabaseError';
import {
  DRIVER_SECTION_IDS,
  DRIVER_SECTION_LABELS,
  type DriverSectionId,
} from '@/lib/driverFieldMap';

function isSectionId(s: string): s is DriverSectionId {
  return (DRIVER_SECTION_IDS as readonly string[]).includes(s);
}

export default function DriverSectionEditPage() {
  const { id, sectionId } = useParams<{ id: string; sectionId: string }>();
  const navigate = useNavigate();
  const { data: driver, isLoading } = useDriver(id || '');
  const updateDriver = useUpdateDriver();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const section = sectionId && isSectionId(sectionId) ? sectionId : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container py-4">
            <Skeleton className="h-8 w-64" />
          </div>
        </header>
        <main className="container py-6">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!driver || !section) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="bg-card border-b border-border">
          <div className="container py-4 flex items-center gap-3">
            <Link to="/drivers">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">סקשן לא נמצא</h1>
          </div>
        </header>
        <main className="container py-6">
          <Link to={id ? `/drivers/${id}` : '/drivers'}>
            <Button variant="outline">חזור</Button>
          </Link>
        </main>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = { id: driver.id };

      if (section === 'personal') {
        payload.full_name = formData.get('full_name') as string;
        payload.id_number = formData.get('id_number') as string;
        payload.phone = (formData.get('phone') as string) || null;
        payload.email = (formData.get('email') as string) || null;
        payload.address = (formData.get('address') as string) || null;
      } else if (section === 'organizational') {
        payload.job_title = (formData.get('job_title') as string) || null;
        payload.department = (formData.get('department') as string) || null;
      } else if (section === 'licenses') {
        const licenseExpiry = (formData.get('license_expiry') as string)?.trim();
        if (!licenseExpiry) {
          toast.error('חובה למלא תוקף רישיון נהיגה');
          setIsSubmitting(false);
          return;
        }
        payload.license_number = (formData.get('license_number') as string) || null;
        payload.license_expiry = licenseExpiry;
      } else if (section === 'safety') {
        payload.health_declaration_date = (formData.get('health_declaration_date') as string) || null;
        payload.safety_training_date = (formData.get('safety_training_date') as string) || null;
        payload.regulation_585b_date = (formData.get('regulation_585b_date') as string) || null;
      }

      await updateDriver.mutateAsync(payload as Parameters<typeof updateDriver.mutateAsync>[0]);
      // useUpdateDriver כבר מציג toast הצלחה
      navigate(`/drivers/${driver.id}`);
    } catch (error) {
      toast.error('שגיאה בעדכון', {
        description: formatSupabaseError(error),
        duration: 12_000,
      });
      setIsSubmitting(false);
    }
  };

  const title = DRIVER_SECTION_LABELS[section];

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link to={`/drivers/${driver.id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-bold text-xl">{title}</h1>
                <p className="text-sm text-muted-foreground">{driver.full_name}</p>
              </div>
            </div>
            <Link to={`/drivers/${driver.id}/edit`}>
              <Button variant="outline" size="sm">
                עריכה מלאה
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {section === 'personal' && (
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
                <div className="grid grid-cols-1 gap-4">
                  <div>
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
                  <div>
                    <Label htmlFor="email">אימייל</Label>
                    <Input id="email" name="email" type="email" defaultValue={driver.email || ''} dir="ltr" />
                  </div>
                  <div>
                    <Label htmlFor="address">כתובת מגורים</Label>
                    <Input id="address" name="address" defaultValue={driver.address || ''} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'organizational' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>שיוך ארגוני</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="job_title">תפקיד</Label>
                  <Input id="job_title" name="job_title" defaultValue={driver.job_title || ''} />
                </div>
                <div>
                  <Label htmlFor="department">מחלקה</Label>
                  <Input id="department" name="department" defaultValue={driver.department || ''} />
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'licenses' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                    <CreditCard className="h-5 w-5 text-amber-600" />
                  </div>
                  <CardTitle>רישיונות</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="license_number">מספר רישיון נהיגה</Label>
                  <Input id="license_number" name="license_number" defaultValue={driver.license_number || ''} dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="license_expiry">תוקף רישיון נהיגה *</Label>
                  <Input id="license_expiry" name="license_expiry" type="date" defaultValue={driver.license_expiry} required />
                </div>
              </CardContent>
            </Card>
          )}

          {section === 'safety' && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <CardTitle>כשירות ובטיחות</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="health_declaration_date">תאריך הצהרת בריאות</Label>
                  <Input id="health_declaration_date" name="health_declaration_date" type="date" defaultValue={driver.health_declaration_date || ''} />
                </div>
                <div>
                  <Label htmlFor="safety_training_date">תאריך הדרכת בטיחות</Label>
                  <Input id="safety_training_date" name="safety_training_date" type="date" defaultValue={driver.safety_training_date || ''} />
                </div>
                <div>
                  <Label htmlFor="regulation_585b_date">תאריך בדיקת תקנה 585ב'</Label>
                  <Input id="regulation_585b_date" name="regulation_585b_date" type="date" defaultValue={driver.regulation_585b_date || ''} />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור
            </Button>
            <Link to={`/drivers/${driver.id}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                ביטול
              </Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
