import * as React from "react";
import { DayPicker, NextMonthButton, PreviousMonthButton } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * לוח שנה — כפתורי החודש מוחלפים: «קודם» מקדם חודש ו«הבא» מחזיר (לפי בקשת מוצר).
 */
function Calendar({ className, classNames, showOutsideDays = true, components: userComponents, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md", className)}
      classNames={classNames}
      components={{
        ...userComponents,
        PreviousMonthButton: NextMonthButton,
        NextMonthButton: PreviousMonthButton,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
