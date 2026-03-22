import { shouldShowSupabaseEnvTestBadge } from '@/lib/supabase/client';

/**
 * תג פינתי — "ENV: TEST" כשה-guard עבר ואנחנו בסטייג׳'ינג (v2.7.64).
 */
export function FleetEnvTestBadge() {
  if (!shouldShowSupabaseEnvTestBadge()) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[9998] rounded-md border border-amber-400/80 bg-amber-500/95 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-zinc-950 shadow-md"
      aria-hidden
    >
      ENV: TEST
    </div>
  );
}
