import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PendingUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  status: string;
  org_id: string | null;
}

export default function AdminUsersPage() {
  const { profile, loading, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const isMainAdmin = (profile?.email ?? '').toLowerCase() === 'malachiroei@gmail.com';

  const pendingQuery = useQuery({
    queryKey: ['admin-pending-users'],
    enabled: isMainAdmin,
    refetchInterval: 5000,
    queryFn: async (): Promise<PendingUser[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, status, org_id')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PendingUser[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-users'] });
      toast({ title: 'המשתמש אושר בהצלחה' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה באישור המשתמש', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-users'] });
      toast({ title: 'המשתמש נמחק בהצלחה' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה במחיקת המשתמש', description: err.message, variant: 'destructive' });
    },
  });

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isMainAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ניהול משתמשים</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          משתמשים הממתינים לאישור מנהל המערכת.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            משתמשים בהמתנת אישור
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingQuery.isError ? (
            <p className="text-destructive py-4 text-center text-sm">
              {(pendingQuery.error as Error).message}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>אימייל</TableHead>
                  <TableHead className="text-center">סטטוס</TableHead>
                  <TableHead className="text-center">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingQuery.data && pendingQuery.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      אין משתמשים בהמתנת אישור.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingQuery.data?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                      <TableCell>{u.email || '—'}</TableCell>
                      <TableCell className="text-center text-xs">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                          ממתין לאישור
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs text-emerald-700 border-emerald-400 hover:bg-emerald-50"
                            disabled={approveMutation.isPending || deleteMutation.isPending}
                            onClick={() => approveMutation.mutate(u.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 ml-1" />
                            אישור
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs text-red-700 border-red-400 hover:bg-red-50"
                            disabled={approveMutation.isPending || deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(u.id)}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            מחיקה
                          </Button>
                        </div>
                      </TableCell>
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

