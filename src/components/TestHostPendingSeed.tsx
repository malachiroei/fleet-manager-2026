import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isFleetManagerTestHost } from '@/lib/pwaPromptRegister';
import { seedPendingUiFeatures278IfMissing } from '@/lib/testPendingChangeSeed';

/** טסט: ממלא pending_changes ב-Supabase כדי שיופיעו צ׳קבוקסים ב«פרסם גרסה» */
export function TestHostPendingSeed() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !isFleetManagerTestHost()) return;
    void seedPendingUiFeatures278IfMissing();
  }, [user]);

  return null;
}
