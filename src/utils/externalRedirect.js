/**
 * Config-driven equivalent of Filterbar.js's NEXT_PUBLIC_STAAH_REDIRECT
 * env-var toggle + collectionProperties allowlist (~421-516, 2438-2469,
 * 4106-4125).
 *
 * Real Amritara has a SITE-WIDE build-time env var,
 * NEXT_PUBLIC_STAAH_REDIRECT, with two meaningful states:
 *  - "redirect": handleSearchClick calls handleSearchRedirection() instead
 *    of the in-app STAAH content/inventory flow — the guest's browser is
 *    sent straight to an external, third-party hosted booking widget
 *    instead of ever seeing this app's own wizard.
 *  - anything else (including "no", or unset): the normal in-app flow
 *    (handleSearch) runs, which is this package's only behavior today.
 *
 * There are actually TWO different external-redirect targets in the real
 * source — handleSearchTh (~421-452, bookings.amritara.co.in) and
 * handleSearchStaah (~454-516, swiftbook.io) — gated by a hardcoded
 * collectionProperties property-id allowlist (~273-274) inside
 * handleSearchRedirection (~2438-2469). As currently deployed that gate is
 * dead code: BOTH branches of the if/else at ~2461-2467 call
 * handleSearchStaah() (the handleSearchTh() call is commented out on
 * ~2462), so every property redirects to swiftbook.io regardless of the
 * list today. This module ports BOTH real URL-builders faithfully but
 * makes the CHOICE between them config-driven — config.legacyBookingPropertyIds
 * (this package's equivalent of collectionProperties) determines which
 * properties use the TH-style target and which use the STAAH/swiftbook
 * one, giving a consumer the real per-property control real Amritara's own
 * dead branch never actually exercises.
 */

/**
 * Ported from Filterbar.js's handleSearchStaah (~454-516) — the swiftbook.io
 * white-label booking widget URL. This is the real, currently-live target:
 * every property redirects here today when NEXT_PUBLIC_STAAH_REDIRECT is
 * "redirect", regardless of collectionProperties (see this module's doc
 * comment).
 */
export function buildSwiftbookRedirectUrl({
  baseUrl = "https://www.swiftbook.io/inst/#home",
  propertyId,
  checkIn,
  checkOut,
  currency = "INR",
  rooms,
  source = "localuniversal",
  utm = { source: "GoogleListing", medium: "free", campaign: "GoogleListing" },
  fixp = "",
} = {}) {
  const params = new URLSearchParams({
    propertyId: String(propertyId ?? ""),
    JDRN: "Y",
    checkIn: checkIn || "",
    checkOut: checkOut || "",
    currency,
    noofrooms: String((rooms || []).length),
    source,
    utm_source: utm?.source || "",
    utm_medium: utm?.medium || "",
    utm_campaign: utm?.campaign || "",
    m_currency: currency,
    fixp,
  });

  (rooms || []).forEach((room, index) => {
    params.append(`adult${index}`, String(room?.adults ?? 0));
    params.append(`child${index}`, String(room?.children ?? 0));
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Ported from Filterbar.js's handleSearchTh (~421-452) — the
 * bookings.amritara.co.in target. Currently unreachable in real Amritara
 * (its call site is commented out), but faithfully ported here as a real
 * option a consumer's config.legacyBookingPropertyIds can opt specific
 * properties into.
 */
export function buildLegacyBookingRedirectUrl({
  baseUrl = "https://bookings.amritara.co.in/",
  chainId = 5971,
  propertyId,
  checkIn,
  checkOut,
  rooms,
  promoCode = "",
} = {}) {
  const totalAdults = (rooms || []).reduce(
    (sum, r) => sum + (r?.adults || 0),
    0,
  );
  const totalChildren = (rooms || []).reduce(
    (sum, r) => sum + (r?.children || 0),
    0,
  );

  const params = new URLSearchParams({
    chainId: String(chainId),
    propertyId: String(propertyId ?? ""),
    checkIn: checkIn || "",
    checkOut: checkOut || "",
    children: String(totalChildren),
    promocode: promoCode,
  });
  params.append("adults", String(totalAdults));
  params.append("noofrooms", String((rooms || []).length));

  return `${baseUrl}?${params.toString()}`;
}

/**
 * True when config opts this booking flow into external-redirect mode —
 * config.staahRedirectMode === "redirect" is this package's equivalent of
 * NEXT_PUBLIC_STAAH_REDIRECT === "redirect" (see this module's doc
 * comment). Every other value (including unset) keeps the normal in-app
 * flow, exactly like real Amritara's own default.
 */
export function isExternalRedirectMode(config) {
  return config?.staahRedirectMode === "redirect";
}

/**
 * Resolves which external URL (if any) a search should redirect to, given
 * config and the current search criteria — null when
 * isExternalRedirectMode(config) is false, so callers can treat a null
 * return as "proceed with the normal in-app flow" without checking the
 * mode flag twice.
 *
 * @param {object} config
 * @param {{ propertyId, startDate: Date, endDate: Date, rooms: Array<{adults,children}> }} criteria
 */
export function resolveExternalRedirectUrl(
  config,
  { propertyId, startDate, endDate, rooms },
) {
  if (!isExternalRedirectMode(config)) return null;

  const checkIn = formatIsoDateForRedirect(startDate);
  const checkOut = formatIsoDateForRedirect(endDate);

  const legacyIds = (config?.legacyBookingPropertyIds || []).map(Number);
  const isLegacy = legacyIds.includes(Number(propertyId));

  if (isLegacy) {
    return buildLegacyBookingRedirectUrl({
      baseUrl: config?.legacyBookingWidgetUrl,
      propertyId,
      checkIn,
      checkOut,
      rooms,
      promoCode: config?.legacyBookingPromoCode,
    });
  }

  return buildSwiftbookRedirectUrl({
    baseUrl: config?.externalBookingWidgetUrl,
    propertyId,
    checkIn,
    checkOut,
    rooms,
  });
}

function formatIsoDateForRedirect(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}
