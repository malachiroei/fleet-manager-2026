import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers, useCreateInvitation, useOrgInvitations } from '@/hooks/useTeam';
import { PERMISSION_KEYS, PERMISSION_LABELS, getDefaultPermissions } from '@/lib/permissions';
import type { ProfilePermissions } from '@/types/fleet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

export default function TeamManagementPage() {
  const { profile, hasPermission, isManager } = useAuth();
  const orgId = profile?.org_id ?? null;
  const { data: members, isLoading } = useTeamMembers(orgId);
  const { data: invitations } = useOrgInvitations(orgId);
  const createInvitation = useCreateInvitation();

  const [modalOpen, setModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<ProfilePermissions>(getDefaultPermissions());

  const canManageTeam = isManager || hasPermission('manage_team');

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

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      await createInvitation.mutateAsync({
        orgId,
        email,
        permissions: invitePermissions,
        invitedBy: profile?.user_id ?? null,
      });
      setModalOpen(false);
      setInviteEmail('');
      setInvitePermissions(getDefaultPermissions());
    } catch {
      // toast handled in hook
    }
  };

  const togglePermission = (key: keyof ProfilePermissions, value: boolean) => {
    setInvitePermissions((prev) => ({ ...prev, [key]: value }));
  };

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
                        אין חברי צוות. הזמן חבר צוות כדי להתחיל.
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הזמנת חבר צוות</DialogTitle>
            <DialogDescription>
              הזן אימייל ובחר הרשאות. ההזמנה תישמר וניתן לשלוח קישור הצטרפות למשתמש.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">אימייל</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@company.com"
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-3">
              <Label>הרשאות</Label>
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                {PERMISSION_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-sm">{PERMISSION_LABELS[key]}</span>
                    <Switch
                      checked={!!invitePermissions[key]}
                      onCheckedChange={(v) => togglePermission(key, v)}
                    />
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" disabled={createInvitation.isPending || !inviteEmail.trim()}>
                {createInvitation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                שמור הזמנה
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
