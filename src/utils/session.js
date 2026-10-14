const SESSION_ID_KEY = "be_sessionId";
const CTA_CUSTOMER_ID_KEY = "be_ctaCustomerId";

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

/**
 * The equivalent of real Amritara's sessionStorage["CtaCustomerId"]
 * (userSessionId.js's getUserSessionId — generated as a `crypto.randomUUID()`
 * alongside sessionId the first time either is needed). Sent as
 * CustomerGuid/WebsiteGuid on every postBookingWidged call (see tracking.js),
 * read fresh from sessionStorage each time rather than threaded through
 * component props/state — this is what makes it survive both a "Post User
 * Enrollment" identity upgrade (setCtaCustomerId below) AND the guest
 * navigating back to an earlier wizard step afterward, exactly like real's
 * own Filterbar.js postBookingWidged (~2296-2303), which reads the same
 * sessionStorage key directly instead of relying on any one component's
 * local state.
 */
export function getCtaCustomerId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem(CTA_CUSTOMER_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CTA_CUSTOMER_ID_KEY, generated);
    return generated;
  } catch {
    return "";
  }
}

/**
 * Overwrites the tracking guid with a real identity once one becomes known —
 * called after "Post User Enrollment" resolves a guest's CRM guid (mirrors
 * real DetailStep.js ~389-392: `if (formData?.customerGuid && ... !=
 * CtaCustomerId) sessionStorage.setItem("CtaCustomerId", formData.customerGuid)`).
 * Every postBookingWidged call from this point on (including from a
 * different wizard step than the one that called this) picks it up
 * automatically via getCtaCustomerId() above.
 */
export function setCtaCustomerId(guid) {
  if (typeof window === "undefined" || !guid) return;
  try {
    sessionStorage.setItem(CTA_CUSTOMER_ID_KEY, guid);
  } catch {
    // Best-effort — a failed write just means this call's guid upgrade is
    // lost, not that tracking breaks (getCtaCustomerId() still falls back
    // to generating/reading its existing value).
  }
}
