/** שדה changes במניפסט גרסה (Supabase / v-dev-only בטסט) — מערך מחרוזות למודאל העדכון */

export function parseManifestChanges(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const c = (manifest as { changes?: unknown }).changes;
  if (!Array.isArray(c)) return [];
  return c.map((x) => String(x).trim()).filter((s) => s.length > 0);
}
