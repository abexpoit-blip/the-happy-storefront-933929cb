export const SESSION_START_KEY = "zoru.session.start";
/** Idle limit in minutes for regular users (admins exempt). */
export const SESSION_MINUTES = 30;

/** Marks/refreshes the activity timestamp. */
export function markSessionStart() {
  try { localStorage.setItem(SESSION_START_KEY, String(Date.now())); } catch { /* ignore */ }
}
export function touchSession() {
  markSessionStart();
}
export function clearSessionStart() {
  try { localStorage.removeItem(SESSION_START_KEY); } catch { /* ignore */ }
}
