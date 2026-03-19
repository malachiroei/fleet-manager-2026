/** Production app origin (Vercel) — version check, assets base, force-update redirect */
export const FLEET_APP_ORIGIN = 'https://fleet-manager-dev.vercel.app';

export const FLEET_VERSION_JSON_URL = `${FLEET_APP_ORIGIN}/v.json`;

/** "Update Now" navigates here so the app can run SW/cache cleanup on load */
export const FLEET_FORCE_UPDATE_PRO_URL = `${FLEET_APP_ORIGIN}/?action=force_update_pro`;
