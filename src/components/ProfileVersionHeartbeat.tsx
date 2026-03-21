import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FLEET_VERSION_HEARTBEAT_SESSION_KEY, version as bundleVersion } from "@/constants/version";

function isHeartbeatForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: string; code?: string };
  if (e.status === 403) return true;
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("forbidden")) return true;
  if (msg.includes("permission denied")) return true;
  if (msg.includes("403") && msg.includes("not allowed")) return true;
  return false;
}

/**
 * פעם אחת לכל סשן דפדפן + משתמש + גרסת בנדל: מעדכן profiles.current_app_version (דורש עמודות ב-Supabase).
 * לא נוגע ב-SW / bypass. כשלים (כולל רשת) לא מפילים את האפליקציה; 403 לא מדווח לקונסול.
 */
export function ProfileVersionHeartbeat() {
  const { user, loading } = useAuth();
  const ranForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user?.id) return;

    const mark = `${user.id}:${bundleVersion}`;
    try {
      const prev = sessionStorage.getItem(FLEET_VERSION_HEARTBEAT_SESSION_KEY);
      if (prev === mark) return;
    } catch {
      // ignore
    }

    if (ranForUserRef.current === mark) return;
    ranForUserRef.current = mark;

    void (async () => {
      try {
        const now = new Date().toISOString();
        const { data, error } = await (supabase as any)
          .from("profiles")
          .update({
            current_app_version: bundleVersion,
            updated_at: now,
          })
          .eq("id", user.id)
          .select("id, current_app_version")
          .maybeSingle();
        if (error) {
          if (!isHeartbeatForbiddenError(error)) {
            const e = error as {
              code?: string;
              message?: string;
              details?: string | null;
              hint?: string | null;
            };
            console.warn("[ProfileVersionHeartbeat] update failed (summary)", {
              code: e.code,
              message: e.message,
              details: e.details,
              hint: e.hint,
            });
            console.warn("[ProfileVersionHeartbeat] error.message:", e.message);
            console.warn("[ProfileVersionHeartbeat] error.details:", e.details);
          }
          return;
        }
        if (!data) {
          console.warn(
            "[ProfileVersionHeartbeat] no row updated — check profiles.id = auth.uid() and RLS UPDATE on id"
          );
          return;
        }
        try {
          sessionStorage.setItem(FLEET_VERSION_HEARTBEAT_SESSION_KEY, mark);
        } catch {
          // ignore
        }
      } catch (e) {
        if (!isHeartbeatForbiddenError(e)) {
          console.warn("[ProfileVersionHeartbeat]", e);
        }
      }
    })();
  }, [user?.id, loading]);

  return null;
}
