import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, Shield } from 'lucide-react';

import {
  groupFeatureFlagRowsByCategory,
  isNestedUnderQaFormsRow,
  QA_FORMS_NESTED_KEYS,
  QA_FORMS_PARENT_KEY,
  registryEntryForKey,
  syncFeatureFlagsFromRegistry,
  type FeatureFlagCategoryId,
} from '@/lib/featureFlagRegistry';

type FeatureFlagRow = {
  id: string;
  feature_key: string;
  display_name_he: string | null;
  description: string | null;
  category: string | null;
  is_enabled_globally: boolean;
};

const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const FEATURE_CATEGORY_ICONS: Record<string, string> = {
  dashboard: '🏠',
  quick_actions: '⚡',
  forms: '📄',
  other: '🔧',
};

function featureFlagRowMatchesQuery(row: FeatureFlagRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const reg = registryEntryForKey(row.feature_key);
  const displayName = reg?.display_name_he || row.display_name_he?.trim() || row.feature_key;
  const desc = reg?.description || row.description?.trim() || `שליטה על תצוגת ${displayName}`;
  const uiMapping = reg?.ui_mapping || '';
  const hay = `${row.feature_key} ${displayName} ${desc} ${uiMapping}`.toLowerCase();
  return hay.includes(needle);
}

function buildQuickActionsDisplayRows(
  sectionRows: FeatureFlagRow[],
  allRows: FeatureFlagRow[],
): { row: FeatureFlagRow; nestedUnderQa: boolean }[] {
  const byKey = new Map(allRows.map((r) => [r.feature_key, r]));
  const sorted = [...sectionRows].sort((a, b) => a.feature_key.localeCompare(b.feature_key));
  const out: { row: FeatureFlagRow; nestedUnderQa: boolean }[] = [];
  for (const row of sorted) {
    out.push({ row, nestedUnderQa: false });
    if (row.feature_key === QA_FORMS_PARENT_KEY) {
      for (const key of QA_FORMS_NESTED_KEYS) {
        const child = byKey.get(key);
        if (child) out.push({ row: child, nestedUnderQa: true });
      }
    }
  }
  return out;
}

export function GlobalFeatureFlagsAdminPanel() {
  const queryClient = useQueryClient();

  const [addFeatureDialogOpen, setAddFeatureDialogOpen] = useState(false);
  const [newFeatureKeyInput, setNewFeatureKeyInput] = useState('');
  const [newFeatureNameHeInput, setNewFeatureNameHeInput] = useState('');
  const [newFeatureDescriptionInput, setNewFeatureDescriptionInput] = useState('');
  const [newFeatureCategoryInput, setNewFeatureCategoryInput] =
    useState<FeatureFlagCategoryId>('quick_actions');
  const [isInsertingFeature, setIsInsertingFeature] = useState(false);
  const [isSyncingFeatureFlags, setIsSyncingFeatureFlags] = useState(false);
  const [togglingFeatureId, setTogglingFeatureId] = useState<string | null>(null);
  const [featureFlagsSearch, setFeatureFlagsSearch] = useState('');
  const [bulkTogglingSectionKey, setBulkTogglingSectionKey] = useState<string | null>(null);

  const { data: featureFlagRows = [], isLoading: featureFlagsTableLoading } = useQuery({
    queryKey: ['feature-flags-admin'],
    queryFn: async (): Promise<FeatureFlagRow[]> => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, feature_key, display_name_he, description, category, is_enabled_globally')
        .order('feature_key', { ascending: true });
      if (error) throw error;
      const seen = new Set<string>();
      const out: FeatureFlagRow[] = [];
      for (const row of (data ?? []) as FeatureFlagRow[]) {
        const key = String(row.feature_key ?? '').trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!registryEntryForKey(key)) continue;
        out.push(row);
      }
      return out;
    },
    staleTime: 10_000,
  });

  const groupedFeatureFlagSections = useMemo(
    () => groupFeatureFlagRowsByCategory(featureFlagRows),
    [featureFlagRows],
  );

  /** תתי־טפסים מוצגים תחת «טפסים» בפעולות מהירות — לא בקבוצת הטפסים הנפרדת. */
  const groupedFeatureFlagSectionsForUi = useMemo(() => {
    const mapped = groupedFeatureFlagSections.map((section) =>
      section.sectionKey === 'forms'
        ? { ...section, rows: section.rows.filter((r) => !isNestedUnderQaFormsRow(r)) }
        : section,
    );
    return mapped.filter((section) => section.rows.length > 0);
  }, [groupedFeatureFlagSections]);

  const groupedFeatureFlagSectionsByKey = useMemo(() => {
    return new Map(groupedFeatureFlagSectionsForUi.map((s) => [s.sectionKey, s]));
  }, [groupedFeatureFlagSectionsForUi]);

  const filteredGroupedFeatureFlagSections = useMemo(() => {
    const q = featureFlagsSearch.trim().toLowerCase();
    if (!q) return groupedFeatureFlagSectionsForUi;
    return groupedFeatureFlagSectionsForUi
      .map((section) => {
        if (section.sectionKey === 'quick_actions') {
          return {
            ...section,
            rows: section.rows.filter((row) => {
              if (featureFlagRowMatchesQuery(row, q)) return true;
              if (row.feature_key !== QA_FORMS_PARENT_KEY) return false;
              return QA_FORMS_NESTED_KEYS.some((key) => {
                const child = featureFlagRows.find((r) => r.feature_key === key);
                return child ? featureFlagRowMatchesQuery(child, q) : false;
              });
            }),
          };
        }
        return { ...section, rows: section.rows.filter((row) => featureFlagRowMatchesQuery(row, q)) };
      })
      .filter((section) => section.rows.length > 0);
  }, [featureFlagsSearch, groupedFeatureFlagSectionsForUi, featureFlagRows]);

  const invalidateFeatureFlagCaches = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    await queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
  }, [queryClient]);

  const handleFeatureFlagToggle = useCallback(
    async (row: FeatureFlagRow, nextEnabled: boolean) => {
      setTogglingFeatureId(row.id);
      try {
        const { error } = await supabase
          .from('feature_flags')
          .update({ is_enabled_globally: nextEnabled })
          .eq('id', row.id);
        if (error) throw error;
        await invalidateFeatureFlagCaches();
        toast.success(nextEnabled ? 'הפיצ׳ר הופעל' : 'הפיצ׳ר כובה');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'עדכון נכשל');
      } finally {
        setTogglingFeatureId(null);
      }
    },
    [invalidateFeatureFlagCaches],
  );

  const handleBulkToggleSection = useCallback(
    async (sectionKey: string, rows: FeatureFlagRow[], nextEnabled: boolean) => {
      if (!rows.length) return;
      if (bulkTogglingSectionKey) return;
      setBulkTogglingSectionKey(sectionKey);
      try {
        const ids = rows.map((r) => r.id);
        const { error } = await supabase
          .from('feature_flags')
          .update({ is_enabled_globally: nextEnabled })
          .in('id', ids);
        if (error) throw error;
        await invalidateFeatureFlagCaches();
        toast.success(nextEnabled ? 'כל הקטגוריה הופעלה' : 'כל הקטגוריה הושבתה');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Bulk עדכון נכשל');
      } finally {
        setBulkTogglingSectionKey(null);
      }
    },
    [bulkTogglingSectionKey, invalidateFeatureFlagCaches],
  );

  const handleSyncFeatureFlagsFromCode = useCallback(async () => {
    setIsSyncingFeatureFlags(true);
    try {
      const { inserted, skipped } = await syncFeatureFlagsFromRegistry(supabase);
      await invalidateFeatureFlagCaches();
      toast.success(`סנכרון מהקוד הושלם: נוספו ${inserted} שורות, ${skipped} כבר היו קיימות`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'סנכרון נכשל');
    } finally {
      setIsSyncingFeatureFlags(false);
    }
  }, [invalidateFeatureFlagCaches]);

  const handleAddFeatureFlag = useCallback(async () => {
    const key = newFeatureKeyInput.trim().toLowerCase();
    const nameHe = newFeatureNameHeInput.trim();
    if (!FEATURE_KEY_PATTERN.test(key)) {
      toast.error('מפתח לא תקין: אנגלית קטנה, ספרות ו־_, חייב להתחיל באות.');
      return;
    }
    if (!nameHe) {
      toast.error('נא למלא שם בעברית');
      return;
    }
    setIsInsertingFeature(true);
    try {
      const { error } = await supabase.from('feature_flags').insert({
        feature_key: key,
        display_name_he: nameHe,
        description: newFeatureDescriptionInput.trim() || null,
        category: newFeatureCategoryInput,
        is_enabled_globally: false,
      });
      if (error) throw error;
      toast.success('הפיצ׳ר נוסף (כבוי כברירת מחדל)');
      setAddFeatureDialogOpen(false);
      setNewFeatureKeyInput('');
      setNewFeatureNameHeInput('');
      setNewFeatureDescriptionInput('');
      setNewFeatureCategoryInput('quick_actions');
      await invalidateFeatureFlagCaches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הוספה נכשלה');
    } finally {
      setIsInsertingFeature(false);
    }
  }, [
    newFeatureKeyInput,
    newFeatureNameHeInput,
    newFeatureDescriptionInput,
    newFeatureCategoryInput,
    invalidateFeatureFlagCaches,
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
                <Shield className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <CardTitle>ניהול פיצ׳רים גלובליים</CardTitle>
                <CardDescription className="mt-1 max-w-2xl">
                  שליטה ב־feature flags לכל המערכת.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                disabled={isSyncingFeatureFlags}
                onClick={() => void handleSyncFeatureFlagsFromCode()}
              >
                {isSyncingFeatureFlags ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                סנכרן פיצ׳רים מהקוד
              </Button>
              <Button type="button" className="gap-2" onClick={() => setAddFeatureDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                הוסף פיצ׳ר חדש
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {featureFlagsTableLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען פיצ׳רים…
            </div>
          ) : featureFlagRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center text-muted-foreground text-sm">
              אין שורות בטבלה. לחץ «סנכרן פיצ׳רים מהקוד» או הוסף ידנית.
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-2">
                <Label htmlFor="feature-flags-search">חיפוש פיצ׳רים</Label>
                <Input
                  id="feature-flags-search"
                  placeholder="הקלד/י שם (בעברית) או מפתח…"
                  value={featureFlagsSearch}
                  onChange={(e) => setFeatureFlagsSearch(e.target.value)}
                />
              </div>

              {filteredGroupedFeatureFlagSections.map((section) => {
                const originalSection = groupedFeatureFlagSectionsByKey.get(section.sectionKey);
                const originalRows = originalSection?.rows ?? section.rows;
                const allEnabled = originalRows.length > 0 && originalRows.every((r) => r.is_enabled_globally);
                const nextEnabled = !allEnabled;
                const icon = FEATURE_CATEGORY_ICONS[section.sectionKey] ?? FEATURE_CATEGORY_ICONS.other;
                const showBulk =
                  section.sectionKey === 'dashboard' ||
                  section.sectionKey === 'quick_actions' ||
                  section.sectionKey === 'forms';
                const qaFormsRow = featureFlagRows.find((r) => r.feature_key === QA_FORMS_PARENT_KEY);
                const parentFormsHubOn = qaFormsRow?.is_enabled_globally === true;
                const tableEntries =
                  section.sectionKey === 'quick_actions'
                    ? buildQuickActionsDisplayRows(section.rows, featureFlagRows)
                    : section.rows.map((row) => ({ row, nestedUnderQa: false as boolean }));

                return (
                  <div key={section.sectionKey} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-cyan-200/90 border-b border-cyan-500/20 pb-1 flex items-center gap-2">
                        <span aria-hidden>{icon}</span>
                        {section.title}
                      </h3>
                      {showBulk ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={bulkTogglingSectionKey === section.sectionKey || originalRows.length === 0}
                          onClick={() => void handleBulkToggleSection(section.sectionKey, originalRows, nextEnabled)}
                        >
                          {nextEnabled ? 'הפעל הכל' : 'כבה הכל'}
                        </Button>
                      ) : null}
                    </div>
                    <div className="rounded-md border border-border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[140px]">שם הפיצ׳ר</TableHead>
                            <TableHead className="min-w-[200px]">תיאור</TableHead>
                            <TableHead className="min-w-[120px] text-muted-foreground font-mono text-xs">
                              מפתח
                            </TableHead>
                            <TableHead className="w-[120px] text-center">פעיל גלובלית</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableEntries.map(({ row, nestedUnderQa }) => {
                            const reg = registryEntryForKey(row.feature_key);
                            const displayName =
                              reg?.display_name_he || row.display_name_he?.trim() || row.feature_key;
                            const desc =
                              reg?.description || row.description?.trim() || `שליטה על תצוגת ${displayName}`;
                            const uiMapping = reg?.ui_mapping ?? '';
                            const busy = togglingFeatureId === row.id;
                            const storedOn = row.is_enabled_globally === true;
                            const effectiveOn = storedOn && (!nestedUnderQa || parentFormsHubOn);
                            const switchDisabled = busy || (nestedUnderQa && !parentFormsHubOn);
                            return (
                              <TableRow
                                key={`${row.id}-${nestedUnderQa ? 'nested' : 'root'}`}
                                className={
                                  nestedUnderQa
                                    ? 'bg-slate-500/5 border-r-2 border-r-cyan-500/40'
                                    : effectiveOn
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
                                        effectiveOn
                                          ? 'inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-200 whitespace-nowrap'
                                          : 'inline-flex items-center rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-200 whitespace-nowrap'
                                      }
                                    >
                                      {effectiveOn
                                        ? 'פעיל'
                                        : nestedUnderQa && storedOn && !parentFormsHubOn
                                          ? 'מושבת (הורה כבוי)'
                                          : 'מושבת'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground align-top max-w-md">
                                  {desc}
                                  {uiMapping ? (
                                    <p className="mt-1 text-xs text-cyan-200/80">מיפוי UI: {uiMapping}</p>
                                  ) : null}
                                  {nestedUnderQa && !parentFormsHubOn ? (
                                    <p className="mt-1 text-xs text-amber-200/90">
                                      כבוי בפועל כל עוד «טפסים» (פעולות מהירות) מושבת.
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell className="align-top">
                                  <code className="text-xs text-muted-foreground" dir="ltr">
                                    {row.feature_key}
                                  </code>
                                </TableCell>
                                <TableCell className="align-middle">
                                  <div className="flex justify-center">
                                    <Switch
                                      checked={row.is_enabled_globally}
                                      disabled={switchDisabled}
                                      onCheckedChange={(v) => void handleFeatureFlagToggle(row, v)}
                                      aria-label={`הפעלת ${displayName}`}
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addFeatureDialogOpen} onOpenChange={setAddFeatureDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת פיצ׳ר</DialogTitle>
            <DialogDescription>מפתח באנגלית (snake_case), שם לתצוגה בעברית. אפשר להוסיף תיאור אופציונלי.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ff-key">מפתח (אנגלית)</Label>
              <Input
                id="ff-key"
                dir="ltr"
                className="font-mono text-sm"
                placeholder="my_custom_feature"
                value={newFeatureKeyInput}
                onChange={(e) => setNewFeatureKeyInput(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ff-name-he">שם בעברית</Label>
              <Input
                id="ff-name-he"
                placeholder="למשל: רכב חליפי"
                value={newFeatureNameHeInput}
                onChange={(e) => setNewFeatureNameHeInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ff-cat">קטגוריה</Label>
              <select
                id="ff-cat"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newFeatureCategoryInput}
                onChange={(e) => setNewFeatureCategoryInput(e.target.value as FeatureFlagCategoryId)}
              >
                <option value="dashboard">כרטיסי דשבורד</option>
                <option value="quick_actions">פעולות מהירות</option>
                <option value="forms">טפסים</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ff-desc">תיאור (אופציונלי)</Label>
              <Textarea
                id="ff-desc"
                rows={2}
                placeholder="מה הפיצ׳ר משפיע עליו באפליקציה"
                value={newFeatureDescriptionInput}
                onChange={(e) => setNewFeatureDescriptionInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddFeatureDialogOpen(false)} disabled={isInsertingFeature}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleAddFeatureFlag()} disabled={isInsertingFeature}>
              {isInsertingFeature ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  שומר…
                </>
              ) : (
                'שמור'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

