import { getOrCreateSessionId } from "../utils/session.js";

/**
 * Fire-and-forget CTA/lifecycle tracking beacon — ported from Filterbar.js's
 * postBookingWidged (~2190-2291; the same function, with minor payload
 * variations, also lives inline in StayStep.js, DetailStep.js and
 * ConfirmStep.js — every real call site sends this same shape to the same
 * endpoint). Real Amritara fires this at ~25 different UI/lifecycle
 * touchpoints (destination select, search click, room select, rate fetch
 * result, cart open, payment request result, payment confirm result, sold-
 * out room, etc.) — this package wires it into the handful of highest-
 * value ones (search submit, room/rate selection, payment request result,
 * payment confirm result) rather than replicating every single trigger
 * point 1:1; the function itself is a faithful, complete port so any
 * additional call site can be added the same way.
 *
 * Not ported: real's `ip`/`deviceName`/`deviceType` come from a dedicated
 * getUserInfo() utility (src/utilities/userInfo.js) this package doesn't
 * carry (see DetailStep.jsx's own doc comment on why) — `deviceType` is
 * approximated client-side from navigator.userAgent instead, and `ip` is
 * left blank rather than calling an external IP-lookup service from inside
 * a UI package. `LowestRate`/`SearchRate`/`IsRateMatch`/`ChainName`/
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
 * @param {string} [params.customerGuid] - real's CustomerGuid/WebsiteGuid
 *   (both set to the same value at every real call site).
 */
export function postBookingWidged(config, params = {}) {
  const base = config?.cmsBaseUrl;
  if (!base || typeof window === "undefined") return Promise.resolve();

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
    ip: "",
    sessionId: getOrCreateSessionId(),
    deviceName: "",
    deviceType: guessDeviceType(),
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
    CustomerGuid: params.customerGuid || "",
    WebsiteGuid: params.customerGuid || "",
    ChainName: "",
    ChainId: 0,
    LowestRate: 0.0,
    SearchRate: 0.0,
    IsRateMatch: "N",
  };

  return fetch(`${base}/cmsapi/tracker/BookingWidged`, {
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

function guessDeviceType() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  if (/mobile/i.test(ua)) return "Mobile";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  return "Desktop";
}
