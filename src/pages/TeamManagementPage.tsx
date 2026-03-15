import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers, useOrgInvitations } from '@/hooks/useTeam';
import { PERMISSION_LABELS } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleInviteModal } from '@/components/SimpleInviteModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowRight, Loader2, Mail, UserPlus, Users } from 'lucide-react';
import { Navigate } from 'react-router-dom';

/**
 * Team management: list members and pending invitations. Invite via SimpleInviteModal only.
 */
export default function TeamManagementPage() {
  const { profile, activeOrgId, hasPermission, isAdmin, isManager } = useAuth();
  const queryClient = useQueryClient();
  const orgId = activeOrgId ?? null;
  const { data: members, isLoading } = useTeamMembers(orgId);
  const { data: invitations } = useOrgInvitations(orgId);
  const [modalOpen, setModalOpen] = useState(false);

  const canManageTeam = isAdmin || isManager || hasPermission('manage_team') || Boolean(activeOrgId ?? profile?.org_id);

  if (!canManageTeam) {
    return <Navigate to="/" replace />;
  }

  if (!orgId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">לא שויך ארגון. נא ליצור קשר עם מנהל המערכת.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ניהול צוות</h1>
            <p className="text-muted-foreground text-sm">חברי הארגון והרשאות</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                חברי צוות
              </CardTitle>
              <CardDescription>כל המשתמשים בארגון שלך</CardDescription>
            </div>
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              הזמנת חבר צוות
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>אימייל</TableHead>
                    <TableHead className="text-center">הרשאות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members && members.length === 0 && (!invitations || invitations.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        אין חברי צוות.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {members?.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.full_name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{m.email || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.permissions
                              ? Object.entries(m.permissions)
                                  .filter(([, v]) => v)
                                  .map(([k]) => PERMISSION_LABELS[k as keyof typeof PERMISSION_LABELS] ?? k)
                                  .join(', ') || '—'
                              : 'כל ההרשאות'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {invitations?.map((inv) => (
                        <TableRow key={inv.id} className="bg-muted/30">
                          <TableCell className="font-medium">המתנה להצטרפות</TableCell>
                          <TableCell className="text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {inv.email}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {inv.permissions && typeof inv.permissions === 'object'
                              ? Object.entries(inv.permissions)
                                  .filter(([, v]) => v)
                                  .map(([k]) => PERMISSION_LABELS[k as keyof typeof PERMISSION_LABELS] ?? k)
                                  .join(', ') || '—'
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <SimpleInviteModal
        key={modalOpen ? 'open' : 'closed'}
        open={modalOpen}
        onOpenChange={setModalOpen}
        orgId={orgId}
        invitedBy={profile?.user_id ?? null}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['org-invitations', orgId] })}
      />
    </div>
  );
}
