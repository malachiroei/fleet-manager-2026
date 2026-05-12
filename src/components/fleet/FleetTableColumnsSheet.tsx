import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Columns3 } from 'lucide-react';
import { toast } from 'sonner';

export type FleetColumnOption = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: FleetColumnOption[];
  /** עמודות קבועות בטבלה (מוצגות ברשימה מסומנות ומנוטרלות — כמו מספר רישוי) */
  fixedColumnHints?: FleetColumnOption[];
  /** עמודות אופציונליות מוצגות כרגע (מקור אמת) */
  value: string[];
  onSave: (next: string[]) => void;
  defaultValue: string[];
  /** localStorage key לשמירת/שחזור «ברירת מחדל» (אופציונלי; כמו בדף הציות) */
  savedDefaultsStorageKey?: string;
  /** Set של id מותרים לשמירת ברירת מחדל — ברירת מחדל: כל ה-options */
  allowedIds?: Set<string>;
};

export function FleetTableColumnsButton({
  onClick,
  label = 'עמודות',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-no-theme
      className="h-10 shrink-0 border-slate-300 bg-white text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100 dark:shadow-none dark:hover:bg-cyan-500/20"
      onClick={onClick}
    >
      <Columns3 className="ml-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}

export function FleetTableColumnsSheet({
  open,
  onOpenChange,
  title,
  description,
  options,
  fixedColumnHints,
  value,
  onSave,
  defaultValue,
  savedDefaultsStorageKey,
  allowedIds: allowedIdsProp,
}: Props) {
  const [draft, setDraft] = useState<string[]>(value);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(value);
      setQuery('');
    }
  }, [open, value]);

  const allowedIds = useMemo(() => {
    if (allowedIdsProp && allowedIdsProp.size > 0) return allowedIdsProp;
    return new Set(options.map((o) => o.id));
  }, [allowedIdsProp, options]);

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const label = (optionById.get(o.id)?.label ?? o.label).toLowerCase();
      return o.id.toLowerCase().includes(q) || label.includes(q);
    });
  }, [options, query, optionById]);

  const toggle = (id: string) => {
    if (!allowedIds.has(id)) return;
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setDraft(options.map((o) => o.id).filter((id) => allowedIds.has(id)));
  const clearAll = () => setDraft([]);
  const resetCodeDefault = () => setDraft([...defaultValue]);

  const restoreSavedDefault = () => {
    if (!savedDefaultsStorageKey || typeof window === 'undefined') {
      resetCodeDefault();
      return;
    }
    try {
      const raw = window.localStorage.getItem(savedDefaultsStorageKey);
      if (!raw) {
        resetCodeDefault();
        toast.success('שוחזרה ברירת המחדל');
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const vis = parsed && typeof parsed === 'object' ? (parsed as { visible?: unknown }).visible : null;
      if (!Array.isArray(vis)) {
        resetCodeDefault();
        toast.success('שוחזרה ברירת המחדל');
        return;
      }
      const out: string[] = [];
      const seen = new Set<string>();
      for (const x of vis) {
        const id = String(x ?? '').trim();
        if (!id || !allowedIds.has(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      setDraft(out.length > 0 ? out : [...defaultValue]);
      toast.success('שוחזרה ברירת המחדל');
    } catch {
      resetCodeDefault();
    }
  };

  const saveAsDefault = () => {
    if (!savedDefaultsStorageKey || typeof window === 'undefined') return;
    try {
      const cleaned = draft.filter((id) => allowedIds.has(id));
      window.localStorage.setItem(savedDefaultsStorageKey, JSON.stringify({ v: 1, visible: cleaned }));
      toast.success('ברירת המחדל נשמרה');
    } catch {
      toast.error('שמירת ברירת מחדל נכשלה');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col border-white/10 bg-[#0b1528] text-white sm:max-w-lg">
        <SheetHeader className="text-right">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-right text-slate-400">{description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש שדה..."
          className="mt-4 border-white/15 bg-black/40 text-right text-white placeholder:text-slate-500"
          dir="rtl"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={selectAll}>
            בחר הכל
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={clearAll}>
            נקה הכל
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 border-white/15 text-xs" onClick={resetCodeDefault}>
            ברירת מחדל (קוד)
          </Button>
          {savedDefaultsStorageKey ? (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 border-white/15 text-xs" onClick={restoreSavedDefault}>
                שחזר ברירת מחדל
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 border-cyan-500/40 text-xs text-cyan-100" onClick={saveAsDefault}>
                שמור ברירת מחדל
              </Button>
            </>
          ) : null}
        </div>

        {fixedColumnHints && fixedColumnHints.length > 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[11px] font-medium text-slate-400">עמודות תמיד מוצגות (לא ניתן להסתיר)</p>
            <div className="space-y-2">
              {fixedColumnHints.map((opt) => (
                <div key={opt.id} className="flex items-start gap-3 rounded-md py-1 opacity-90">
                  <Checkbox checked disabled className="mt-0.5 border-white/25 data-[state=checked]:bg-slate-600" />
                  <span className="flex-1 text-sm text-slate-300">{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-3">
          {filteredOptions.map((opt) => (
            <div
              key={opt.id}
              className="flex cursor-pointer items-start gap-3 rounded-md py-1.5 pr-1 transition hover:bg-white/[0.04]"
              onClick={() => toggle(opt.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(opt.id);
                }
              }}
              role="checkbox"
              aria-checked={draft.includes(opt.id)}
              tabIndex={0}
            >
              <Checkbox
                id={`col-${opt.id}`}
                checked={draft.includes(opt.id)}
                onCheckedChange={() => toggle(opt.id)}
                className="mt-0.5 border-cyan-400/50 data-[state=checked]:bg-cyan-600"
                onClick={(e) => e.stopPropagation()}
              />
              <Label htmlFor={`col-${opt.id}`} className="flex-1 cursor-pointer text-sm font-normal leading-snug text-slate-100">
                {optionById.get(opt.id)?.label ?? opt.label}
              </Label>
            </div>
          ))}
          {filteredOptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">לא נמצאו עמודות לפי החיפוש</p>
          ) : null}
        </div>

        <SheetFooter className="mt-4 flex flex-row-reverse gap-2 border-t border-white/10 pt-4 sm:justify-start">
          <Button
            type="button"
            className="bg-cyan-600 hover:bg-cyan-500"
            onClick={() => {
              onSave(draft);
              toast.success('התצוגה נשמרה');
              onOpenChange(false);
            }}
          >
            שמור
          </Button>
          <Button type="button" variant="ghost" className="text-slate-300 hover:text-white" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
