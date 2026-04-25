import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  useTeamMembers,
  useOrgInvitations,
  useApproveMember,
  useRemoveTeamMemberFromOrg,
  ORG_INVITATIONS_QUERY_KEY,
  isRoeySuperAdminProfile,
} from '@/hooks/useTeam';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { getDefaultPermissions } from '@/lib/permissions';
import { isRavidManagerEmail } from '@/lib/fleetBootstrapEmails';
import { isSuperAdminPermissionBypass } from '@/lib/allowedFeatures';
import {
  buildReleaseSnapshotPayload,
  downloadReleaseSnapshotJson,
  EMPTY_FLEET_MANIFEST_UI_GATES,
  getBundledReleaseSnapshot,
} from '@/lib/releaseSnapshot';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseAnonKey } from '@/integrations/supabase/publicEnv';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleInviteModal } from '@/components/SimpleInviteModal';
import { UserFeatureFlagsOverridesDialog } from '@/components/UserFeatureFlagsOverridesDialog';
import { GlobalFeatureFlagsAdminPanel } from '@/components/GlobalFeatureFlagsAdminPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Flag, Loader2, Mail, UserMinus, UserPlus, Users } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Profile } from '@/types/fleet';

/**
 * Team management: list members and pending invitations. Invite via SimpleInviteModal only.
 */
export default function TeamManagementPage() {
  const { user, profile, activeOrgId, hasPermission, isAdmin, isManager } = useAuth();
  const isRavid = isRavidManagerEmail(user?.email ?? null);
  const { viewAsProfile } = useViewAs();
  const { effectiveUserId, effectiveOrgId } = useImpersonationFleetScope();
  const queryClient = useQueryClient();
  const orgId = effectiveOrgId ?? activeOrgId ?? null;
  const isSuperAdminTeamView = isRoeySuperAdminProfile(profile);
  const [globalFeaturesOpen, setGlobalFeaturesOpen] = useState(false);
  const subjectIsSystemAdmin = (viewAsProfile?.is_system_admin ?? profile?.is_system_admin) === true;
  const { data: members, isLoading, isFetching: membersFetching } = useTeamMembers(orgId, {
    loadAllOrgs: isSuperAdminTeamView,
    subjectManagerUserId: effectiveUserId,
    subjectIsSystemAdmin,
    managedScopeOnly: !isSuperAdminTeamView && !subjectIsSystemAdmin,
  });
  const { data: invitations, isLoading: invitationsLoading, isFetching: invitationsFetching } =
    useOrgInvitations(orgId);
  const memberRowsAll = members ?? [];
  const invitationRows = invitations ?? [];
  const viewerEmail = (profile?.email ?? '').trim().toLowerCase();
  const isRoeiAdmin = viewerEmail === 'malachiroei@gmail.com';
  const memberRows = useMemo(() => {
    // Never show super-admin row to non-super-admin viewers.
    if (isSuperAdminTeamView) return memberRowsAll;
    return memberRowsAll.filter((m) => (m.email ?? '').trim().toLowerCase() !== 'malachiroei@gmail.com');
  }, [isSuperAdminTeamView, memberRowsAll]);

  /** מיילים שכבר יש להם שורה ב-profiles — לא מציגים אותם כהזמנה פתוחה */
  const registeredEmails = useMemo(() => {
    const set = new Set<string>();
    for (const m of memberRows) {
      const e = m.email?.trim().toLowerCase();
      if (e) set.add(e);
    }
    return set;
  }, [memberRows]);

  const invitationRowsVisible = useMemo(() => {
    return invitationRows.filter((inv) => {
      const e = inv.email?.trim().toLowerCase();
      if (!e) return true;
      return !registeredEmails.has(e);
    });
  }, [invitationRows, registeredEmails]);

  const listLoading = isLoading || invitationsLoading || membersFetching || invitationsFetching;
  const [modalOpen, setModalOpen] = useState(false);
  /** Explicit boolean — avoids undefined / HMR glitches on PRO. */
  const [featureOverridesDialogOpen, setFeatureOverridesDialogOpen] = useState(false);
  const [featureOverridesMember, setFeatureOverridesMember] = useState<Profile | null>(null);
  const approveMember = useApproveMember();
  const removeTeamMember = useRemoveTeamMemberFromOrg();
  const [memberToRemove, setMemberToRemove] = useState<Profile | null>(null);
  const [suspendAccountOnRemove, setSuspendAccountOnRemove] = useState(false);

  /** עמודת מזהה ארגון ונתונים דומים — רק לרועי (סופר־אדמין). */
  const showSensitiveColumns = isSuperAdminTeamView;

  // Strict privacy: team page is only for admins/managers (or explicit manage_team permission).
  const canManageTeam = isAdmin || isManager || hasPermission('manage_team') || isSuperAdminTeamView;
  /** הסרה: מנהל ארגון; בתצוגת סופר־אדמין — רק מלכי (לפי שורה org_id). */
  const canRemoveTeamMemberRow = canManageTeam && (isSuperAdminTeamView ? isRoeiAdmin : Boolean(orgId));
  const tableColCount = (showSensitiveColumns ? 5 : 4) + (canRemoveTeamMemberRow ? 1 : 0);
  /** פאנל פיצ'רים גלובליים — רק מנהל-העל (לא כל אדמין ארגון) */
  const canManageGlobalFeatures = isRoeiAdmin || isSuperAdminPermissionBypass(profile);

  if (!canManageTeam) {
    return <Navigate to="/" replace />;
  }

  if (!orgId && !isSuperAdminTeamView) {
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

  const inviteModalOrgId = orgId ?? profile?.org_id ?? '';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-3 py-4 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">ניהול צוות</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {isSuperAdminTeamView ? 'כל הארגונים — תצוגת סופר־אדמין' : 'חברי הארגון ופיצ׳רים אישיים'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
            {canManageGlobalFeatures ? (
              <Dialog open={globalFeaturesOpen} onOpenChange={setGlobalFeaturesOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    className="h-9 gap-2 border-2 border-[gold] bg-amber-500/25 px-4 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.45)] hover:bg-amber-500/40 hover:text-white hover:border-[#ffd700]"
                  >
                    <Flag className="h-4 w-4" />
                    ניהול פיצ'רים גלובליים
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[min(100vw-1rem,56rem)] max-h-[min(100dvh-1rem,90vh)] overflow-y-auto" dir="rtl">
                  <DialogHeader>
                    <DialogTitle>ניהול פיצ'רים גלובליים</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[75vh] overflow-auto pr-1">
                    <GlobalFeatureFlagsAdminPanel />
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                חברי צוות
              </CardTitle>
              <CardDescription>
                {listLoading
                  ? 'טוען…'
                  : isSuperAdminTeamView
                    ? `${memberRows.length} פרופילים · ${invitationRowsVisible.length} הזמנות פתוחות (אחרי סינון)`
                    : `${memberRows.length} חברי צוות · ${invitationRowsVisible.length} הזמנות פתוחות`}
              </CardDescription>
            </div>
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              הזמנת חבר צוות
            </Button>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1 touch-pan-x">
              <Table className="min-w-[640px] w-full">
                <TableHeader>
                  <TableRow>
                    {showSensitiveColumns ? (
                      <TableHead className="w-[150px] align-middle">
                        <span className="block text-sm font-medium">מזהה ארגון</span>
                        <span className="block font-mono text-[10px] font-normal text-muted-foreground">Org ID</span>
                      </TableHead>
                    ) : null}
                    <TableHead className="w-[190px] align-middle">שם</TableHead>
                    <TableHead className="w-[240px] align-middle">אימייל</TableHead>
                    <TableHead className="w-[260px] align-middle">פיצ׳רים</TableHead>
                    <TableHead className="w-[140px] text-center align-middle">סטטוס</TableHead>
                    {canRemoveTeamMemberRow ? (
                      <TableHead className="w-[130px] text-center align-middle">פעולות</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberRows.length === 0 && invitationRowsVisible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tableColCount} className="text-center text-muted-foreground py-8">
                        אין נתונים להצגה.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {memberRows.map((m, mi) => {
                        const memberEmail = (m.email ?? '').trim().toLowerCase();
                        const memberAuthId = String(m.user_id ?? m.id ?? '').trim();
                        const viewerAuthId = String(profile?.user_id ?? profile?.id ?? '').trim();
                        const isSelf = Boolean(memberAuthId) && memberAuthId === viewerAuthId;
                        const canOpenFeatureOverrides =
                          isRoeiAdmin ||
                          (memberEmail && memberEmail === viewerEmail) ||
                          (isRavid && canManageTeam && !isSelf);
                        const showRemoveForRow =
                          canRemoveTeamMemberRow &&
                          !isSelf &&
                          m?.status !== 'pending_approval' &&
                          (Boolean(orgId) || Boolean(m.org_id));
                        return (
                          <TableRow key={m.id ?? `m-${mi}`}>
                            {showSensitiveColumns ? (
                              <TableCell className="w-[150px] font-mono text-[10px] text-muted-foreground truncate align-middle">
                                {m.org_id ?? '—'}
                              </TableCell>
                            ) : null}
                            <TableCell className="w-[190px] font-medium align-middle">
                              <span className="truncate block">{m.full_name || '—'}</span>
                            </TableCell>
                            <TableCell className="w-[240px] text-muted-foreground align-middle" dir="ltr">
                              <span className="truncate block">{m.email || '—'}</span>
                            </TableCell>
                            <TableCell className="w-[260px] text-xs align-middle">
                              <p className="text-muted-foreground leading-snug mb-2 max-w-[360px]">
                                Overrides לפיצ׳רים גלובליים (למשתמש זה בלבד).
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 text-[12px]"
                                disabled={!canOpenFeatureOverrides}
                                onClick={() => {
                                  if (!canOpenFeatureOverrides) return;
                                  setFeatureOverridesMember(m);
                                  setFeatureOverridesDialogOpen(true);
                                }}
                              >
                                ניהול פיצ'רים
                              </Button>
                            </TableCell>
                            <TableCell className="w-[140px] text-center text-xs align-middle">
                              {m?.status === 'suspended' ? (
                                <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-900">
                                  מושעה
                                </span>
                              ) : m?.status === 'pending_approval' ? (
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                    ממתין לאישור
                                  </span>
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      disabled={approveMember.isPending}
                                      onClick={() =>
                                        approveMember.mutate({
                                          profileId: m.id,
                                          parentAdminProfileId: profile?.id ?? null,
                                        })
                                      }
                                    >
                                      אישור
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                  <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                    פעיל
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            {canRemoveTeamMemberRow ? (
                              <TableCell className="w-[130px] text-center align-middle">
                                {showRemoveForRow ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                                    disabled={removeTeamMember.isPending}
                                    onClick={() => setMemberToRemove(m)}
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                    הסרה
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">—</span>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending approvals / invitations (admin/team only). */}
        {canManageTeam ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-5 w-5" />
                הרשמות ממתינות / הזמנות פתוחות
              </CardTitle>
              <CardDescription>
                {invitationRowsVisible.length} הזמנות פתוחות בארגון
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitationRowsVisible.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין הזמנות פתוחות.</p>
              ) : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[260px] align-middle">אימייל</TableHead>
                        <TableHead className="w-[180px] align-middle">סטטוס</TableHead>
                        <TableHead className="align-middle">פרטים</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitationRowsVisible.map((inv, idx) => (
                        <TableRow key={inv.id ?? `inv-${idx}`}>
                          <TableCell className="w-[260px] text-muted-foreground align-middle" dir="ltr">
                            <span className="truncate block">{inv.email ?? '—'}</span>
                          </TableCell>
                          <TableCell className="w-[180px] align-middle">
                            <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                              {inv.status ? String(inv.status) : 'pending'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground align-middle">
                            {showSensitiveColumns && inv.org_id ? (
                              <span className="font-mono text-[10px]">org: {String(inv.org_id)}</span>
                            ) : (
                              <span>—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <SimpleInviteModal
        key={modalOpen ? 'open' : 'closed'}
        open={modalOpen}
        onOpenChange={setModalOpen}
        orgId={inviteModalOrgId}
        invitedBy={profile?.user_id ?? null}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ORG_INVITATIONS_QUERY_KEY })}
      />

      <UserFeatureFlagsOverridesDialog
        open={featureOverridesDialogOpen}
        onOpenChange={(o) => {
          setFeatureOverridesDialogOpen(o === true);
          if (!o) setFeatureOverridesMember(null);
        }}
        userId={featureOverridesMember?.id ?? featureOverridesMember?.user_id ?? null}
        userLabel={featureOverridesMember?.full_name ?? featureOverridesMember?.email ?? null}
      />

      <AlertDialog
        open={memberToRemove != null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToRemove(null);
            setSuspendAccountOnRemove(false);
          }
        }}
      >
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>להסיר את חבר הצוות?</AlertDialogTitle>
            <AlertDialogDescription className="text-start space-y-3">
              <span className="block">
                {memberToRemove?.full_name || memberToRemove?.email || 'משתמש'} יוסר מחברות בארגון הנוכחי. אפשר
                להזמין מחדש אחר כך.
              </span>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-muted/30 p-3 text-sm">
                <Checkbox
                  checked={suspendAccountOnRemove}
                  onCheckedChange={(v) => setSuspendAccountOnRemove(v === true)}
                  className="mt-0.5"
                />
                <span className="text-foreground leading-snug">
                  <strong>השבתת חשבון:</strong> המשתמש לא יוכל להתחבר לאפליקציה (בנוסף להסרה מהארגון). לשחרור חשבון
                  רק מנהל מערכת (SQL / Dashboard).
                </span>
              </label>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 sm:justify-start">
            <AlertDialogCancel type="button">ביטול</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={
                removeTeamMember.isPending ||
                !memberToRemove ||
                !String((isSuperAdminTeamView ? memberToRemove.org_id : orgId) ?? orgId ?? '').trim()
              }
              onClick={() => {
                if (!memberToRemove) return;
                const removeMutationOrgId = String(
                  (isSuperAdminTeamView ? memberToRemove.org_id : orgId) ?? orgId ?? '',
                ).trim();
                if (!removeMutationOrgId) return;
                const uid = String(memberToRemove.user_id ?? memberToRemove.id ?? '').trim();
                if (!uid) return;
                removeTeamMember.mutate(
                  {
                    orgId: removeMutationOrgId,
                    memberUserId: uid,
                    suspendAccount: suspendAccountOnRemove,
                  },
                  {
                    onSettled: () => {
                      setMemberToRemove(null);
                      setSuspendAccountOnRemove(false);
                    },
                  },
                );
              }}
            >
              {removeTeamMember.isPending ? 'מסיר…' : 'הסרה'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
