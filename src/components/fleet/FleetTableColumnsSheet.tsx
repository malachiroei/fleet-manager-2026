import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

export type FleetColumnOption = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: FleetColumnOption[];
  /** עמודות אופציונליות מוצגות כרגע (מקור אמת) */
  value: string[];
  onSave: (next: string[]) => void;
  defaultValue: string[];
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
      className="h-10 shrink-0 border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
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
  value,
  onSave,
  defaultValue,
}: Props) {
  const [draft, setDraft] = useState<string[]>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const toggle = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setDraft(options.map((o) => o.id));
  const clearAll = () => setDraft([]);
  const resetDefault = () => setDraft([...defaultValue]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col border-white/10 bg-[#0b1528] text-white sm:max-w-lg">
        <SheetHeader className="text-right">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-right text-slate-400">{description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={selectAll}>
            בחר הכל
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={clearAll}>
            נקה הכל
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 border-white/15 text-xs" onClick={resetDefault}>
            ברירת מחדל
          </Button>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-3">
          {options.map((opt) => (
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
        </div>

        <SheetFooter className="mt-4 flex flex-row-reverse gap-2 border-t border-white/10 pt-4 sm:justify-start">
          <Button
            type="button"
            className="bg-cyan-600 hover:bg-cyan-500"
            onClick={() => {
              onSave(draft);
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
