# Fleet Manager — Release & update flow (snapshot)

**Last updated:** 2026-03-21

## 2.7.9 additions

- **Heartbeat:** logged-in clients update `profiles.current_app_version` (bundle) once per session; `docs/SUPABASE_PROFILE_VERSION_COLUMNS.sql`.
- **Admin:** “User Status & Versions” table (email, version, optional `target_version`, last `updated_at`); yellow warning if reported version is behind published `version_manifest`.
- **Pro update modal:** if `profiles.target_version` is set (valid semver, supports 4+ segments e.g. `2.7.24.1`), compare against it instead of global manifest version; SW bypass / 3-minute TTL unchanged. **Admin:** User Status table → «שלח גרסה ספציפית» sets `target_version` for one user only.
- **Per-user UI tokens:** `profiles.allowed_features` (JSONB array of `UI_FEATURE_*` strings). Gates merge with global `version_manifest.changes`; does **not** change version / blue update modal for other users. See `docs/SUPABASE_PROFILES_ALLOWED_FEATURES.sql`.

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
