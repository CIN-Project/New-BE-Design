import { getOrCreateSessionId, getCtaCustomerId } from "../utils/session.js";
import { getDeviceInfo, getCachedPublicIp } from "../utils/clientInfo.js";

/**
 * Fire-and-forget CTA/lifecycle tracking beacon — ported from Filterbar.js's
 * postBookingWidged (~2190-2291; the same function, with minor payload
 * variations, also lives inline in StayStep.js, DetailStep.js and
 * ConfirmStep.js — every real call site sends this same shape to the same
 * endpoint). Real Amritara fires this at ~45 different UI/lifecycle
 * touchpoints (destination select, search click, room select, rate fetch
 * result, cart open, payment request result, payment confirm result, sold-
 * out room, etc.) — this package now wires nearly all of them (search
 * submit, room select, rate fetch result incl. sold-out/no-rate/network-
 * error branches, guid-token verify, add-ons fetch, promo verify, user
 * enrollment, reservation ID fetch, payment request result, payment
 * confirm result); the function itself is a faithful, complete port so any
 * remaining call site can be added the same way. Not wired: real's own
 * "Fetch Property"/"Property found"/"Fetch Gallery Images" touchpoints
 * (Filterbar.js's property-by-city and gallery-image endpoints have API
 * stubs in this package — api/properties.js's getCityWithProperty/
 * getGalleryByProperty — but no UI flow currently calls them), real's
 * per-room "Room Sold Out" (Filterbar.js's minRate-per-room computation
 * isn't ported; this package's own room list only checks MinInventory
 * group-wide, tracked as "Sold Out"), and real's "Invalid Promocode" (fired
 * from the rate-search response's own promo rejection in real — this
 * package's promo verification only ever goes through the dedicated
 * VerifyPromoCode endpoint, tracked as "Verify Promo Code" instead).
 *
 * `ip`/`deviceName`/`deviceType` are ported from real's getUserInfo()
 * (src/utilities/userInfo.js) via utils/clientInfo.js — deviceName/deviceType
 * are synchronous (derived from navigator.userAgent, same regex/branches as
 * real); `ip` is fetched from the same api64.ipify.org endpoint real uses,
 * but cached at module scope after the first call instead of re-fetched on
 * every single beacon like real does (same IP value either way — see
 * clientInfo.js's own doc comment). `LowestRate`/`SearchRate`/`IsRateMatch`/`ChainName`/
 * `ChainId` are real's rate-ping-verification fields (see
 * utils/ratePricing.js's own "RATE PING" doc comment for why that
 * mechanism isn't implemented here) — sent as their real no-ping defaults
 * (0.00 / "N" / "") rather than omitted, since the endpoint expects the
 * keys to exist.
 *
 * @param {object} config - needs cmsBaseUrl.
 * @param {object} params
 * @param {string} params.ctaName - e.g. "Search Click", "Select Package And
 *   Cart Open", "rate fetched", "Room Sold Out" (real's exact ctaName
 *   strings — matching these matters if the CMS dashboard that consumes
 *   this data filters/groups by ctaName).
 * @param {string|number} [params.propertyId]
 * @param {string} [params.checkIn] - ISO date.
 * @param {string} [params.checkOut] - ISO date.
 * @param {number} [params.adults]
 * @param {number} [params.children]
 * @param {number} [params.roomCount]
 * @param {string} [params.promoCode]
 * @param {string|number} [params.cityId]
 * @param {string} [params.roomsName] - real's `rooms?.RoomName` (singular —
 *   the room just acted on, not a joined list of every selected room).
 * @param {string} [params.packageName] - real's `mapping?.MappingName`.
 * @param {boolean} [params.isCartOpen]
 * @param {boolean} [params.isCartEdit]
 * @param {boolean} [params.isCartClick]
 * @param {boolean} [params.isClose]
 * @param {string} [params.apiName]
 * @param {string} [params.apiUrl]
 * @param {string|number} [params.apiStatus]
 * @param {string|number} [params.apiErrorCode]
 * @param {string} [params.apiMessage]
 * @param {string} [params.customerGuid] - real's CustomerGuid: defaults to
 *   the session-persisted tracking guid (see utils/session.js's
 *   getCtaCustomerId) when omitted, only overridden once a real CRM guid is
 *   known (post "Post User Enrollment" — see DetailStep.jsx's
 *   handlePhoneBlur, which calls setCtaCustomerId so every call site, in
 *   every step, picks the upgraded guid up automatically from here on).
 *   WebsiteGuid is always the session-persisted guid itself, matching real's
 *   own CustomerGuid/WebsiteGuid split (DetailStep.js ~429-430).
 * @param {string} [params.utmSource] - real's `utm_source` (SearchContext's
 *   `utmSource`, set only by a resolved Google Hotel Ads deep-link — see
 *   ghaDeepLink.js). Sent as "" for every non-GHA booking, matching real.
 * @param {string} [params.customField1] - real's CustomField1: only ever
 *   set to the freshly-generated reservation_id, only on the "Pay Now
 *   Click"/"Pay Later Click" beacon fired right after
 *   generateReservationId resolves (DetailStep.js ~1392) — "" for every
 *   other ctaName, which is why this defaults to "" here too.
 */
export async function postBookingWidged(config, params = {}) {
  const base = config?.cmsBaseUrl;
  if (!base || typeof window === "undefined") return Promise.resolve();

  const ip = await getCachedPublicIp();
  const { deviceName, deviceType } = getDeviceInfo();
  const ctaCustomerId = getCtaCustomerId();

  const payload = {
    ctaName: params.ctaName || "",
    urls: window.location.href,
    cityId: params.cityId != null ? String(params.cityId) : "0",
    propertyId: params.propertyId != null ? String(params.propertyId) : "0",
    checkIn: params.checkIn || "",
    checkOut: params.checkOut || "",
    adults: params.adults != null ? String(params.adults) : "0",
    children: params.children != null ? String(params.children) : "0",
    rooms: params.roomCount != null ? String(params.roomCount) : "0",
    promoCode: params.promoCode || "",
    ip,
    sessionId: getOrCreateSessionId(),
    deviceName,
    deviceType,
    roomsName: params.roomsName || "",
    packageName: params.packageName || "",
    isCartOpen: params.isCartOpen ? "Y" : "N",
    isCartEdit: params.isCartEdit ? "Y" : "N",
    isCartClick: params.isCartClick ? "Y" : "N",
    isClose: params.isClose ? "Y" : "N",
    ApiName: params.apiName || "",
    ApiUrl: params.apiUrl || "",
    ApiStatus: params.apiStatus != null ? String(params.apiStatus) : "",
    ApiErrorCode: params.apiErrorCode != null ? String(params.apiErrorCode) : "",
    ApiMessage: params.apiMessage || "",
    CustomerGuid: params.customerGuid || ctaCustomerId,
    WebsiteGuid: ctaCustomerId,
    Utm_source: params.utmSource || "",
    ChainName: "",
    ChainId: 0,
    LowestRate: 0.0,
    SearchRate: 0.0,
    IsRateMatch: "N",
    CustomField1: params.customField1 || "",
  };

  return fetch(`${base}/api/tracker/BookingWidged`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    // Fire-and-forget, exactly like every real call site (none of them
    // await/handle a failure) — a lost tracking beacon should never
    // surface to the guest or block anything.
    console.error("[booking-engine-new] postBookingWidged failed (non-fatal):", err);
  });
}
