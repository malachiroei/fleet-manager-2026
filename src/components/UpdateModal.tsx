import { useMemo } from "react";
import { useRegisterSW } from "@/lib/pwaPromptRegister";
import { hidePwaUpdateModal } from "@/lib/pwaUpdateModalBridge";
import { commitFleetProAcknowledgedVersionAndHardReload } from "@/lib/pwaServiceWorkerControl";
import { isFleetManagerProHostname, normalizeVersion, toCanonicalThreePartVersion } from "@/lib/versionManifest";
import {
  FLEET_PRO_ACK_VERSION_STORAGE_KEY,
  FLEET_PRO_ACK_VERSION_UPDATED_EVENT,
  FLEET_PRO_PRIVATE_ANCHOR_KEY_PREFIX,
  version as bundleVersion,
} from "@/constants/version";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

function clearFleetProPrivateAnchorLocalStorageKeys(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(FLEET_PRO_PRIVATE_ANCHOR_KEY_PREFIX)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

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

  const globalBundleMismatch = useMemo(() => {
    if (updateReason !== "global_version" || !isFleetManagerProHostname()) return false;
    const tv = String(targetVersion ?? "").trim();
    if (!tv) return false;
    const remote =
      toCanonicalThreePartVersion(normalizeVersion(tv)) || normalizeVersion(tv).trim();
    const bundle =
      toCanonicalThreePartVersion(normalizeVersion(bundleVersion)) ||
      normalizeVersion(bundleVersion).trim();
    return remote !== bundle;
  }, [updateReason, targetVersion, bundleVersion]);

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

        {globalBundleMismatch ? (
          <Alert
            variant="destructive"
            className="border-amber-500/60 bg-amber-950/40 text-amber-50 [&>svg]:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle className="text-amber-100">Bundle version mismatch — Re-deploy required</AlertTitle>
            <AlertDescription className="text-amber-100/90 text-xs">
              <code className="rounded bg-black/30 px-1">app_version</code> ב־Supabase ({targetVersion}) אינו תואם לגרסת הבנדל בקוד (
              {bundleVersion}). עדכן את <code className="rounded bg-black/30 px-1">src/constants/version.ts</code>, פרוס מחדש,
              ואז לחץ «עדכן עכשיו».
            </AlertDescription>
          </Alert>
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
            disabled={globalBundleMismatch}
            onClick={() => {
              try {
                sessionStorage.removeItem("pwa-modal-for-version");
                sessionStorage.removeItem("pwa-waiting-reload");
              } catch {
                // ignore
              }
              const tv = String(targetVersion ?? "").trim();
              const ackFallback = tv || String(acknowledgeAsVersion ?? "").trim();
              const pa = (privateAnchorFull || "").trim();
              hidePwaUpdateModal({ dismissUntilPageUnload: isFleetManagerProHostname() });

              if (isFleetManagerProHostname()) {
                if (updateReason === "permission_anchor") {
                  toast.success("העדכון הושלם בהצלחה! האפליקציה תתרענן כעת.");
                  void commitFleetProAcknowledgedVersionAndHardReload(ackFallback, {
                    privateAnchorFull: pa || undefined,
                  });
                  return;
                }
                if (globalBundleMismatch) return;
                try {
                  localStorage.setItem(FLEET_PRO_ACK_VERSION_STORAGE_KEY, tv);
                  localStorage.setItem("fleet-manager-app_version", tv);
                } catch {
                  // ignore
                }
                clearFleetProPrivateAnchorLocalStorageKeys();
                try {
                  window.dispatchEvent(new Event(FLEET_PRO_ACK_VERSION_UPDATED_EVENT));
                } catch {
                  // ignore
                }
                toast.success("העדכון הושלם בהצלחה! האפליקציה תתרענן כעת.");
                window.location.href = `${window.location.origin}?updated=${Date.now()}`;
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
