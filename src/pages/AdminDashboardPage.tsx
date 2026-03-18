import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building2, Users, Loader2 } from 'lucide-react';

export default function AdminDashboardPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { data: organizations, isLoading, isError, error } = useOrganizations();

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">לוח מנהלים</h1>
        <p className="text-muted-foreground mt-1">ארגונים ומספר משתמשים</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            ארגונים
          </CardTitle>
          <CardDescription>רשימת ארגונים ומספר המשתמשים בכל ארגון</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {isError && (
            <p className="text-destructive py-4 text-center">
              {error instanceof Error ? error.message : 'שגיאה בטעינת ארגונים'}
            </p>
          )}
          {!isLoading && !isError && organizations && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60%]">שם ארגון</TableHead>
                  <TableHead className="text-center">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      משתמשים
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                      אין ארגונים במערכת
                    </TableCell>
                  </TableRow>
                ) : (
                  organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name || org.id}</TableCell>
                      <TableCell className="text-center">{org.user_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
