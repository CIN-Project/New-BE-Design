import { requireConfig } from "../config/configContext.js";
import {
  createRateSearchClient,
  staahSignedRequest,
  cmsGet,
  cmsPost,
} from "./client.js";

/**
 * Search rooms/rates for a property + date range (CMS "GetRoomsRates" feed).
 */
export async function getRoomsRates(
  config,
  { propertyId, checkInDate, checkOutDate, promoCode },
) {
  const base = requireConfig(config, "cmsRoomRatesBaseUrl", "room/rate search");
  const client = createRateSearchClient(config);
  const url = `${base}/rates/GetRoomsRates?RequestType=bedata&PropertyId=${propertyId}&Product=yes&CheckInDate=${checkInDate}&CheckOutDate=${checkOutDate}&PromoCode=${promoCode || ""}`;
  const response = await client.get(url);
  return response.data;
}

/**
 * Verify a booking-widget token before allowing wizard access.
 * Signature payload matches Filterbar.js ~1562-1566: JSON.stringify(respTokenKey).
 */
export function verifyToken(config, respTokenKey) {
  const dbKey = `dbKey=${requireConfig(config, "tokenDbKey", "token verification")}`;
  return staahSignedRequest(
    config,
    "/api/verify-token",
    { respTokenKey, keyData: dbKey },
    { signaturePayload: JSON.stringify(respTokenKey) },
  );
}

/**
 * Live inventory/rate check for a property (used at search time).
 * Signature payload matches Filterbar.js ~1657-1661: JSON.stringify(propertyId).
 */
export function getInventory(
  config,
  { propertyId, fromDate, toDate, guId, promoCodeContext },
) {
  return staahSignedRequest(
    config,
    "/api/cin-api/inventory",
    {
      selectedPropertyId: propertyId,
      fromDate,
      toDate,
      guId,
      promoCodeContext: promoCodeContext || "",
    },
    { signaturePayload: JSON.stringify(propertyId) },
  );
}

/**
 * Fetch per-day calendar rates for a property over a date range — the price
 * shown under each date in the date-range picker, plus which dates are sold
 * out. Ported from Flatpicker.js's fetchRateRange (~158-187): same STAAH
 * signed-request pattern as getInventory (signature payload is also
 * JSON.stringify(propertyId), confirmed at Flatpicker.js ~162), response is
 * `PropertyList[0].DayRate`, a map of ISO date -> { Rate, MinInventory, ... }.
 */
export async function getDayRateCalendar(
  config,
  { propertyId, fromDate, toDate },
) {
  const data = await staahSignedRequest(
    config,
    "/api/cin-api/rate-et",
    { selectedPropertyId: propertyId, fromDate, toDate },
    { signaturePayload: JSON.stringify(propertyId) },
  );
  return data?.PropertyList?.[0]?.DayRate || {};
}

/**
 * Re-fetch the latest room rate (used right before payment, to guard against
 * stale prices). Note: `/api/cin-api/rate` only ever appears as an analytics
 * label string in the legacy source (Filterbar.js ~1637, ~681) — it's never
 * actually fetched from anywhere in the live app, so this function's real
 * endpoint/signing couldn't be confirmed against a live call site. Signature
 * payload follows the same JSON.stringify(propertyId) pattern as every other
 * confirmed STAAH-signed call, as the best-available guess.
 */
export async function getLatestRoomRates(
  config,
  { propertyId, fromDate, toDate, promoCodeContext },
) {
  const data = await staahSignedRequest(
    config,
    "/api/cin-api/rate",
    {
      selectedPropertyId: propertyId,
      fromDate,
      toDate,
      promoCodeContext: promoCodeContext || "",
    },
    { signaturePayload: JSON.stringify(propertyId) },
  );
  return data?.Product?.[0]?.Rooms;
}

/**
 * Fetch available add-ons for a property.
 * Signature payload matches Filterbar.js ~2022-2026: selectedPropertyId?.toString()
 * (no extra JSON.stringify wrapper, unlike inventory/rate-et/verify-token).
 */
export function getAddOns(config, propertyId) {
  return staahSignedRequest(
    config,
    "/api/cin-api/add-ons",
    { selectedPropertyId: propertyId?.toString() },
    { signaturePayload: propertyId?.toString() },
  );
}

/**
 * Re-fetch the latest add-on rates (used right before payment).
 */
export async function getLatestAddOnsRates(config, propertyId) {
  const data = await getAddOns(config, propertyId);
  return data?.[0]?.ExtrasData;
}

/**
 * Validate a promo code against the CMS before applying it to a booking.
 */
export function verifyPromoCode(config, promoCode) {
  return cmsPost(config, "cmsBaseUrl", "/cmsapi/booking/VerifyPromoCode", {
    promoCode,
  });
}

/**
 * Poll booking status for a reservation reference (used while awaiting payment confirmation).
 */
export function fetchBookingStatus(config, bookingRef) {
  return cmsGet(
    config,
    "cmsBaseUrl",
    `/cmsapi/booking/FetchBooking/${bookingRef}`,
  );
}
