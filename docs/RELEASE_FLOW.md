# Fleet Manager — Release & update flow (snapshot)

**Last updated:** 2026-03-21

## Current production picture (2.7.8)

- **Live on Pro (`fleet-manager-pro.com`):** selective UI from published `version_manifest.changes` — **Star icon (⭐)** in the header is **on** (token `UI_FEATURE_STAR_HEADER`).
- **Pending for a future release (e.g. 2.7.9):** **Bold version text** (`UI_FEATURE_BOLD_VERSION_HEADER`) remains in **`pending_changes`** until it is checked and published.

## How it works (short)

1. **Test / Admin (fleet-manager-dev):** `pending_changes` in Supabase `system_settings` is seeded with the two UI lines (see `src/lib/testPendingChangeSeed.ts`). Publish modal checkboxes control what goes into `version_manifest.changes`.
2. **Production header:** `useFleetHeaderUiFeatures` loads `version_manifest` from Supabase and enables Bold / Star only if the matching **stable token** appears in `changes`.
3. **PWA “Update now”:** Hard lock uses `FORCE_UPDATE_RELOAD` (localStorage) + `sessionId` (sessionStorage + SW postMessage), **3-minute** bypass TTL, cleared on `controllerchange` and on **every** app boot in `main.tsx` (all hosts).

## Keys in Supabase (`system_settings`)

| `key`               | Purpose                                      |
|---------------------|----------------------------------------------|
| `version_manifest`  | Published version + `changes[]` (what Pro UI honors) |
| `pending_changes`   | Queue for Admin checkboxes before publish   |

## Local snapshot of KV shape

See `docs/snapshots/STABLE_2026-03-21/` for example JSON you can keep in git as a **reference** (not a live DB dump). To export live data, use Supabase Table Editor → `system_settings` → export row `value` JSON, or SQL.
