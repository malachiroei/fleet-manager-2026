import { useState } from 'react';
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
  const [manualEmail, setManualEmail] = useState('');

  const isMainAdmin = (profile?.email ?? '').toLowerCase() === 'malachiroei@gmail.com';

  const handleForceRefresh = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, status, org_id')
        .neq('status', 'active')
        .order('created_at', { ascending: true });

      if (error) throw error;
      queryClient.setQueryData(['admin-pending-users'], (data ?? []) as PendingUser[]);
      void pendingQuery.refetch();
    } catch (err) {
      console.error('Force refresh of profiles failed', err);
    }
  };

  const handleManualSync = async () => {
    const email = manualEmail.trim().toLowerCase();
    if (!email) return;

    try {
      const { data: authUsers, error: authError } = await (supabase as any).auth.admin.listUsers();
      if (authError) throw authError;

      const match = (authUsers?.users ?? []).find(
        (u: any) => (u.email ?? '').toLowerCase() === email
      );

      if (!match) {
        console.warn('No auth user found for email', email);
        return;
      }

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: match.id,
            full_name: match.user_metadata?.full_name ?? email,
            email,
            phone: null,
            org_id: null,
            permissions: {},
            status: 'pending_approval',
          },
          { onConflict: 'user_id' }
        );

      if (upsertError) {
        console.error('Manual sync upsert failed', upsertError);
        return;
      }

      setManualEmail('');
      await pendingQuery.refetch();
    } catch (err) {
      console.error('Manual sync from auth failed', err);
    }
  };

  const pendingQuery = useQuery({
    queryKey: ['admin-pending-users'],
    enabled: isMainAdmin,
    refetchInterval: 5000,
    queryFn: async (): Promise<PendingUser[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, status, org_id')
        .neq('status', 'active')
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
          כל המשתמשים שאינם במצב פעיל (כולל ממתינים לאישור).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            משתמשים בהמתנת אישור
          </CardTitle>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              סה״כ רשומות נטענו: {pendingQuery.data?.length ?? 0}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={handleForceRefresh}
              disabled={pendingQuery.isLoading}
            >
              רענן נתונים בכוח
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              כלי חירום: סנכרון משתמשים מ-Auth לפי אימייל.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                dir="ltr"
                className="h-8 w-52 text-xs"
                placeholder="user@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleManualSync}
                disabled={pendingQuery.isLoading || !manualEmail.trim()}
              >
                סנכרון משתמשים מ-Auth
              </Button>
            </div>
          </div>
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

