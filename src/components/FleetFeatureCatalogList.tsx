import { Fragment } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe } from "lucide-react";

export type FleetFeatureCatalogListItem = {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  /** טקסט עזר קטן (למשל הסבר מניפסט גלובלי) */
  tertiaryLabel?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  showGlobe?: boolean;
  indent?: boolean;
  sectionHeadingBefore?: string;
};

type FleetFeatureCatalogListProps = {
  items: FleetFeatureCatalogListItem[];
  className?: string;
};

/**
 * רשימת צ'קבוקסים משותפת — מודאל הרשאות משתמש ומודאל פרסום גלובלי.
 */
export function FleetFeatureCatalogList({ items, className }: FleetFeatureCatalogListProps) {
  const ulClass = className ?? "space-y-2.5 rounded-md border border-border bg-muted/20 p-3";
  return (
    <ul className={ulClass}>
      {items.map((row) => (
        <Fragment key={row.id}>
          {row.sectionHeadingBefore ? (
            <li className="list-none pt-2 pb-1 first:pt-0">
              <p className="text-xs font-semibold text-foreground">{row.sectionHeadingBefore}</p>
            </li>
          ) : null}
          <li
            className={
              row.indent
                ? "flex gap-2 items-start ms-6 ps-3 border-s border-primary/30 rounded-e-sm"
                : "flex gap-2 items-start"
            }
          >
            <div className="flex items-start gap-1 shrink-0 pt-0.5">
              <Checkbox
                id={row.id}
                checked={row.checked}
                disabled={row.disabled === true}
                onCheckedChange={(v) => row.onCheckedChange(v === true)}
              />
              {row.showGlobe ? (
                <span
                  title="קיים במניפסט הגלובלי — ניתן לחסום למשתמש זה"
                  className="inline-flex mt-0.5"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-primary/85" aria-hidden />
                </span>
              ) : null}
            </div>
            <label htmlFor={row.id} className="text-sm leading-snug flex-1 min-w-0 cursor-pointer">
              <span className="block break-words font-medium">{row.primaryLabel}</span>
              {row.secondaryLabel ? (
                <span className="block text-[10px] font-mono text-muted-foreground/80 mt-0.5 break-all">
                  {row.secondaryLabel}
                </span>
              ) : null}
              {row.tertiaryLabel ? (
                <span className="block text-[10px] text-muted-foreground mt-1">{row.tertiaryLabel}</span>
              ) : null}
            </label>
          </li>
        </Fragment>
      ))}
    </ul>
  );
}
