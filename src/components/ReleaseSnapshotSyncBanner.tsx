import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateOrganization } from '@/hooks/useOrganizations';
import { useUpdateOrgSettings } from '@/hooks/useOrgSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getBundledReleaseSnapshot, isSnapshotNewerThanAck, type ReleaseSnapshotFile } from '@/lib/releaseSnapshot';
import { isFleetManagerProHostname } from '@/lib/versionManifest';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * פרודקשן (fleet-manager-pro): מציג כאשר גרסת release_snapshot.json בבנדל גבוהה מ־ACK של הארגון.
 */
const ROEY_RELEASE_BANNER_EMAIL = 'malachiroei@gmail.com';

export function ReleaseSnapshotSyncBanner() {
  const { user, profile, activeOrgId, isAdmin, isManager, hasPermission, isDriver } = useAuth();
  const sessionEmail = (user?.email ?? profile?.email ?? '').trim().toLowerCase();
  const isRoey = sessionEmail === ROEY_RELEASE_BANNER_EMAIL;

  const canSync =
    Boolean(activeOrgId) &&
    (isAdmin || isManager || hasPermission('admin_access')) &&
    !(isDriver && !isManager && !isAdmin);

  const snapshot: ReleaseSnapshotFile = getBundledReleaseSnapshot();

  const { data: ackRow, isPending: ackPending } = useQuery({
    queryKey: ['organization-release-ack', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: async (): Promise<{ release_snapshot_ack_version: string }> => {
      const bundledVer = getBundledReleaseSnapshot().version;
      const { data, error } = await (supabase as any)
        .from('organizations')
        .select('release_snapshot_ack_version')
        .eq('id', activeOrgId)
        .maybeSingle();
      if (error) {
        console.warn('[ReleaseSnapshotSyncBanner] עמודת release_snapshot_ack_version לא זמינה:', error.message);
        return { release_snapshot_ack_version: bundledVer };
      }
      const v = (data as { release_snapshot_ack_version?: string } | null)?.release_snapshot_ack_version;
      return { release_snapshot_ack_version: typeof v === 'string' && v.trim() ? v.trim() : '0.0.0' };
    },
  });

  const updateOrg = useUpdateOrganization();
  const updateUi = useUpdateOrgSettings();
  const [busy, setBusy] = useState(false);

  if (typeof window === 'undefined' || !isFleetManagerProHostname()) return null;
  if (!isRoey) return null;
  if (!canSync || !activeOrgId) return null;
  if (ackPending) return null;

  const ack = ackRow?.release_snapshot_ack_version ?? '0.0.0';
  if (!isSnapshotNewerThanAck(snapshot.version, ack)) return null;

  const apply = async () => {
    setBusy(true);
    try {
      const tpl = snapshot.uiSettingsTemplate ?? {};
      await updateUi.mutateAsync({
        org_id: activeOrgId,
        org_id_number: tpl.org_id_number ?? '',
        health_statement_text: tpl.health_statement_text ?? '',
        vehicle_policy_text: tpl.vehicle_policy_text ?? '',
        health_statement_pdf_url: tpl.health_statement_pdf_url ?? null,
        vehicle_policy_pdf_url: tpl.vehicle_policy_pdf_url ?? null,
      });
      await updateOrg.mutateAsync({
        id: activeOrgId,
        release_snapshot_ack_version: snapshot.version,
      });
      toast.success(`סונכרן לגרסה ${snapshot.version}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'סנכרון נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm space-y-1">
          <p className="font-semibold text-foreground">יש עדכון הגדרות זמין</p>
          <p className="text-muted-foreground">
            גרסת חבילה {snapshot.version} (מול {ack || '0'} בארגון). לחץ לסנכרון תבניות והגדרות מהריליס.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void apply()} className="shrink-0 gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          סנכרן עכשיו
        </Button>
      </CardContent>
    </Card>
  );
}
