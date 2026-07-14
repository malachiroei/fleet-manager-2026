/**
 * Keys that must survive cache wipes / force-update / env-guard reloads.
 * Fleet AI chat history is GPT-like persistence in localStorage.
 */
export const FLEET_PRESERVED_LOCAL_STORAGE_KEYS = [
  'fleet-ai-conversations-v1',
] as const;

/** Clear localStorage but restore chat / other durable UX keys afterward. */
export function clearLocalStoragePreservingFleetKeys(): void {
  const saved: Array<[string, string]> = [];
  try {
    for (const key of FLEET_PRESERVED_LOCAL_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value != null) saved.push([key, value]);
    }
  } catch {
    // ignore
  }

  try {
    localStorage.clear();
  } catch {
    // ignore
  }

  try {
    for (const [key, value] of saved) {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}
