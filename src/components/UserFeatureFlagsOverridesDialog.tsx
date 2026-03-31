import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { QA_FORMS_NESTED_KEYS, QA_FORMS_PARENT_KEY, registryEntryForKey } from '@/lib/featureFlagRegistry';
import { useAuth } from '@/hooks/useAuth';

const NESTED_UNDER_QA_SET = new Set<string>(QA_FORMS_NESTED_KEYS);

function flagMatchesQuery(flag: FeatureFlagRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const reg = registryEntryForKey(flag.feature_key);
  const name = reg?.display_name_he || flag.display_name_he?.trim() || flag.feature_key;
  const desc = reg?.description || flag.description?.trim() || '';
  const uiMapping = reg?.ui_mapping || '';
  return `${flag.feature_key} ${name} ${desc} ${uiMapping}`.toLowerCase().includes(needle);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userLabel?: string | null;
};

type FeatureFlagRow = {
  id: string;
  feature_key: string;
  display_name_he: string | null;
  description: string | null;
  is_enabled_globally: boolean;
};

type OverrideRow = {
  feature_key: string;
  is_enabled: boolean;
};

type SubjectProfileLite = {
  id: string;
  org_id: string | null;
  email: string | null;
  permissions: Record<string, boolean> | null;
};

const FEATURE_PERMISSION_DEFAULTS: Record<string, string | null> = {
  dashboard_vehicles: 'vehicles',
  dashboard_drivers: 'drivers',
  dashboard_exception_alerts: 'compliance',
  dashboard_replacement_car: 'handover',
  qa_team: 'manage_team',
  qa_reports: 'reports',
  qa_parking_reports: 'reports',
  qa_vehicle_delivery: 'vehicle_delivery',
  qa_report_mileage: 'report_mileage',
  qa_service_update: 'vehicles',
  qa_forms: 'forms',
  qa_accidents: 'compliance',
  qa_admin_settings: 'admin_access',
};

export function UserFeatureFlagsOverridesDialog({ open, onOpenChange, userId, userLabel }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean>>({});
  const { user, profile, activeOrgId, hasPermission, isAdmin, isManager } = useAuth();
  const viewerEmail = (profile?.email ?? user?.email ?? '').trim().toLowerCase();
  const isRoeiAdmin = viewerEmail === 'malachiroei@gmail.com';
  const viewerOrgId = (activeOrgId ?? profile?.org_id ?? null) as string | null;
  const viewerIsTeamManager = isRoeiAdmin || isAdmin || isManager || hasPermission('manage_team');

  const { data: featureFlags = [] as FeatureFlagRow[], isLoading: isFlagsLoading, isError: isFlagsError } = useQuery({
    queryKey: ['feature-flags-user-overrides-list'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, feature_key, display_name_he, description, is_enabled_globally')
        .order('feature_key', { ascending: true });
      if (error) throw error;
      // Defensive: DB should have unique feature_key, but UI must not show duplicates.
      const seen = new Set<string>();
      const out: FeatureFlagRow[] = [];
      for (const row of (data ?? []) as FeatureFlagRow[]) {
        const key = String(row.feature_key ?? '').trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        // Show only UI-exposed flags (registry entry exists).
        if (!registryEntryForKey(key)) continue;
        out.push(row);
      }
      return out;
    },
    staleTime: 60_000,
  });

  const { data: subjectProfile } = useQuery({
    queryKey: ['feature-overrides-subject-profile', userId],
    enabled: open && typeof userId === 'string' && userId.length > 0,
    queryFn: async (): Promise<SubjectProfileLite | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, org_id, email, permissions')
        .eq('id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SubjectProfileLite | null;
    },
    staleTime: 60_000,
  });

  const subjectEmail = (subjectProfile?.email ?? userLabel ?? '').trim().toLowerCase();
  const isSubjectRoei = subjectEmail === 'malachiroei@gmail.com';
  const sameOrg = Boolean(viewerOrgId && subjectProfile?.org_id && viewerOrgId === subjectProfile.org_id);
  const canEditSubjectOverrides = Boolean(
    typeof userId === 'string' && userId.length > 0 && (isRoeiAdmin || (viewerIsTeamManager && sameOrg && !isSubjectRoei)),
  );

  const { data: overrideRows = [] as OverrideRow[], isLoading: isOverridesLoading, isError: isOverridesError } = useQuery({
    queryKey: ['user-feature-overrides', userId],
    enabled: open && canEditSubjectOverrides,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_feature_overrides')
        .select('feature_key, is_enabled')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
    staleTime: 60_000,
  });

  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const row of overrideRows ?? []) {
      const k = String(row.feature_key ?? '').trim();
      if (!k) continue;
      m.set(k, row.is_enabled === true);
    }
    return m;
  }, [overrideRows]);
  const featureFlagsVisibleToViewer = featureFlags;

  const effectiveOverrideMap = useMemo(() => {
    const m = new Map(overrideMap);
    for (const [key, val] of Object.entries(optimisticOverrides)) {
      m.set(key, val === true);
    }
    return m;
  }, [overrideMap, optimisticOverrides]);

  const permissionDefaultForFlag = (featureKey: string): boolean | null => {
    const permissionKey = FEATURE_PERMISSION_DEFAULTS[featureKey];
    if (!permissionKey) return null;
    const perms = subjectProfile?.permissions;
    if (!perms || typeof perms !== 'object') return null;
    return perms[permissionKey] === true;
  };

  const flagsWithoutNestedDuplicates = useMemo(
    () => featureFlagsVisibleToViewer.filter((f) => !NESTED_UNDER_QA_SET.has(f.feature_key)),
    [featureFlagsVisibleToViewer],
  );

  const filteredRootFlags = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flagsWithoutNestedDuplicates;
    return flagsWithoutNestedDuplicates.filter((flag) => {
      if (flagMatchesQuery(flag, q)) return true;
      if (flag.feature_key !== QA_FORMS_PARENT_KEY) return false;
      return QA_FORMS_NESTED_KEYS.some((key) => {
        const child = featureFlags.find((f) => f.feature_key === key);
        return child ? flagMatchesQuery(child, q) : false;
      });
    });
  }, [flagsWithoutNestedDuplicates, featureFlags, search]);

  const tableRows = useMemo(() => {
    const byKey = new Map(featureFlagsVisibleToViewer.map((f) => [f.feature_key, f]));
    const sorted = [...filteredRootFlags].sort((a, b) => a.feature_key.localeCompare(b.feature_key));
    const out: { flag: FeatureFlagRow; nestedUnderQa: boolean }[] = [];
    for (const flag of sorted) {
      out.push({ flag, nestedUnderQa: false });
      if (flag.feature_key === QA_FORMS_PARENT_KEY) {
        for (const key of QA_FORMS_NESTED_KEYS) {
          const child = byKey.get(key);
          if (child) out.push({ flag: child, nestedUnderQa: true });
        }
      }
    }
    return out;
  }, [filteredRootFlags, featureFlagsVisibleToViewer]);

  const mergedEffective = (featureKey: string) => {
    const flag = featureFlagsVisibleToViewer.find((f) => f.feature_key === featureKey);
    if (!flag) return false;
    if (effectiveOverrideMap.has(featureKey)) return effectiveOverrideMap.get(featureKey) as boolean;
    const permissionDefault = permissionDefaultForFlag(featureKey);
    if (permissionDefault !== null) return permissionDefault;
    return flag.is_enabled_globally === true; // fallback: org/global flag default
  };

  const qaFormsEffective = mergedEffective(QA_FORMS_PARENT_KEY);

  /** ערך בפועל למשתמש (כולל כיבוי ילדים כשההורה כבוי). */
  const effectiveEnabledForUi = (flag: FeatureFlagRow, nestedUnderQa: boolean) => {
    const base = mergedEffective(flag.feature_key);
    if (nestedUnderQa && qaFormsEffective !== true) return false;
    return base;
  };

  const storedToggleValue = (flag: FeatureFlagRow) => {
    if (effectiveOverrideMap.has(flag.feature_key)) return effectiveOverrideMap.get(flag.feature_key) as boolean;
    const permissionDefault = permissionDefaultForFlag(flag.feature_key);
    if (permissionDefault !== null) return permissionDefault;
    return flag.is_enabled_globally === true;
  };

  const handleToggle = async (featureKey: string, nextEnabled: boolean) => {
    if (!userId) return;
    if (savingKey) return;
    console.log('[FeatureOverrides] saving override', {
      userId,
      featureKey,
      nextEnabled,
    });
    const previous = effectiveOverrideMap.get(featureKey);
    setOptimisticOverrides((prev) => ({ ...prev, [featureKey]: nextEnabled }));
    setSavingKey(featureKey);
    try {
      const { data: upserted, error } = await (supabase as any).from('user_feature_overrides').upsert(
        {
          user_id: userId,
          feature_key: featureKey,
          is_enabled: nextEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,feature_key' },
      ).select('user_id, feature_key, is_enabled');
      if (error) throw error;
      if (!upserted || upserted.length === 0) {
        throw new Error('Override save did not return rows (possible RLS rejection).');
      }

      // Instant UX: update resolved feature-flags cache for this subject user
      // so gated UI disappears/appears immediately in view-as mode.
      queryClient.setQueryData<Record<string, boolean> | undefined>(
        ['feature-flags', userId],
        (prev) => ({
          ...(prev ?? {}),
          [featureKey]: nextEnabled,
        }),
      );

      await queryClient.invalidateQueries({ queryKey: ['user-feature-overrides', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-feature-overrides'] });
      await queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      await queryClient.invalidateQueries({ queryKey: ['feature-flags', userId] });
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        delete next[featureKey];
        return next;
      });
      toast.success(nextEnabled ? 'הoverride הופעל' : 'הoverride הושבת');
    } catch (e) {
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        if (previous === undefined) delete next[featureKey];
        else next[featureKey] = previous;
        return next;
      });
      const msg =
        e instanceof Error
          ? e.message
          : 'עדכון נכשל (ייתכן חסימת RLS בהרשאות user_feature_overrides)';
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>ניהול פיצ׳רים (משתמש)</DialogTitle>
          <DialogDescription>
            Override לפיצ׳רים גלובליים עבור: <strong>{userLabel ?? userId ?? '—'}</strong>. כיבוי «טפסים» משבית בפועל את
            טופס המסירה וההחזרה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!canEditSubjectOverrides ? (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              אין הרשאה לשנות Overrides עבור משתמש זה (מותר רק באותו ארגון, וללא גישה למשתמש סופר־אדמין).
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="feature-override-search">חיפוש</Label>
            <Input
              id="feature-override-search"
              placeholder="הקלד/י מפתח או שם בעברית…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {(isFlagsLoading || isOverridesLoading) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען פיצ'רים…
            </div>
          )}

          {(!isFlagsLoading && !isFlagsError) && (
            <div className="rounded-md border border-border overflow-x-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">שם הפיצ׳ר</TableHead>
                    <TableHead className="min-w-[200px]">תיאור</TableHead>
                    <TableHead className="min-w-[120px] text-muted-foreground font-mono text-xs">
                      מפתח
                    </TableHead>
                    <TableHead className="w-[120px] text-center">פעיל למשתמש</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map(({ flag, nestedUnderQa }) => {
                    const reg = registryEntryForKey(flag.feature_key);
                    const displayName = reg?.display_name_he || flag.display_name_he?.trim() || flag.feature_key;
                    const desc = reg?.description || flag.description?.trim() || `שליטה על תצוגת ${displayName}`;
                    const uiMapping = reg?.ui_mapping ?? '';
                    const mergedOn = mergedEffective(flag.feature_key);
                    const effectiveUi = effectiveEnabledForUi(flag, nestedUnderQa);
                    const stored = storedToggleValue(flag);
                    const isSaving = savingKey === flag.feature_key;
                    const switchDisabled = isSaving || (nestedUnderQa && qaFormsEffective !== true);
                    return (
                      <TableRow
                        key={`${flag.id}-${nestedUnderQa ? 'n' : 'r'}`}
                        className={
                          nestedUnderQa
                            ? 'bg-slate-500/5 border-r-2 border-r-cyan-500/40'
                            : effectiveUi
                              ? 'bg-emerald-500/5'
                              : 'bg-muted/25'
                        }
                      >
                        <TableCell className={`font-medium align-top ${nestedUnderQa ? 'pr-6' : ''}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate flex items-center gap-2">
                              {nestedUnderQa ? (
                                <span className="text-cyan-400/80 text-lg leading-none" aria-hidden>
                                  └
                                </span>
                              ) : null}
                              {displayName}
                            </span>
                            <span
                              className={
                                effectiveUi
                                  ? 'inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-200 whitespace-nowrap'
                                  : 'inline-flex items-center rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-200 whitespace-nowrap'
                              }
                            >
                              {effectiveUi
                                ? 'פעיל'
                                : nestedUnderQa && mergedOn && qaFormsEffective !== true
                                  ? 'מושבת (הורה כבוי)'
                                  : 'מושבת'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground align-top max-w-md">
                          {desc}
                          {uiMapping ? (
                            <p className="mt-1 text-xs text-cyan-200/80">
                              מיפוי UI: {uiMapping}
                            </p>
                          ) : null}
                          {nestedUnderQa && qaFormsEffective !== true ? (
                            <p className="mt-1 text-xs text-amber-200/90">
                              כבוי בפועל כל עוד «טפסים» (פעולות מהירות) מושבת.
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <code className="text-xs text-muted-foreground" dir="ltr">
                            {flag.feature_key}
                          </code>
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="flex justify-center">
                            <Switch
                              checked={stored}
                              disabled={switchDisabled || !canEditSubjectOverrides}
                              onCheckedChange={(v) => void handleToggle(flag.feature_key, v)}
                              aria-label={`override עבור ${displayName}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {(isFlagsError || isOverridesError) && (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              לא ניתן לטעון את רשימת הפיצ'רים/Overrides. נסה/י שוב.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

