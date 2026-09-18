import { staahSignedRequest } from "./client.js";

/**
 * Creates a Razorpay order for the already-staged reservation (staged by
 * postPaymentRequest/th-payment-request, called unchanged before this).
 * Signature payload is the plain { reservation_id, amount } object — a
 * brand-new endpoint, so no legacy double-stringify quirk to preserve here.
 */
export function createRazorpayOrder(
  config,
  { reservation_id, property_id, amount, currency, partner_id, keyData },
) {
  return staahSignedRequest(
    config,
    "/api/razorpay-order",
    { reservation_id, property_id, amount, currency, partner_id, keyData },
    { signaturePayload: { reservation_id, amount } },
  );
}

/**
 * Verifies a completed Razorpay Checkout payment and completes the STAAH
 * reservation server-side. Response is shaped to match confirmPayment's
 * (/api/payment/confirm) envelope so ConfirmStep.jsx's existing
 * errorMessage/bookingDetailsJson reads work unchanged, plus a new
 * "staah_pending" errorMessage value (payment captured, STAAH posting still
 * in progress or needing retry) that ConfirmStep.jsx branches on
 * separately.
 */
export function verifyRazorpayPayment(
  config,
  { razorpay_order_id, razorpay_payment_id, razorpay_signature },
) {
  return staahSignedRequest(
    config,
    "/api/razorpay-verify",
    { razorpay_order_id, razorpay_payment_id, razorpay_signature },
    { signaturePayload: razorpay_order_id },
  );
}

let checkoutScriptPromise = null;

/**
 * Dynamically loads Razorpay's Checkout.js exactly once, resolving with the
 * global `window.Razorpay` constructor. No existing dynamic-script-loading
 * pattern exists elsewhere in this package to reuse — this is new plumbing.
 */
export function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadRazorpayCheckout must run in the browser"));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Failed to load Razorpay checkout script"));
    };
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}
