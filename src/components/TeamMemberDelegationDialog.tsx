import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/fleet';
import type { PermissionKey } from '@/lib/permissions';
import { PERMISSION_KEYS, PERMISSION_LABELS } from '@/lib/permissions';
import {
  getFleetUiPermissionModalCatalogRowsOnly,
  globalManifestUiFeatureTokenSet,
  isFleetStagingOnlyUiTokenId,
  manifestChangesIncludeToken,
  mergeProfilePermissionModalPayload,
  parseProfileAllowedFeatureTokens,
  parseProfileUiFeatureDenylist,
  isFleetUiManifestBypassToken,
} from '@/lib/fleetPublishedUiFeatures';
import {
  fetchAppVersionFromDb,
  fetchVersionManifestFromDb,
  fleetMergeGlobalPublishedVersions,
  formatPrivateUiAnchorVersion,
  isFleetManagerProHostname,
  normalizeVersion,
  parseSemverParts,
  toCanonicalThreePartVersion,
} from '@/lib/versionManifest';
import { version as codeVersion } from '@/constants/version';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useOrgDocumentsPermissionRegistry } from '@/hooks/useOrgDocuments';
import { Loader2 } from 'lucide-react';

const TEAM_QUERY_KEY = ['team-members'] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Profile | null;
  delegatorProfile: Profile | null;
  manifestChangeLines: string[];
  manifestReady: boolean;
  delegatorIsAdmin: boolean;
  delegatorIsManager: boolean;
  delegatorHasPermission: (k: PermissionKey) => boolean;
  orgId: string;
};

function computeUiSelections(
  allowedRaw: unknown,
  deniedRaw: unknown,
  globalSet: Set<string>,
  candidates: { token: string }[]
): Record<string, boolean> {
  const allowed = parseProfileAllowedFeatureTokens(allowedRaw);
  const denied = parseProfileUiFeatureDenylist(allowedRaw, deniedRaw);
  const next: Record<string, boolean> = {};
  for (const { token } of candidates) {
    next[token] = !denied.has(token) && (globalSet.has(token) || allowed.has(token));
  }
  return next;
}

export function TeamMemberDelegationDialog({
  open,
  onOpenChange,
  member,
  delegatorProfile,
  manifestChangeLines,
  manifestReady,
  delegatorIsAdmin,
  delegatorIsManager,
  delegatorHasPermission,
  orgId,
}: Props) {
  const queryClient = useQueryClient();
  const { data: orgDocPermissionRows, refetch: refetchOrgDocPermissionRegistry } =
    useOrgDocumentsPermissionRegistry();

  useEffect(() => {
    if (!open) return;
    void refetchOrgDocPermissionRegistry();
  }, [open, refetchOrgDocPermissionRegistry]);
  const [loadingFresh, setLoadingFresh] = useState(false);
  const [allowedRaw, setAllowedRaw] = useState<unknown>(null);
  const [deniedRaw, setDeniedRaw] = useState<unknown>(null);
  const [permState, setPermState] = useState<Record<string, boolean>>({});
  const [uiState, setUiState] = useState<Record<string, boolean>>({});

  const isPro = isFleetManagerProHostname();
  const globalTokenSet = useMemo(
    () => globalManifestUiFeatureTokenSet(manifestChangeLines, isPro),
    [manifestChangeLines, isPro]
  );

  const delegatorAllowed = useMemo(
    () => parseProfileAllowedFeatureTokens(delegatorProfile?.allowed_features ?? null),
    [delegatorProfile?.allowed_features]
  );

  /** קטלוג סטטי בלבד — טפסי org_documents מוצגים בנפרד */
  const catalogUiRows = useMemo(() => getFleetUiPermissionModalCatalogRowsOnly(), []);

  const combinedUiCandidateTokens = useMemo(() => {
    const forms = orgDocPermissionRows ?? [];
    return [
      ...forms.map((e) => ({ token: e.token })),
      ...catalogUiRows.map((r) => ({ token: r.token })),
    ];
  }, [orgDocPermissionRows, catalogUiRows]);

  const delegatorCanDelegatePermission = useCallback(
    (key: PermissionKey) => delegatorIsAdmin || delegatorIsManager || delegatorHasPermission(key),
    [delegatorIsAdmin, delegatorIsManager, delegatorHasPermission]
  );

  const delegatorCanDelegateUiToken = useCallback(
    (token: string) => {
      const t = String(token).trim();
      if (!t) return false;
      if (delegatorIsAdmin || delegatorIsManager) return true;
      if (!isPro) return !isFleetStagingOnlyUiTokenId(t);
      if (isFleetStagingOnlyUiTokenId(t)) return false;
      if (!manifestReady) return false;
      if (globalTokenSet.has(t)) return true;
      if (isFleetUiManifestBypassToken(t) && !globalTokenSet.has(t)) {
        return delegatorAllowed.has(t);
      }
      return manifestChangesIncludeToken(manifestChangeLines, t) || delegatorAllowed.has(t);
    },
    [
      delegatorAllowed,
      delegatorIsAdmin,
      delegatorIsManager,
      globalTokenSet,
      isPro,
      manifestChangeLines,
      manifestReady,
    ]
  );

  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    setLoadingFresh(true);
    void (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('permissions, allowed_features, denied_features')
          .eq('id', member.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const a = data?.allowed_features ?? member.allowed_features ?? null;
        const d = data?.denied_features ?? member.denied_features ?? null;
        const p = (data?.permissions ?? member.permissions ?? null) as Record<string, boolean> | null;
        setAllowedRaw(a);
        setDeniedRaw(d);
        const nextPerm: Record<string, boolean> = {};
        for (const key of PERMISSION_KEYS) {
          nextPerm[key] =
            p && typeof p[key] === 'boolean'
              ? p[key]
              : true;
        }
        setPermState(nextPerm);
        setUiState(computeUiSelections(a, d, globalTokenSet, uiCandidates));
      } catch (e) {
        console.warn('[TeamDelegation] load profile', e);
        toast({
          title: 'טעינת הרשאות נכשלה',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoadingFresh(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, member, globalTokenSet, combinedUiCandidateTokens]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error('אין משתמש');
      const managed = [
        ...(orgDocPermissionRows ?? []).map((e) => e.token),
        ...catalogUiRows.map((r) => r.token),
      ];
      const payload = mergeProfilePermissionModalPayload(
        allowedRaw,
        deniedRaw,
        managed,
        globalTokenSet,
        uiState
      );

      const [manifestRow, appVerRaw] = await Promise.all([
        fetchVersionManifestFromDb(supabase as any),
        fetchAppVersionFromDb(supabase as any),
      ]);
      const globalRawManifest =
        manifestRow && typeof manifestRow.version === 'string' ? manifestRow.version.trim() : '';
      const merged = fleetMergeGlobalPublishedVersions(globalRawManifest, appVerRaw);
      let globalBase =
        merged
          ? toCanonicalThreePartVersion(normalizeVersion(merged)) || normalizeVersion(merged).trim()
          : '';
      if (!globalBase || !parseSemverParts(globalBase)) {
        globalBase =
          toCanonicalThreePartVersion(normalizeVersion(codeVersion)) ||
          normalizeVersion(codeVersion).trim() ||
          '0.0.0';
      }
      const privateAnchor = formatPrivateUiAnchorVersion(globalBase);

      const nextPermissions: Record<string, boolean> = { ...permState };
      for (const key of PERMISSION_KEYS) {
        if (!delegatorCanDelegatePermission(key)) {
          const prev = member.permissions as Record<string, boolean> | null | undefined;
          if (prev && typeof prev[key] === 'boolean') {
            nextPermissions[key] = prev[key];
          }
        }
      }

      const { error } = await (supabase as any)
        .from('profiles')
        .update({
          permissions: nextPermissions,
          allowed_features: payload.allowed_features,
          denied_features: payload.denied_features,
          ui_denied_features_anchor_version: privateAnchor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TEAM_QUERY_KEY, orgId] });
      toast({ title: 'הרשאות נשמרו' });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: 'שמירה נכשלה', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>ניהול הרשאות — {member?.full_name || member?.email || 'משתמש'}</DialogTitle>
          <DialogDescription>
            ניתן להעניק רק הרשאות ופיצ&apos;רים שקיימים אצלך. תואם לקטלוג המערכת.
          </DialogDescription>
        </DialogHeader>

        {loadingFresh ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 text-sm">
            <div className="space-y-3">
              <p className="font-medium text-foreground">הרשאות מערכת</p>
              <div className="grid gap-2 rounded-md border p-3">
                {PERMISSION_KEYS.map((key) => {
                  const can = delegatorCanDelegatePermission(key);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`tm-perm-${key}`}
                        checked={permState[key] === true}
                        disabled={!can}
                        onCheckedChange={(c) =>
                          setPermState((s) => ({ ...s, [key]: c === true }))
                        }
                      />
                      <Label
                        htmlFor={`tm-perm-${key}`}
                        className={!can ? 'text-muted-foreground' : 'cursor-pointer'}
                      >
                        {PERMISSION_LABELS[key]}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-medium text-foreground">טפסים (מסמכי ארגון)</p>
              <p className="text-xs text-muted-foreground">
                רשימה דינמית מ־<span className="font-mono">org_documents</span> — שם התצוגה לפי עמודת{' '}
                <span className="font-mono">name</span> ואם ריק לפי <span className="font-mono">title</span>.
              </p>
              <div className="grid gap-2 rounded-md border p-3">
                {(orgDocPermissionRows ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">אין טפסים מוגדרים בארגון.</p>
                ) : (
                  (orgDocPermissionRows ?? []).map((row) => {
                    const can = delegatorCanDelegateUiToken(row.token);
                    return (
                      <div key={row.token} className="flex items-start gap-2">
                        <Checkbox
                          id={`tm-form-${row.token}`}
                          checked={uiState[row.token] === true}
                          disabled={!can}
                          onCheckedChange={(c) =>
                            setUiState((s) => ({ ...s, [row.token]: c === true }))
                          }
                        />
                        <Label
                          htmlFor={`tm-form-${row.token}`}
                          className={!can ? 'text-muted-foreground' : 'cursor-pointer leading-snug'}
                        >
                          {row.title}
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-medium text-foreground">פיצ&apos;רי ממשק (קטלוג)</p>
              {!manifestReady && isPro ? (
                <p className="text-xs text-amber-700">טוען מניפסט…</p>
              ) : null}
              <div className="grid gap-3 rounded-md border p-3">
                {catalogUiRows.map((row) => {
                  const can = delegatorCanDelegateUiToken(row.token);
                  return (
                    <Fragment key={row.token}>
                      {row.sectionHeadingBefore ? (
                        <p className="text-xs font-semibold text-muted-foreground">
                          {row.sectionHeadingBefore}
                        </p>
                      ) : null}
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`tm-ui-${row.token}`}
                          checked={uiState[row.token] === true}
                          disabled={!can}
                          onCheckedChange={(c) =>
                            setUiState((s) => ({ ...s, [row.token]: c === true }))
                          }
                        />
                        <Label
                          htmlFor={`tm-ui-${row.token}`}
                          className={!can ? 'text-muted-foreground' : 'cursor-pointer leading-snug'}
                        >
                          {row.title}
                        </Label>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || loadingFresh || !member}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
