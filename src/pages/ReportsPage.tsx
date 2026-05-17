import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FleetHudPageShell } from '@/components/FleetHudPageShell';
import { useDrivers } from '@/hooks/useDrivers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, CalendarClock, ArrowLeftRight } from 'lucide-react';

function formatDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString('he-IL');
}

export default function ReportsPage() {
  const { data, isLoading, isError, error } = useDrivers();

  const drivers = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => new Date(a.license_expiry).getTime() - new Date(b.license_expiry).getTime(),
      ),
    [data],
  );

  const activeDriversCount = useMemo(
    () => drivers.filter((driver) => driver.status !== 'expired').length,
    [drivers]
  );

  return (
    <FleetHudPageShell
      title="הפקת דוחות"
      subtitle="סיכום נהגים פעילים ותוקף רישיונות נהיגה."
    >
    <section className="dashboard-status-stage dashboard-cyber-stage container mx-auto max-w-7xl space-y-5 rounded-3xl border border-cyan-400/25 p-4 sm:space-y-6 sm:p-6">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link to="/vehicles/transfers" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <Card className="h-full transition-colors hover:bg-cyan-500/10 hover:border-cyan-400/40 border border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                דוח העברות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">היסטוריית מסירות והחזרות — כניסה למסך העברות</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              נהגים פעילים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold">{activeDriversCount}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              סך נהגים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold">{drivers.length}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>תאריכי תפוגת רישיון</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTitle>שגיאה בטעינת דוח הנהגים</AlertTitle>
              <AlertDescription>{error instanceof Error ? error.message : 'אירעה שגיאה בלתי צפויה.'}</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם נהג</TableHead>
                  <TableHead>ת.ז.</TableHead>
                  <TableHead>תוקף רישיון</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      לא נמצאו נהגים להצגה
                    </TableCell>
                  </TableRow>
                ) : (
                  drivers.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.full_name}</TableCell>
                      <TableCell>{driver.id_number}</TableCell>
                      <TableCell>{formatDate(driver.license_expiry)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
    </FleetHudPageShell>
  );
}
