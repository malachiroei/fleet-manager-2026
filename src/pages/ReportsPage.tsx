import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Users, CalendarClock } from 'lucide-react';

type DriverReportRow = {
  id: string;
  full_name: string;
  id_number: string;
  license_expiry: string;
  status: 'valid' | 'warning' | 'expired';
};

function formatDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString('he-IL');
}

export default function ReportsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reports', 'drivers-license-expiry'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('drivers')
        .select('id, full_name, id_number, license_expiry, status')
        .order('license_expiry', { ascending: true });

      if (error) throw error;
      return (rows ?? []) as DriverReportRow[];
    },
  });

  const drivers = data ?? [];

  const activeDriversCount = useMemo(
    () => drivers.filter((driver) => driver.status !== 'expired').length,
    [drivers]
  );

  return (
    <div className="container py-4 sm:py-6 space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">הפקת דוחות</h1>
        <p className="text-muted-foreground mt-1">סיכום נהגים פעילים ותוקף רישיונות נהיגה</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </div>
  );
}
