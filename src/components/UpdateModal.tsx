import { useRegisterSW } from "@/lib/pwaPromptRegister";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * מצב "prompt": אין עדכון אוטומטי של SW.
 * כפתור "עדכן עכשיו" קורא **רק** ל-updateServiceWorker(true).
 */
export function UpdateModal() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  return (
    <Dialog open={needRefresh} onOpenChange={(open) => !open && setNeedRefresh(false)}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>גרסה חדשה זמינה</DialogTitle>
          <DialogDescription>
            יש גרסה מעודכנת של האפליקציה. תוכל לעדכן עכשיו או להמשיך לעבוד — העדכון לא יוחל אוטומטית.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex flex-row flex-wrap gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => setNeedRefresh(false)}>
            לא עכשיו
          </Button>
          <Button
            type="button"
            onClick={() => {
              // מניעת לופ: מסירים סימוני עדכון/מודאל לפני שמפעילים skipWaiting
              try {
                sessionStorage.removeItem("pwa-modal-for-version");
                sessionStorage.removeItem("pwa-waiting-reload");
              } catch {
                // ignore
              }
              setNeedRefresh(false);
              void updateServiceWorker(true);
            }}
          >
            עדכן עכשיו
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
