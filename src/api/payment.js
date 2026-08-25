import { requireConfig } from "../config/configContext.js";
import { staahSignedRequest } from "./client.js";
import {
  redirectToPayment as redirectToPaymentRaw,
  encrypt,
  encryptHash,
} from "../utils/paymentHash.js";

/**
 * Generate a reservation ID for the current booking before payment.
 * Signature payload matches DetailStep.js ~671-677: propertyId?.toString()
 * (no extra JSON.stringify wrapper, same style as add-ons/reservation-id).
 */
export function generateReservationId(config, propertyId) {
  const dbKey = `dbKey=${requireConfig(config, "tokenDbKey", "reservation ID generation")}`;
  return staahSignedRequest(
    config,
    "/api/reservation-id",
    { selectedPropertyId: propertyId?.toString(), keyData: dbKey },
    { signaturePayload: propertyId?.toString() },
  );
}

/**
 * Fetch guest/member details prior to checkout, by phone number.
 * Signature payload matches DetailStep.js ~468-472: JSON.stringify(phone).
 */
export function getUserDetails(config, phone, keyData) {
  return staahSignedRequest(
    config,
    "/api/user-details",
    { phone, keyData },
    { signaturePayload: JSON.stringify(phone) },
  );
}

/**
 * Enroll/link a guest to the property's loyalty program during checkout.
 * `payload` is the inner enrollment object ({ MobileNo, PropertyId,
 * SessionId, Ip, Room, Package }) — matches DetailStep.js ~530-546: the
 * signature covers JSON.stringify(payload) (the inner object), while the
 * request body wraps it as { payload, keyData }.
 */
export function postUserEnrollment(config, { payload, keyData }) {
  return staahSignedRequest(
    config,
    "/api/user-enrollment",
    { payload, keyData },
    { signaturePayload: JSON.stringify(payload) },
  );
}

/**
 * Submit the final payment request to STAAH before redirecting to the
 * hosted payment page.
 *
 * Ported from DetailStep.js ~1259-1301: the real API does NOT accept the
 * raw reservation object (the `reservations.reservation[]` shape built for
 * generateReservationId) as its body — it expects a flatter
 * `finalRequestData2` summary (property/customer/amount fields plus
 * `ReservationJson`, the stringified reservation object, embedded as ONE
 * field), wrapped as `{ finalRequestData2, keyData }`. The SIGNATURE,
 * confusingly, covers the raw reservation object instead
 * (`reservationPayload` here) — double-pre-stringified
 * (`JSON.stringify(JSON.stringify(reservationPayload))`) before this
 * function's normal single internal stringify, matching
 * `jsonString = JSON.stringify(payload); createSignature(JSON.stringify(jsonString), ...)`.
 *
 * @param {object} finalRequestData2 - the flat summary object sent as the
 *   actual request body (see DetailStep.jsx's GuestDetailsForm for the fields
 *   ported: property_id/name/tel, cust_name/email/phone, reservation_id,
 *   amount, currency, ReservationJson, Room, Package — BookingDetailsJson/
 *   SessionId/Ip/CtaCustomerId are approximated where the equivalent local
 *   session/IP tracking wasn't ported into this package).
 * @param {object} reservationPayload - the raw reservation object (same
 *   shape passed to generateReservationId's caller) — used ONLY for the
 *   signature, not sent as the body.
 * @param {string} keyData - `dbKey=${config.tokenDbKey}`.
 */
export function postPaymentRequest(
  config,
  { finalRequestData2, reservationPayload, keyData },
) {
  return staahSignedRequest(
    config,
    "/api/th-payment-request",
    { finalRequestData2, keyData },
    { signaturePayload: JSON.stringify(JSON.stringify(reservationPayload)) },
  );
}

/**
 * Confirm/finalize the reservation with STAAH after the guest returns from
 * the hosted payment page — the real call that actually completes the
 * booking against STAAH/the PMS, distinct from postPaymentRequest (which
 * only ever *stages* the reservation before redirecting to payment).
 *
 * Ported from ConfirmStep.js ~251-329 (handleConfirm): the real endpoint is
 * NOT the same as verifyToken's /api/verify-token (that's a booking-widget
 * session check used at wizard-entry time, Filterbar.js ~1550-1578) — this
 * one is what an app previously mistook it for. `responseObject` is the
 * gateway's own echoed response (the `responseJson` sub-object parsed out
 * of the paymentResponse sessionStorage payload); the signature covers
 * JSON.stringify(responseObject), matching ConfirmStep.js ~264-270 exactly.
 * The response's `errorMessage` (only "success" means truly confirmed) and
 * `result[0].bookingDetailsJson` (a JSON string of the authoritative
 * receipt data — package name, room image, hotel address, cancellation
 * policy, T&Cs) are what a guest's "success" state and full receipt should
 * actually be driven by, not the raw, unconfirmed gateway echo alone.
 *
 * @param {object} responseObject - the parsed responseJson from
 *   be_paymentResponse (ConfirmStep.jsx's PAYMENT_RESPONSE_KEY).
 * @param {string} keyData - `dbKey=${config.tokenDbKey}`.
 */
export function confirmPayment(config, { responseObject, keyData }) {
  return staahSignedRequest(
    config,
    "/api/payment/confirm",
    { responseObject, keyData },
    { signaturePayload: JSON.stringify(responseObject) },
  );
}

/**
 * Redirect the browser to STAAH's hosted payment page via a POST form submit.
 */
export function redirectToPayment(config, paramvalues, keydata) {
  const staahBaseUrl = requireConfig(
    config,
    "staahBaseUrl",
    "payment redirect",
  );
  return redirectToPaymentRaw(paramvalues, keydata, staahBaseUrl);
}

export { encrypt, encryptHash };
