import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import {
  useTeamMembers,
  useOrgInvitations,
  useApproveMember,
  ORG_INVITATIONS_QUERY_KEY,
  isRoeySuperAdminProfile,
} from '@/hooks/useTeam';
import { useViewAs } from '@/contexts/ViewAsContext';
import { useImpersonationFleetScope } from '@/hooks/useImpersonationFleetScope';
import { getDefaultPermissions } from '@/lib/permissions';
import {
  buildReleaseSnapshotPayload,
  downloadReleaseSnapshotJson,
  EMPTY_FLEET_MANIFEST_UI_GATES,
  getBundledReleaseSnapshot,
} from '@/lib/releaseSnapshot';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseAnonKey } from '@/integrations/supabase/publicEnv';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleInviteModal } from '@/components/SimpleInviteModal';
import { UserFeatureFlagsOverridesDialog } from '@/components/UserFeatureFlagsOverridesDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowRight, Loader2, Mail, Upload, UserPlus, Users } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Profile } from '@/types/fleet';

/**
 * Team management: list members and pending invitations. Invite via SimpleInviteModal only.
 */
export default function TeamManagementPage() {
  const { profile, activeOrgId, hasPermission, isAdmin, isManager } = useAuth();
  const { viewAsProfile } = useViewAs();
  const { effectiveUserId } = useImpersonationFleetScope();
  const manifestUi = EMPTY_FLEET_MANIFEST_UI_GATES;
  const queryClient = useQueryClient();
  const orgId = activeOrgId ?? null;
  const settingsOrgId = orgId ?? profile?.org_id ?? null;
  const { data: orgSettingsRow } = useOrgSettings(settingsOrgId, { enabledOnlyWithOrgId: true });
  const isSuperAdminTeamView = isRoeySuperAdminProfile(profile);
  const showPushToPro = isSuperAdminTeamView;
  const [pushBusy, setPushBusy] = useState(false);
  const subjectIsSystemAdmin = (viewAsProfile?.is_system_admin ?? profile?.is_system_admin) === true;
  const { data: members, isLoading, isFetching: membersFetching } = useTeamMembers(orgId, {
    loadAllOrgs: isSuperAdminTeamView,
    subjectManagerUserId: effectiveUserId,
    subjectIsSystemAdmin,
  });
  const { data: invitations, isLoading: invitationsLoading, isFetching: invitationsFetching } =
    useOrgInvitations(orgId);
  const memberRows = members ?? [];
  const invitationRows = invitations ?? [];
  const viewerEmail = (profile?.email ?? '').trim().toLowerCase();
  const isRoeiAdmin = viewerEmail === 'malachiroei@gmail.com';
  const isRavid = viewerEmail === 'ravidmalachi@gmail.com';

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

  /** עמודת מזהה ארגון ונתונים דומים — רק לרועי (סופר־אדמין). */
  const showSensitiveColumns = isSuperAdminTeamView;
  const tableColCount = showSensitiveColumns ? 5 : 4;

  const canManageTeam = isAdmin || isManager || hasPermission('manage_team') || Boolean(activeOrgId ?? profile?.org_id);

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

  const handlePushReleaseSnapshot = async () => {
    const snapshotOrgId = orgId ?? profile?.org_id ?? null;
    if (!snapshotOrgId) {
      toast.error('בחר ארגון פעיל (מתפריט הארגון) לפני דחיפת סנאפשוט.');
      return;
    }
    setPushBusy(true);
    try {
      const snapshot = buildReleaseSnapshotPayload({
        orgId: snapshotOrgId,
        orgSettings: orgSettingsRow ?? null,
        manifestUi,
        defaultPermissions: getDefaultPermissions(),
        previousBundledVersion: getBundledReleaseSnapshot().version,
      });
      downloadReleaseSnapshotJson(snapshot);
      toast.info('הקובץ ירד, כעת העלה אותו ל-Git כדי לעדכן את הפרו');

      const sessionRes = await supabase.auth.getSession();
      const bearer = sessionRes?.data?.session?.access_token ?? getSupabaseAnonKey();
      const invokeRes = await supabase.functions.invoke('push-release-snapshot', {
        headers: { Authorization: `Bearer ${bearer}` },
        body: { snapshot },
      });
      const data = invokeRes?.data ?? null;
      const error = invokeRes?.error ?? null;
      const ok = !error && data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
      if (ok) {
        toast.success('בנוסף: נדחף לריפו הטסט ב-GitHub (לא פרודקשן; פרסום גרסה בלבד מעדכן את הפרו).');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'דחיפה נכשלה');
    } finally {
      setPushBusy(false);
    }
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
            <p className="text-muted-foreground text-sm">
              {isSuperAdminTeamView ? 'כל הארגונים — תצוגת סופר־אדמין' : 'חברי הארגון ופיצ׳רים אישיים'}
            </p>
          </div>
        </div>

        {showPushToPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-5 w-5" />
                גשר עדכונים לפרודקשן (Git)
              </CardTitle>
              <CardDescription>
                יוצר קובץ <code className="text-xs">release_snapshot.json</code> מהגדרות הארגון הנוכחי, פיצ׳רי UI
                מהמניפסט, ומבנה הרשאות ברירת מחדל — מוריד את הקובץ ומנסה לדחוף ל-GitHub דרך Edge Function
                (דורש סודות GITHUB_TOKEN + GITHUB_REPO).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="default"
                disabled={pushBusy || !(orgId ?? profile?.org_id)}
                onClick={() => void handlePushReleaseSnapshot()}
                className="gap-2"
              >
                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                דחוף עדכונים לפרו
              </Button>
            </CardContent>
          </Card>
        ) : null}

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
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    {showSensitiveColumns ? (
                      <TableHead className="min-w-[132px] align-bottom">
                        <span className="block text-sm font-medium">מזהה ארגון</span>
                        <span className="block font-mono text-[10px] font-normal text-muted-foreground">Org ID</span>
                      </TableHead>
                    ) : null}
                    <TableHead className="align-middle">שם</TableHead>
                    <TableHead className="align-middle">אימייל</TableHead>
                    <TableHead className="min-w-[240px] align-middle">פיצ׳רים</TableHead>
                    <TableHead className="text-center align-middle">סטטוס</TableHead>
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
                        const canOpenFeatureOverrides =
                          isRoeiAdmin ||
                          (memberEmail && memberEmail === viewerEmail) ||
                          (isRavid && memberEmail === 'roeima21@gmail.com');
                        return (
                          <TableRow key={m.id ?? `m-${mi}`}>
                            {showSensitiveColumns ? (
                              <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[140px] truncate align-middle">
                                {m.org_id ?? '—'}
                              </TableCell>
                            ) : null}
                            <TableCell className="font-medium align-middle">{m.full_name || '—'}</TableCell>
                            <TableCell className="text-muted-foreground align-middle" dir="ltr">
                              <span className="truncate block">{m.email || '—'}</span>
                            </TableCell>
                            <TableCell className="text-xs align-middle">
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
                                ניהול פיצ׳רים (משתמש)
                              </Button>
                            </TableCell>
                            <TableCell className="text-center text-xs align-middle">
                              {m?.status === 'pending_approval' ? (
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
                          </TableRow>
                        );
                      })}
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
    </div>
  );
}
