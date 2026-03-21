import { useRegisterSW } from "@/lib/pwaPromptRegister";
import { hidePwaUpdateModal } from "@/lib/pwaUpdateModalBridge";
import { commitFleetProAcknowledgedVersionAndHardReload } from "@/lib/pwaServiceWorkerControl";
import { isFleetManagerProHostname } from "@/lib/versionManifest";
import { useFleetProSupabaseUpdateGate } from "@/components/useFleetProSupabaseUpdateGate";
import { toast } from "sonner";
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
 * מצב "prompt": needRefresh מ-useRegisterSW הוא הדגל היחיד ל-open של המודאל.
 * אין skipWaiting עד לחיצה על "עדכן עכשיו" → updateServiceWorker(true).
 * בייצור — רק כאן נשלפת גרסה מ-Supabase (אין מניפסט סטטי על pro; שאר האפליקציה "עיוורת").
 */
export function UpdateModal() {
  useFleetProSupabaseUpdateGate();

  const {
    needRefresh: [needRefresh],
    updatePromptDetails,
    updateServiceWorker,
  } = useRegisterSW({
    immediate: false,
    onRegisteredSW() {
      // אין registration.update() אוטומטי
    },
  });

  const { changes, targetVersion, acknowledgeAsVersion, privateAnchorFull, updateReason } =
    updatePromptDetails;

  return (
    <Dialog
      open={needRefresh}
      onOpenChange={(open) => {
        if (!open) hidePwaUpdateModal();
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-md border-cyan-500/30 bg-[#0b1220] text-white">
        <DialogHeader>
          <DialogTitle className="text-cyan-100">
            {updateReason === "permission_anchor"
              ? "עדכון הרשאות ממשק"
              : "גרסה חדשה זמינה"}
            {targetVersion ? <span className="text-cyan-400"> ({targetVersion})</span> : null}
          </DialogTitle>
          <DialogDescription className="text-white/70">
            {updateReason === "permission_anchor" ? (
              <>
                הגרסה הגלובלית במערכת נשארה <strong className="text-white/90">{targetVersion}</strong> — השתנו הרשאות
                עבור המשתמש שלך. לחיצה על «עדכן עכשיו» שומרת את אותה גרסה גלובלית ב־localStorage כאישור (בלי לשנות את
                מספר הגרסה בענן) ומפעילה את התכונות המעודכנות אחרי רענון.
              </>
            ) : (
              <>
                יש גרסה מעודכנת של האפליקציה. תוכל לעדכן עכשיו או לסגור ולהמשיך לעבוד — המודאל לא יופיע שוב עד רענון מלא
                של הדף (בייצור).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {changes.length > 0 ? (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-300/90">
              מה חדש בגרסה
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-white/90 pe-1">
              {changes.map((line, i) => (
                <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="mt-2 flex flex-row flex-wrap gap-2 sm:justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              hidePwaUpdateModal({
                dismissUntilPageUnload: isFleetManagerProHostname(),
              })
            }
          >
            לא עכשיו
          </Button>
          <Button
            type="button"
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
            onClick={() => {
              try {
                sessionStorage.removeItem("pwa-modal-for-version");
                sessionStorage.removeItem("pwa-waiting-reload");
              } catch {
                // ignore
              }
              const ackRaw = (acknowledgeAsVersion || targetVersion || "").trim();
              const pa = (privateAnchorFull || "").trim();
              hidePwaUpdateModal({ dismissUntilPageUnload: isFleetManagerProHostname() });
              if (isFleetManagerProHostname()) {
                toast.success("העדכון הושלם בהצלחה! האפליקציה תתרענן כעת.");
                void commitFleetProAcknowledgedVersionAndHardReload(ackRaw, {
                  privateAnchorFull: pa || undefined,
                });
                return;
              }
              void updateServiceWorker(true, acknowledgeAsVersion || targetVersion);
            }}
          >
            עדכן עכשיו
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
