/**
 * פרסום גרסה מלא — קריאה ל-Edge Function רק אם יש access_token (בלי ניסיון invoke).
 * הגדרות בטסט לא עוברות לפרו; בפרודקשן יש להגדיר הרשאות/סודות בנפרד.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  invokePublishVersionSnapshot as invokePublishVersionSnapshotCore,
  type PublishVersionSnapshotResponse,
} from '@/lib/invokePublishVersionSnapshot';
import type { VersionSnapshotFile } from '@/lib/versionSnapshotTypes';

export type { PublishVersionSnapshotResponse };

/** הודעה לטוסט כשאין JWT — זהה ל־Error.message מהעטיפה */
export const PUBLISH_REAUTH_MESSAGE = 'נא להתחבר מחדש למערכת';

export async function invokePublishVersionSnapshot(
  snapshot: VersionSnapshotFile,
): Promise<PublishVersionSnapshotResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error(PUBLISH_REAUTH_MESSAGE);
  }
  return invokePublishVersionSnapshotCore(snapshot);
}
