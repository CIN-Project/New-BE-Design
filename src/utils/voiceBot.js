import { getRoomsRates, getInventory } from "../api/rates.js";
import { redirectToPayment } from "../api/payment.js";

/**
 * Voice Bot direct-to-payment flow. A phone-based booking bot (external to
 * this package) collects guest/stay details over a call, stages the
 * reservation with STAAH on its own backend, and hands the guest a link
 * (`/be-booking?paycode=...`) containing a one-time code. The host app
 * resolves that code against the bot's own verify endpoint (not part of
 * this package — a plain CMS API Bawa's own code calls directly) and, on
 * success, gets back three things: a `reservationId` STAAH already knows
 * about, a `reservationJson` string (the exact STAAH reservation payload,
 * same shape this package's own DetailStep.jsx would have built from a
 * manually-filled form), and a `bookingDetailsJson` string (this package's
 * own internal snapshot shape, e.g. property/customer/price display data).
 *
 * Per explicit product decision: since the bot's backend already registered
 * the reservation with STAAH (that's what minted `reservationId`), this
 * flow does NOT re-POST to /api/th-payment-request — doing so would attempt
 * to register the same reservation a second time. It goes straight to
 * STAAH's hosted payment page (redirectToPayment, POSTs to
 * /api/th-payment-redirect2), using the bot's own data to build the
 * `paramvalues` payload that call needs — same fields DetailStep.jsx's own
 * Pay Now path sends, just sourced from the bot's data instead of live
 * form/context state.
 *
 * Still re-verifies real-time room availability first (getRoomsRates +
 * getInventory, the same two calls StayStep.jsx/useRepriceSelectedRooms.js
 * make before trusting any room selection) — a reservation staged minutes
 * or hours earlier by the bot could have since sold out, and nothing about
 * skipping the UI should skip that safety check too.
 *
 * @param {object} config - BookingEngineProvider's config.
 * @param {object} params
 * @param {string|object} params.reservationJson - Voice Bot verify
 *   response's `data.reservationJson` (raw string or already-parsed).
 * @param {string|object} params.bookingDetailsJson - Voice Bot verify
 *   response's `data.bookingDetailsJson` (raw string or already-parsed).
 * @param {string} params.reservationId - Voice Bot verify response's
 *   `data.reservationId`.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>} Never
 *   throws for an availability failure — only for a genuine network/API
 *   error reaching STAAH's own inventory/rates endpoints, which callers
 *   should catch themselves. On `{ ok: true }`, the browser has already
 *   been navigated away (redirectToPayment is a real form submit), so
 *   there's nothing left for the caller to render.
 */
export async function verifyVoiceBotInventoryAndPay(
  config,
  { reservationJson, bookingDetailsJson, reservationId },
) {
  const resv =
    typeof reservationJson === "string"
      ? JSON.parse(reservationJson)
      : reservationJson;
  const details =
    typeof bookingDetailsJson === "string"
      ? JSON.parse(bookingDetailsJson)
      : bookingDetailsJson;

  const reservation = resv?.reservations?.reservation?.[0];
  const room = reservation?.room?.[0];
  const propertyId = resv?.PropertyId;
  const roomId = room?.room_id;
  const rateId = room?.price?.[0]?.rate_id;
  const checkInDate = room?.arrival_date;
  const checkOutDate = room?.departure_date;

  if (!propertyId || !roomId || !checkInDate || !checkOutDate) {
    return {
      ok: false,
      reason: "Incomplete reservation data — missing property, room, or dates.",
    };
  }

  const [contentData, inventoryData] = await Promise.all([
    getRoomsRates(config, {
      propertyId,
      checkInDate,
      checkOutDate,
      promoCode: "",
    }),
    getInventory(config, {
      propertyId,
      fromDate: checkInDate,
      toDate: checkOutDate,
      guId: crypto.randomUUID(),
      promoCodeContext: "",
    }),
  ]);

  const contentProperty = Array.isArray(contentData?.PropertyList)
    ? contentData.PropertyList[0]
    : null;
  const inventoryRooms = Array.isArray(inventoryData?.Product)
    ? inventoryData.Product[0]?.Rooms || []
    : [];

  const inventoryRoom = inventoryRooms.find(
    (r) => String(r.RoomId) === String(roomId),
  );
  const hasStock = Number(inventoryRoom?.MinInventory ?? 0) > 0;

  const contentRoom = (contentProperty?.RoomData || []).find(
    (r) => String(r.RoomId) === String(roomId),
  );
  const contentRate = (contentProperty?.RateData || []).find(
    (r) => String(r.RateId) === String(rateId),
  );
  const mapping = (contentProperty?.Mapping || []).find(
    (m) => String(m.RoomId) === String(roomId) && String(m.RateId) === String(rateId),
  );

  if (!hasStock || !contentRoom || !contentRate || !mapping) {
    return {
      ok: false,
      reason: "This room is no longer available for the selected dates.",
    };
  }

  const propertyName = details?.property?.PropertyName || "";
  const propertyPhone = details?.property?.Address?.Phone || "";
  const customer = reservation?.customer || {};
  const amount =
    details?.totalPrice ?? Number(reservation?.totalamountaftertax || 0);
  const resolvedKeyData = config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "";

  const paramvalues = JSON.stringify({
    property_id: propertyId,
    property_name: propertyName,
    property_tel: propertyPhone,
    cust_name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
    cust_email: customer.email || "",
    cust_phone: customer.telephone || "",
    cust_address: "N/A",
    cust_city: "N/A",
    cust_state: "N/A",
    cust_country: "N/A",
    cust_postalcode: "N/A",
    reservation_id: reservationId || reservation?.reservation_id || "",
    amount,
    keyData: resolvedKeyData,
    form_of_payment: "pay_now",
  });

  redirectToPayment(config, paramvalues, resolvedKeyData);
  return { ok: true };
}
