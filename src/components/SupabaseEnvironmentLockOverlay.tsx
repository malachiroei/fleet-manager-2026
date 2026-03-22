import {
  supabaseEnvironmentLockActive,
  SUPABASE_ENVIRONMENT_MISMATCH_OVERLAY_MESSAGE,
  supabaseSystemConfigurationErrorActive,
  SUPABASE_SYSTEM_CONFIGURATION_ERROR_TITLE,
} from '@/lib/supabase/client';

/**
 * Full-screen block: missing URL/key (v2.7.62) or URL/ref guard failure (v2.7.61+).
 */
export function SupabaseEnvironmentLockOverlay() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (supabaseSystemConfigurationErrorActive) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-50"
      >
        <p className="max-w-lg text-xl font-semibold tracking-tight text-amber-200">
          {SUPABASE_SYSTEM_CONFIGURATION_ERROR_TITLE}
        </p>
        <p className="max-w-md text-sm text-zinc-300">
          Supabase is not configured for this deployment. Set{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> or{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code>, and{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> or{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  if (!supabaseEnvironmentLockActive) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-50"
    >
      <p className="max-w-lg text-lg font-semibold tracking-tight text-red-400">
        {SUPABASE_ENVIRONMENT_MISMATCH_OVERLAY_MESSAGE}
      </p>
      <p className="max-w-md text-sm text-zinc-400">
        Check NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PROJECT_REF for this deployment.
      </p>
    </div>
  );
}
