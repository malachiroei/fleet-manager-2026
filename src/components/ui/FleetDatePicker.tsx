import { useState, useCallback, useMemo, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function parseLooseDate(input: string): Date | undefined {
  const t = input.trim();
  if (!t) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T12:00:00`);
    return isValid(d) ? d : undefined;
  }
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return undefined;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const d = new Date(y, month, day);
  if (d.getFullYear() !== y || d.getMonth() !== month || d.getDate() !== day) return undefined;
  return d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** מספרים בלבד → dd/MM/yyyy עם מקפים אוטומטיים תוך הקלדה */
function formatDigitsToDdMmYyyy(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export type FleetDatePickerProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (ymd: string) => void;
  className?: string;
  /** padded = 01/08/2026; compact = 1/8/2026 (יום/חודש/שנה) */
  slashDisplay?: 'padded' | 'compact';
};

/** תאריך yyyy-MM-dd עם הקלדה ידנית (dd/MM/yyyy) ולוח שנה — אייקון לוח בהיר על רקע כהה */
export function FleetDatePicker({
  id,
  label,
  value,
  onChange,
  className,
  slashDisplay = 'padded',
}: FleetDatePickerProps) {
  const [open, setOpen] = useState(false);

  const formatDisplayFromYmd = useCallback(
    (ymd: string) => {
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
      const d = new Date(`${ymd}T12:00:00`);
      if (!isValid(d)) return '';
      if (slashDisplay === 'compact') {
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      }
      return format(d, 'dd/MM/yyyy');
    },
    [slashDisplay],
  );

  const [text, setText] = useState(() => formatDisplayFromYmd(value));

  useEffect(() => {
    setText(formatDisplayFromYmd(value));
  }, [value, formatDisplayFromYmd]);

  const selected = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const d = new Date(`${value}T12:00:00`);
    return isValid(d) ? d : undefined;
  }, [value]);

  const applyYmd = useCallback(
    (ymd: string) => {
      onChange(ymd);
      setText(formatDisplayFromYmd(ymd));
    },
    [onChange, formatDisplayFromYmd],
  );

  return (
    <div className={cn('space-y-1', className)} dir="rtl">
      {label ? (
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      ) : null}
      <div className="relative" dir="ltr">
        <Input
          id={id}
          value={text}
          placeholder="יום/חודש/שנה"
          className="h-10 bg-background/80 pr-11 font-mono text-sm tabular-nums text-slate-100 placeholder:text-slate-500"
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value.trim();
            const isoFull = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFull) {
              const ymd = `${isoFull[1]}-${isoFull[2]}-${isoFull[3]}`;
              const d = new Date(`${ymd}T12:00:00`);
              if (isValid(d)) {
                onChange(ymd);
                setText(formatDisplayFromYmd(ymd));
              }
              return;
            }
            const formatted = formatDigitsToDdMmYyyy(v);
            setText(formatted);
            const digits = formatted.replace(/\D/g, '');
            if (!digits.length) {
              onChange('');
              return;
            }
            /** רק תאריך מלא (יום+חודש+שנה בארבע ספרות) מתעדכן תוך הקלדה — 6 ספרות (yy) היו ננעלות על 2020 לפני סיום 2026 */
            if (digits.length === 8) {
              const parsed = parseLooseDate(formatted);
              if (parsed) {
                const ymd = toYmd(parsed);
                onChange(ymd);
                setText(formatDisplayFromYmd(ymd));
              }
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            const isoFull = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFull) {
              const ymd = `${isoFull[1]}-${isoFull[2]}-${isoFull[3]}`;
              const d = new Date(`${ymd}T12:00:00`);
              if (isValid(d)) {
                onChange(ymd);
                setText(formatDisplayFromYmd(ymd));
              } else {
                setText(formatDisplayFromYmd(value));
              }
              return;
            }
            const formatted = formatDigitsToDdMmYyyy(v);
            const digits = formatted.replace(/\D/g, '');
            if (!digits.length) {
              onChange('');
              setText('');
              return;
            }
            if (digits.length === 6 || digits.length === 8) {
              const parsed = parseLooseDate(formatted);
              if (parsed) {
                const ymd = toYmd(parsed);
                onChange(ymd);
                setText(formatDisplayFromYmd(ymd));
                return;
              }
            }
            setText(formatDisplayFromYmd(value));
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-200 hover:bg-white/15 hover:text-white"
              aria-label="פתח לוח שנה"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" dir="ltr">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(d) => {
                if (!d) return;
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, '0');
                const da = String(d.getDate()).padStart(2, '0');
                applyYmd(`${y}-${mo}-${da}`);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
