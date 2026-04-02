/**
 * דף נהג — ללא כפילות מול כרטיס הרשימה.
 * כל הנושאים מפורקים למשבצות בכרטיס הנהג; כאן רק כותרת, שיוך רכב ופעולות.
 */
import { useParams, Link, useSearchParams, Navigate } from 'react-router-dom';
import { useDriver } from '@/hooks/useDrivers';
import { useActiveDriverVehicleAssignments } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, User, Car, FolderOpen } from 'lucide-react';
import type { DriverSectionId } from '@/lib/driverFieldMap';
import { DRIVER_SECTION_QUERY_PARAM } from '@/lib/driverFieldMap';

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: driver, isLoading, isError, error, refetch } = useDriver(id || '');
  const { data: activeAssignments } = useActiveDriverVehicleAssignments();

  const sectionParam = searchParams.get(DRIVER_SECTION_QUERY_PARAM) as DriverSectionId | null;
  const validSections: string[] = ['personal', 'organizational', 'licenses', 'safety'];
  if (id && sectionParam && validSections.includes(sectionParam)) {
    return <Navigate to={`/drivers/${id}/section/${sectionParam}`} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/drivers">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Skeleton className="h-40 w-full" />
        </main>
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : String(error ?? 'שגיאה');
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="border-b border-border bg-card">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/drivers">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-bold">שגיאה בטעינת הנהג</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-destructive text-sm">{msg}</p>
              <Button type="button" onClick={() => void refetch()}>
                נסה שוב
              </Button>
              <Link to="/drivers">
                <Button variant="outline" className="ml-2">
                  חזור לרשימה
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#020617] text-white">
        <header className="border-b border-border bg-card">
          <div className="container py-4">
            <div className="flex items-center gap-3">
              <Link to="/drivers">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-bold">נהג לא נמצא</h1>
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Card>
            <CardContent className="p-6 text-center">
              <User className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">הנהג המבוקש לא נמצא במערכת</p>
              <Link to="/drivers">
                <Button className="mt-4">חזור לרשימת הנהגים</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const assignedVehicles = (activeAssignments ?? [])
    .filter((a) => a.driver_id === driver.id && a.vehicle)
    .map((a) => a.vehicle!)
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Link to="/drivers">
                  <Button variant="ghost" size="icon">
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{driver.full_name}</h1>
                  <p className="text-sm text-muted-foreground">ת.ז. {driver.id_number}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/drivers?folders=${driver.id}`}>
                  <Button variant="outline" size="sm">
                    <FolderOpen className="ml-1 h-4 w-4" />
                    תיקיות
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="text-xs font-medium text-muted-foreground">רכב משויך</span>
              {assignedVehicles.length > 0 ? (
                assignedVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                  >
                    <Car className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[200px] truncate">
                      {v.manufacturer} {v.model}
                    </span>
                    <span className="text-xs text-muted-foreground">({v.plate_number})</span>
                  </div>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Car className="h-3.5 w-3.5" />
                  אין רכב משויך
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Card className="border-border/80 bg-card/50">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-muted-foreground">
              הפרטים המלאים מפורקים לפי <strong className="text-foreground">המשבצות בכרטיס הנהג</strong> ברשימה.
              <br />
              לעריכת קטגוריה — חזור לרשימה ולחץ על המשבצת המתאימה (עריכה + שמירה).
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/drivers">
                <Button variant="secondary">חזור לרשימת הנהגים</Button>
              </Link>
              <Link to={`/drivers?folders=${driver.id}`}>
                <Button>
                  <FolderOpen className="ml-1 h-4 w-4" />
                  פתח תיקיות
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
