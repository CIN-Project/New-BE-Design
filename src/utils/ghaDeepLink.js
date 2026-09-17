import { decodeBase64 } from "./base64.js";

/**
 * Ported from real Amritara's FormContext.js (~33-140) — resolves a Google
 * Hotel Ads (GHA) deep-link's query params into this package's own
 * search-criteria shape. A GHA link carries a base64-encoded `pid` (the real
 * staahPropertyId) plus check-in/check-out/guest-count params under
 * Google's own names, rather than this app's usual plain propertyId/
 * startDate/endDate scheme — a consumer's own URL-hydration code (e.g.
 * bawahotels-nextjs-new's be-booking/page.js HydrateFromQueryParams) calls
 * this FIRST and only falls back to its normal param reading when it
 * returns null, exactly like real Amritara's FormProvider effect gates its
 * own homepage FilterBar prefill on `utm_source === "GoogleListing" || pid`.
 *
 * This package never reads the URL itself (see SearchBar/externalRedirect's
 * own config-driven, router-agnostic design) — `searchParams` is whatever
 * `.get(key)`-capable object the host's own routing already produced
 * (Next's useSearchParams() return value, a plain URLSearchParams, etc.),
 * and `properties` is that same host's already-loaded config.properties
 * (propertiesApi.mapCityWithPropertyResponse's flat list — each entry's
 * `staahPropertyId` is what `pid` decodes to).
 *
 * Returns null both for "not a GHA link at all" (the normal case for every
 * one of this app's own internal Book Now buttons) and for "is a GHA link
 * but can't be resolved" (missing param, bad pid, unknown property) — the
 * two cases aren't distinguished in the return value since either way the
 * caller's only real option is the same: fall back to the normal flow.
 * Each failure reason is still console.error'd individually so it's not
 * silent.
 *
 * @param {{ get(key: string): string | null }} searchParams
 * @param {Array<{staahPropertyId, propertyName, cityName, cityId}>} [properties]
 * @returns {{
 *   propertyId: string,
 *   propertyName: string,
 *   cityId: string | number | null,
 *   cityName: string,
 *   checkIn: string,
 *   checkOut: string,
 *   adults: string,
 *   children: string,
 *   utmSource: string,
 * } | null}
 */
export function resolveGhaDeepLink(searchParams, properties) {
  const getParam = (...keys) => {
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value !== null) return value;
    }
    return null;
  };

  const pid = getParam("pid");
  const utmSource = getParam("utm_source");
  // Matches Amritara's own signal exactly (FormContext.js ~45): either a
  // genuine pid deep-link, or a GoogleListing-tagged link with no pid —
  // not just any utm_source value, and not a bare pid with some other
  // utm_source.
  if (utmSource !== "GoogleListing" && !pid) return null;

  const required = {
    pid,
    checkIn: getParam("checkIn", "checkin"),
    checkOut: getParam("checkOut", "checkout"),
    adults: getParam("adult", "adults"),
    children: getParam("child", "children"),
    // Also required even on a pid-only link with no utm_source at all —
    // matches Amritara's requiredParams exactly (its own early-exit gate,
    // ~45, is only "is this a GHA link", not "is it a complete one"; a
    // pid-only link still fails this presence check on `utm_source`).
    utmSource,
    // `source` and `utm_campaign` are validated but never actually read
    // again past this point, in real Amritara too (FormContext.js's own
    // requiredParams collects both, only to feed the same presence check
    // below — their values never resurface anywhere downstream there
    // either). Kept as a required-but-unused gate for parity: a GHA feed
    // template missing either of these is exactly as malformed as one
    // missing pid or a date, and should fail the same way.
    source: getParam("source"),
    utmCampaign: getParam("utm_campaign"),
  };
  console.log("[booking-engine-new] GHA deep-link params:", required);
  const missing = Object.entries(required)
    .filter(([, v]) => v === null || v === "")
    .map(([k]) => k);
  if (missing.length > 0) {
    console.error(
      `[booking-engine-new] GHA URL missing required parameter(s): ${missing.join(", ")}`,
    );
    return null;
  }

  let decodedPropertyId;
  try {
    decodedPropertyId = decodeBase64(pid);
  } catch (err) {
    console.error("[booking-engine-new] GHA pid could not be decoded:", err);
    return null;
  }

  const match = (properties || []).find(
    (p) => String(p?.staahPropertyId) === String(decodedPropertyId),
  );
  if (!match) {
    console.error(
      "[booking-engine-new] GHA pid did not match any known property:",
      decodedPropertyId,
    );
    return null;
  }

  return {
    propertyId: match.staahPropertyId,
    propertyName: match.propertyName || "",
    cityId: match.cityId ?? null,
    cityName: match.cityName || "",
    checkIn: required.checkIn,
    checkOut: required.checkOut,
    adults: required.adults,
    children: required.children,
    utmSource,
  };
}
