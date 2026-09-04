"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConfig } from "../../../config/configContext.js";
import { verifyToken } from "../../../api/rates.js";
import { confirmPayment, decryptHashFunction } from "../../../api/payment.js";
import { postBookingWidged } from "../../../api/tracking.js";
import "./ConfirmStep.css";

const PAYMENT_RESPONSE_KEY = "be_paymentResponse";
const BOOKING_DATA_KEY = "be_bookingData";

/**
 * Reads the STAAH round-trip result and renders the receipt.
 *
 * Real flow (ported from Amritara_New_NextJs's ConfirmStep/WizardForm):
 *  1. DetailStep.GuestDetailsForm stores a snapshot of what's being paid for into
 *     sessionStorage["be_bookingData"] right before POSTing the browser to
 *     STAAH's hosted payment page (paymentApi.redirectToPayment).
 *  2. STAAH redirects the browser back to this app with `?tokenKey=...`.
 *  3. On mount, if `tokenKey` is present in the URL we call verifyToken()
 *     (HMAC-signed POST to STAAH's verify-token endpoint) and stash the raw
 *     result into sessionStorage["be_paymentResponse"] so a refresh of this
 *     step doesn't need the token again.
 *  4. Whatever gateway response we resolved (freshly verified or from
 *     storage) is then confirmed — POST {staahBaseUrl}/api/payment/confirm
 *     (confirmPayment, api/payment.js) — which is the call that actually
 *     finalizes the reservation and returns the authoritative receipt data.
 *  5. We render success / error / pending based on THAT confirmation, not
 *     the raw gateway echo from step 2/3 alone.
 *
 * Expected be_paymentResponse shape (verified against the real app):
 *   { result: [ { form_of_payment: "pay_now" | "pay_later", responseJson: {
 *       status: "success" | "error" | "paylater" | ...,
 *       reservation_id, amount, currency, partner_id, hash_key,
 *       pg_transaction_id, ipn_flag, error_msg
 *   } } ] }
 * For pay_later, responseJson.hash_key is decrypted (config.partnerKey)
 * into card_name/card_type/card_exp and merged onto responseJson — see the
 * pay_later branch below.
 *
 * Expected be_bookingData shape (agreed with DetailStep.GuestDetailsForm —
 * matches real ConfirmStep.js's own BookingDetails field access exactly):
 *   {
 *     formData: { title, firstName, lastName, email, phone, ... },
 *     totalPrice,
 *     selectedRoom: [{ roomName, roomImage, roomPackage, adults, children }],
 *     selectedAddonList: [{ AddonName, ... }],
 *     selectedStartDate, selectedEndDate, promoCode,
 *     property: { PropertyName, Address: { AddressLine, City, State,
 *       Country, PostalCode, Email, Phone } },
 *     cancellationPolicyState,
 *   }
 *
 * IMPORTANT: the raw payment-gateway echo above (responseJson) is NOT the
 * authoritative signal that a booking is actually confirmed — it's just
 * what the gateway itself reported back. Real Amritara's ConfirmStep.js
 * (handleConfirm, ~251-329) always makes a SEPARATE call —
 * POST {staahBaseUrl}/api/payment/confirm — to actually finalize the
 * reservation against STAAH/the PMS; only THAT call's `errorMessage`
 * result decides whether the receipt shows success or failure, and its
 * `result[0].bookingDetailsJson` is the authoritative version of the data
 * above (echoed back from what DetailStep.jsx submitted, keyed the same
 * way). This package previously treated the raw gateway echo as the
 * success signal and never made the confirm call at all — confirmPayment
 * below is that missing call.
 */
export function ConfirmStep({ homeUrl = "/", onRetry }) {
  const config = useConfig();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [responseJson, setResponseJson] = useState(null);
  const [bookingData, setBookingData] = useState(null);
  const [hadStoredData, setHadStoredData] = useState(false);
  // null while unresolved; "success" only once the confirm call itself
  // reports success — never derived from the raw gateway echo alone.
  const [reservationStatus, setReservationStatus] = useState(null);
  const [confirmedBookingData, setConfirmedBookingData] = useState(null);
  const [formOfPayment, setFormOfPayment] = useState("")
  // createPortal needs a real document to exist first — false during SSR
  // and the very first client render, true from the next tick onward
  // (matches SearchBar.jsx's own Toaster portal, same reasoning).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;

    async function resolvePaymentResult() {
      console.log(
        "[PAYMENT-FLOW] ConfirmStep.jsx: mounted, resolving payment result",
        { fullUrl: window.location.href },
      );

      let rawResponse = null;

      try {
        rawResponse = window.sessionStorage.getItem(PAYMENT_RESPONSE_KEY);
      } catch {
        rawResponse = null;
      }
      console.log(
        "[PAYMENT-FLOW] ConfirmStep.jsx: existing sessionStorage payment response",
        { hadRawResponse: Boolean(rawResponse), rawResponse },
      );

      const tokenKey = new URLSearchParams(window.location.search).get(
        "tokenKey",
      );
      console.log("[PAYMENT-FLOW] ConfirmStep.jsx: tokenKey from URL", {
        tokenKey,
      });

      if (tokenKey) {
        try {
          console.log(
            "[PAYMENT-FLOW] ConfirmStep.jsx: calling verifyToken (/api/verify-token)...",
          );
          const result = await verifyToken(config, tokenKey);
          console.log("[PAYMENT-FLOW] ConfirmStep.jsx: verifyToken SUCCEEDED", {
            result,
          });
          rawResponse = JSON.stringify(result);
          try {
            window.sessionStorage.setItem(PAYMENT_RESPONSE_KEY, rawResponse);
          } catch {
            // sessionStorage unavailable (private mode, SSR edge cases) - non-fatal.
          }
        } catch (err) {
          console.error(
            "[PAYMENT-FLOW] ConfirmStep.jsx: verifyToken FAILED — will fall back to any stored response, or show pending/failure state",
            err,
          );
        }
      }

      if (cancelled) return;

      const parsedResponseJsonResp = parsePaymentResponse(rawResponse);
      const resultEntry = parsedResponseJsonResp?.[0] || null;
      const parsedResponseJson = resultEntry?.responseJson || null;
      setFormOfPayment(resultEntry?.form_of_payment);

      // Pay-later bookings never go through the real gateway, so STAAH
      // doesn't return real card details — instead it echoes them back
      // encrypted on responseJson.hash_key. Pay-now bookings already have
      // real paymentcarddetail from the gateway itself, so this only ever
      // runs for pay_later. Ported from Amritara's ConfirmStep.js
      // (~196-219): decrypt via config.partnerKey and merge the result
      // both onto responseJson (card_name/card_type/card_exp — what this
      // package's own state/receipt/CMS-persist below all read) and, when
      // present, onto the nested reservationJson.reservations.reservation[0]
      // .paymentcarddetail (kept defensive/optional since this package's
      // verify-token response hasn't been confirmed to carry that nested
      // shape the way Amritara's does).
      if (
        resultEntry?.form_of_payment === "pay_later" &&
        parsedResponseJson?.partner_id &&
        parsedResponseJson?.hash_key
      ) {
        if (config?.partnerKey) {
          try {
            const decryptedData = decryptHashFunction(
              parsedResponseJson.partner_id,
              config.partnerKey,
              parsedResponseJson.hash_key,
            );
            console.log(
              "[PAYMENT-FLOW] ConfirmStep.jsx: pay_later card details decrypted",
              { decryptedData },
            );
            if (decryptedData) {
              parsedResponseJson.card_name = decryptedData?.card_name;
              parsedResponseJson.card_type = decryptedData?.card_type;
              parsedResponseJson.card_exp = decryptedData?.card_exp;

              const reservation =
                resultEntry?.reservationJson?.reservations?.reservation?.[0];
              if (reservation) {
                reservation.paymentcarddetail =
                  reservation.paymentcarddetail || {};
                reservation.paymentcarddetail.CardHolderName =
                  decryptedData?.card_name;
                reservation.paymentcarddetail.CardType =
                  decryptedData?.card_type;
                reservation.paymentcarddetail.ExpireDate =
                  decryptedData?.card_exp;
              }
            }
          } catch (err) {
            console.error(
              "[PAYMENT-FLOW] ConfirmStep.jsx: pay_later card detail decrypt FAILED (non-fatal)",
              err,
            );
          }
        } else {
          console.warn(
            "[booking-engine-new] pay_later card details not decrypted — config.partnerKey is not set. Pass it via <BookingEngineProvider config={{ partnerKey: \"...\" }}>.",
          );
        }
      }

      const parsedBookingData = parseBookingData(
        safeSessionStorageGet(BOOKING_DATA_KEY),
      );
      console.log("parsedBookingData", parsedBookingData);
      console.log(
        "[PAYMENT-FLOW] ConfirmStep.jsx: parsed gateway response + booking data",
        { parsedResponseJson, hasBookingData: Boolean(parsedBookingData) },
      );

      // setFormOfPayment

      setResponseJson(parsedResponseJson);
      setBookingData(parsedBookingData);
      setHadStoredData(Boolean(rawResponse));
      setLoading(false);

      // Mirrors real ConfirmStep.js: confirm is attempted for ANY resolved
      // gateway response, not gated on its raw status already looking like
      // "success" — the gateway's own status flag isn't authoritative here,
      // this call is.
      if (!parsedResponseJson) {
        console.log(
          "[PAYMENT-FLOW] ConfirmStep.jsx: NO gateway response resolved (no tokenKey AND no stored session data) — showing pending/failure state, confirmPayment never called",
        );
        return;
      }

      setConfirming(true);
      try {
        const keyData = config?.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "";
        console.log(
          "[PAYMENT-FLOW] ConfirmStep.jsx: calling confirmPayment (/api/payment/confirm)...",
          { rawStatus: parsedResponseJson?.status },
        );
        const confirmResp = await confirmPayment(config, {
          responseObject: parsedResponseJson,
          keyData,
        });
        console.log("[PAYMENT-FLOW] ConfirmStep.jsx: confirmPayment result", {
          confirmResp,
        });
        if (cancelled) return;

        const confirmedSuccess =
          confirmResp?.result?.[0]?.confirmData?.errorMessage === "success";
        console.log(
          "[PAYMENT-FLOW] ConfirmStep.jsx: FINAL reservationStatus decided",
          { confirmedSuccess, errorMessage: confirmResp?.errorMessage },
        );
        setReservationStatus(confirmedSuccess ? "success" : "failed");

        const details = parseBookingData(
          confirmResp?.result?.[0]?.confirmData?.result?.[0]
            ?.bookingDetailsJson,
        );
        setConfirmedBookingData(details);

        // Ported from ConfirmStep.js's handleConfirm (~251-329) — real's
        // exact apiName ("confirm") and apiUrl for this specific call.
        // postBookingWidged(config, {
        //   ctaName: "",
        //   propertyId: parsedResponseJson?.property_id,
        //   apiName: "confirm",
        //   apiUrl: `${config?.staahBaseUrl || ""}/api/payment/confirm`,
        //   apiStatus: confirmedSuccess ? "200" : "0",
        //   apiErrorCode: confirmedSuccess ? "200" : "0",
        //   apiMessage: confirmedSuccess ? "Success" : "Payment failed",
        // });

        if (confirmedSuccess) {
          // Optional/secondary: persist the confirmed booking server-side.
          // Fire-and-forget — the receipt is already sourced from the
          // verified confirm response, so a failure here shouldn't block it.
          postBookingResponse(
            config,
            parsedResponseJson,
            details || parsedBookingData,
          );
        }
      } catch (err) {
        console.error(
          "[PAYMENT-FLOW] ConfirmStep.jsx: confirmPayment call THREW — treating as failed",
          err,
        );
        if (!cancelled) setReservationStatus("failed");
        // postBookingWidged(config, {
        //   ctaName: "Reservation post",
        //   propertyId: parsedResponseJson?.property_id,
        //   apiName: "confirm",
        //   apiUrl: `${config?.staahBaseUrl || ""}/api/payment/confirm`,
        //   apiErrorCode: "1166",
        //   apiMessage: "Payment failed",
        // });
      } finally {
        if (!cancelled) setConfirming(false);
      }
    }

    resolvePaymentResult();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let content;
  if (loading || confirming) {
    content = (
      <div className="be-success-card">
        <div className="be-success-icon-badge be-success-icon-badge--pending">
          <SpinnerIcon />
        </div>
        <h1 className="be-success-title">Confirming Your Booking</h1>
        <p className="be-success-desc">
          {confirming
            ? "Payment received — finalizing your reservation…"
            : "Please wait while we verify your payment with the bank."}
        </p>
      </div>
    );
  } else {
    const isSuccess = reservationStatus === "success";
    // The confirm call's own bookingDetailsJson (the authoritative, backend-
    // enriched version) wins when present; the pre-payment snapshot is only
    // a fallback for when confirm hasn't run or didn't echo it back.
    const effectiveBookingData = confirmedBookingData || bookingData;

    console.log("[PAYMENT-FLOW] ConfirmStep.jsx: rendering final result", {
      isSuccess,
      reservationStatus,
      hadStoredData,
      hasResponseJson: Boolean(responseJson),
      hasBookingData: Boolean(effectiveBookingData),
    });

    content = isSuccess ? (
      <SuccessReceipt
        formOfPayment={formOfPayment}
        responseJson={responseJson}
        bookingData={effectiveBookingData}
        homeUrl={homeUrl}
        siteName={config?.siteName}
      />
    ) : (
      <FailureState
        responseJson={responseJson}
        hadStoredData={hadStoredData}
        homeUrl={homeUrl}
        onRetry={onRetry}
        siteName={config?.siteName}
        bookingData={effectiveBookingData}
      />
    );
  }

  // Full-screen popup over whatever page/step is behind it (a dimmed,
  // blurred backdrop with the voucher centered on top) rather than
  // rendering inline as this step's own page content — matches a reference
  // design. Portaled to document.body for the same reason every other
  // full-screen overlay in this package is (BookingFlow's mobile search
  // sheet, DropdownModal's dropdowns): so it isn't constrained by this
  // step's own position:relative/overflow ancestors in the wizard layout.
  if (!mounted) return null;

  return createPortal(
    <div className="be-voucher-overlay">{content}</div>,
    document.body,
  );
}

function SuccessReceipt({ responseJson, bookingData, homeUrl, siteName, formOfPayment }) {
  const reservationId = responseJson?.reservation_id || "N/A";
  const amount = responseJson?.amount ?? bookingData?.totalPrice;
  const currency = responseJson?.currency || "INR";
  // STAAH's own "paylater" status (see this file's top doc comment on the
  // expected be_paymentResponse shape) IS specifically the pay-at-hotel/
  // guaranteed-reservation flow, as distinct from a prepaid gateway charge
  // — there's no separate payment-method field in the gateway response to
  // read this off directly.
  const isPayAtHotel = formOfPayment === "pay_later";
  const transactionRef = responseJson?.pg_transaction_id;

  const formData = bookingData?.formData;
  const rooms = bookingData?.selectedRoom || [];
  const addonsText = formatList(bookingData?.selectedAddonList, (addon) =>
    typeof addon === "string" ? addon : addon?.AddonName || addon?.name || "",
  );
  const guestName = [formData?.title, formData?.firstName, formData?.lastName]
    .filter(Boolean)
    .join(" ");
  const guestEmail = formData?.email || "";
  const guestPhone = formData?.phone || "";
  const nights = calcNights(
    bookingData?.selectedStartDate,
    bookingData?.selectedEndDate,
  );

  // The "be-printing-voucher" class (see ConfirmStep.css's own comment on
  // its @media print rules) is what actually confines the print output to
  // just this card instead of the whole page — added right before printing,
  // removed once the print dialog closes (`afterprint`) so it never lingers
  // and affects some later, unrelated print action on this same page.
  const handlePrint = () => {
    document.body.classList.add("be-printing-voucher");
    const cleanup = () => {
      document.body.classList.remove("be-printing-voucher");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <div className="be-voucher-card">
      <div className="be-voucher-header">
        <h1 className="be-voucher-brand">
          {siteName || bookingData?.property?.PropertyName || "Hotel Booking"}
        </h1>
        <p className="be-voucher-subtitle">Luxury Accommodation Voucher</p>
      </div>

      <div className="be-voucher-status-banner">
        <div>
          <span className="be-voucher-label">Booking Status</span>
          <p className="be-voucher-status-value">Reservation Secured</p>
        </div>
        <div className="be-voucher-status-right">
          <span className="be-voucher-label">Confirmation ID</span>
          <p className="be-voucher-confirmation-id">{reservationId}</p>
        </div>
      </div>

      <div className="be-voucher-divider" />

      <div className="be-voucher-grid-2">
        <div className="be-voucher-field">
          <span className="be-voucher-label">Property</span>
          <p className="be-voucher-value">
            {bookingData?.property?.PropertyName || "—"}
          </p>
        </div>
        <div className="be-voucher-field">
          <span className="be-voucher-label">Primary Guest</span>
          <p className="be-voucher-value">{guestName || "—"}</p>
        </div>
      </div>

      <div className="be-voucher-field">
        <span className="be-voucher-label">Reserved Accommodation</span>
        {rooms.length > 0 ? (
          rooms.map((room, i) => (
            <div key={i}>
              <p className="be-voucher-value be-voucher-value--strong">
                Room {i + 1}: {room?.roomName || "—"}
                {room?.roomPackage ? ` (${room.roomPackage})` : ""}
              </p>
              <p className="be-voucher-sub">
                Room {i + 1}: {room?.adults || 0} Adults, {room?.children || 0}{" "}
                Children
              </p>
            </div>
          ))
        ) : (
          <p className="be-voucher-value">—</p>
        )}
      </div>

      <div className="be-voucher-dates-box">
        <div>
          <span className="be-voucher-label">Arrival Check-In</span>
          <p className="be-voucher-value">
            {formatIsoDateOnly(bookingData?.selectedStartDate)}
          </p>
          <p className="be-voucher-sub">From 14:00 (2:00 PM)</p>
        </div>
        <div>
          <span className="be-voucher-label">Departure Check-Out</span>
          <p className="be-voucher-value">
            {formatIsoDateOnly(bookingData?.selectedEndDate)}
          </p>
          <p className="be-voucher-sub">Prior to 12:00 (12:00 Noon)</p>
        </div>
      </div>

      <div className="be-voucher-grid-2">
        <div className="be-voucher-field">
          <span className="be-voucher-label">Stay Duration</span>
          <p className="be-voucher-value">
            {nights} Night{nights === 1 ? "" : "s"}
          </p>
        </div>
        <div className="be-voucher-field">
          <span className="be-voucher-label">Curated Add-ons</span>
          <p className="be-voucher-value">{addonsText || "None"}</p>
        </div>
        <div className="be-voucher-field">
          <span className="be-voucher-label">Contact Coordinates</span>
          <p className="be-voucher-value">{guestPhone || "—"}</p>
          {guestEmail && <p className="be-voucher-value">{guestEmail}</p>}
        </div>
        <div className="be-voucher-field">
          <span className="be-voucher-label">Applied Code</span>
          <p className="be-voucher-value">{bookingData?.promoCode || "None"}</p>
        </div>
      </div>

      <div className="be-voucher-divider" />

      <div className="be-voucher-payment-row">
        <div className="be-voucher-field">
          <span className="be-voucher-label">Payment Method</span>
          <p className="be-voucher-value">
            {isPayAtHotel ? "Guaranteed at Hotel" : "Paid Online"}
          </p>
        </div>
        <div className="be-voucher-field be-voucher-field--right">
          <span className="be-voucher-label">Total Amount (GST Inc.)</span>
          <p className="be-voucher-total-amount">
            {formatCurrency(amount, currency)}
          </p>
        </div>
      </div>

      {/* {transactionRef && (
        <div className="be-voucher-barcode">
          <Barcode seed={transactionRef} />
          <p className="be-voucher-barcode-ref">
            Transaction Ref: {transactionRef}
          </p>
        </div>
      )} */}

      <div className="be-voucher-actions">
        <button onClick={handlePrint} className="be-voucher-btn-print">
          <PrintIcon /> Print Voucher
        </button>
        <a href={homeUrl} className="be-voucher-btn-done">
          Done &amp; Return Home
        </a>
      </div>
    </div>
  );
}

/** Purely decorative — not a real scannable barcode, just a visual echo of
 * one on the voucher. Bar widths are derived from `seed` (the transaction
 * ref) via a small deterministic hash so it looks stable/consistent for a
 * given booking rather than reshuffling on every re-render. */
function Barcode({ seed }) {
  const bars = [];
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < 48; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    bars.push((hash % 3) + 1);
  }
  return (
    <div className="be-voucher-barcode-bars" aria-hidden="true">
      {bars.map((w, i) => (
        <span key={i} style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}

function PrintIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function calcNights(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

function formatIsoDateOnly(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().split("T")[0];
}

/** Same .be-voucher-card shell as SuccessReceipt (a red status banner
 * instead of green, and a short status message instead of the full
 * reservation grid, since there's no confirmed booking to itemize) — a
 * failed/pending payment reads as a status update on the same voucher,
 * not a completely different page. */
function FailureState({
  responseJson,
  hadStoredData,
  homeUrl,
  onRetry,
  siteName,
  bookingData,
}) {
  const hasErrorMessage = Boolean(responseJson?.error_msg);
  const isPending = !hasErrorMessage && !hadStoredData;

  const statusLabel = isPending ? "Booking Pending" : "Payment Unsuccessful";
  const title = isPending
    ? "Booking Pending"
    : "We Couldn't Confirm Your Booking";

  const description = hasErrorMessage
    ? `${responseJson.error_msg} If the amount was deducted, please check your email or contact us and we'll sort it out.`
    : isPending
      ? "We haven't received a confirmation for this booking yet. Please check your email for a confirmation, or contact us if you don't hear back soon."
      : "We couldn't confirm your booking. Please try again or contact support.";

  return (
    <div className="be-voucher-card">
      <div className="be-voucher-header">
        <h1 className="be-voucher-brand">
          {siteName || bookingData?.property?.PropertyName || "Hotel Booking"}
        </h1>
        <p className="be-voucher-subtitle">Reservation Status</p>
      </div>

      <div className="be-voucher-status-banner be-voucher-status-banner--error">
        <div>
          <span className="be-voucher-label">Booking Status</span>
          <p className="be-voucher-status-value be-voucher-status-value--error">
            {statusLabel}
          </p>
        </div>
        {responseJson?.reservation_id && (
          <div className="be-voucher-status-right">
            <span className="be-voucher-label">Reference ID</span>
            <p className="be-voucher-confirmation-id">
              {responseJson.reservation_id}
            </p>
          </div>
        )}
      </div>

      <div className="be-voucher-divider" />

      <h2 className="be-voucher-failure-title">{title}</h2>
      <p className="be-voucher-failure-desc">{description}</p>

      <div className="be-voucher-actions">
        <button
          type="button"
          onClick={
            onRetry ||
            (() => {
              window.location.href = homeUrl;
            })
          }
          className="be-voucher-btn-print"
        >
          Try Again
        </button>
        <a href={homeUrl} className="be-voucher-btn-done">
          Return Home
        </a>
      </div>
    </div>
  );
}

function stripHtml(value) {
  if (!value) return "";
  return String(value).replace(/<[^>]*>?/gm, "");
}

function SpinnerIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="be-spinner-icon"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function safeSessionStorageGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function parsePaymentResponse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.result;
  } catch (err) {
    console.error("[booking-engine-new] Malformed be_paymentResponse:", err);
    return null;
  }
}

function parseBookingData(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("[booking-engine-new] Malformed be_bookingData:", err);
    return null;
  }
}

function formatList(list, getLabel) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list.map(getLabel).filter(Boolean).join(", ");
}

function formatCurrency(amount, currency) {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "INR",
    }).format(numeric);
  } catch {
    return `${currency || ""} ${numeric}`.trim();
  }
}

/**
 * Persists the confirmed booking to the CMS as a durable record independent
 * of STAAH — matches real ConfirmStep.js's fetchBookingResponse (~204-238),
 * which fires only once reservationStatus is genuinely "success" from the
 * confirm call above (not from the raw gateway echo). Fire-and-forget: a
 * failure here shouldn't block the already-rendered receipt.
 */
function postBookingResponse(config, responseJson, bookingData) {
  const base = config?.cmsBaseUrl;
  if (!base) return;

  fetch(`${base}/cmsapi/booking/BookingResponse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reservationNo: responseJson?.reservation_id,
      reservationJson: JSON.stringify(responseJson || {}),
      bookingDetailsJson: JSON.stringify(bookingData || {}),
    }),
  }).catch((err) => {
    console.error(
      "[booking-engine-new] BookingResponse persist failed (non-fatal):",
      err,
    );
  });
}
