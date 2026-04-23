/** גשר ל־useAuth (מחוץ ל־ViewAsProvider) — מתי לא לכפות activeOrgId מחדש לפי org_members של המנהל המחובר. */
export const FLEET_VIEW_AS_ACTIVE_SESSION_KEY = 'fleet-view-as-active';

export function readViewAsActiveFromSession(): boolean {
  try {
    return sessionStorage.getItem(FLEET_VIEW_AS_ACTIVE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setViewAsActiveSession(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(FLEET_VIEW_AS_ACTIVE_SESSION_KEY, '1');
    else sessionStorage.removeItem(FLEET_VIEW_AS_ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
