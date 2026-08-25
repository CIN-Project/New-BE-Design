const SESSION_ID_KEY = "be_sessionId";

/**
 * A stable per-tab session id, generated once and persisted in
 * sessionStorage — this package's equivalent of real Amritara's
 * sessionStorage["sessionId"] (set via getUserSessionId(), Filterbar.js
 * ~2200-2207 and every other postBookingWidged call site). Real Amritara
 * sources this id from a dedicated session-registration API call
 * (getUserSessionId, src/utilities/userSessionId.js — not ported, see
 * DetailStep.jsx's own doc comment on why); this is a lightweight
 * client-only substitute that's stable for the lifetime of the tab, which
 * is enough to correlate tracking events and payment calls within one
 * booking attempt even without a server-registered session.
 */
export function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return "";
  }
}
