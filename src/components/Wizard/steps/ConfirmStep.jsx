"use client";

import { useEffect, useState } from "react";
import { useConfig } from "../../../config/configContext.js";
import { verifyToken } from "../../../api/rates.js";
import { confirmPayment } from "../../../api/payment.js";
import { postBookingWidged } from "../../../api/tracking.js";
import { Button } from "../../shared/Button.js";
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
 *   { result: [ { responseJson: {
 *       status: "success" | "error" | "paylater" | ...,
 *       reservation_id, amount, currency, partner_id,
 *       pg_transaction_id, ipn_flag, error_msg
 *   } } ] }
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

  useEffect(() => {
    let cancelled = false;

    async function resolvePaymentResult() {
      let rawResponse = null;

      try {
        rawResponse = window.sessionStorage.getItem(PAYMENT_RESPONSE_KEY);
      } catch {
        rawResponse = null;
      }

      const tokenKey = new URLSearchParams(window.location.search).get("tokenKey");

      if (tokenKey) {
        try {
          const result = await verifyToken(config, tokenKey);
          rawResponse = JSON.stringify(result);
          try {
            window.sessionStorage.setItem(PAYMENT_RESPONSE_KEY, rawResponse);
          } catch {
            // sessionStorage unavailable (private mode, SSR edge cases) - non-fatal.
          }
        } catch (err) {
          console.error("[booking-engine-new] verifyToken failed:", err);
        }
      }

      if (cancelled) return;

      const parsedResponseJson = parsePaymentResponse(rawResponse);
      const parsedBookingData = parseBookingData(safeSessionStorageGet(BOOKING_DATA_KEY));

      setResponseJson(parsedResponseJson);
      setBookingData(parsedBookingData);
      setHadStoredData(Boolean(rawResponse));
      setLoading(false);

      // Mirrors real ConfirmStep.js: confirm is attempted for ANY resolved
      // gateway response, not gated on its raw status already looking like
      // "success" — the gateway's own status flag isn't authoritative here,
      // this call is.
      if (!parsedResponseJson) return;

      setConfirming(true);
      try {
        const keyData = config?.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "";
        const confirmResp = await confirmPayment(config, {
          responseObject: parsedResponseJson,
          keyData,
        });
        if (cancelled) return;

        const confirmedSuccess = confirmResp?.errorMessage === "success";
        setReservationStatus(confirmedSuccess ? "success" : "failed");

        const details = parseBookingData(confirmResp?.result?.[0]?.bookingDetailsJson);
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
          postBookingResponse(config, parsedResponseJson, details || parsedBookingData);
        }
      } catch (err) {
        console.error("[booking-engine-new] confirmPayment failed:", err);
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

  if (loading || confirming) {
    return (
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
  }

  const isSuccess = reservationStatus === "success";
  // The confirm call's own bookingDetailsJson (the authoritative, backend-
  // enriched version) wins when present; the pre-payment snapshot is only
  // a fallback for when confirm hasn't run or didn't echo it back.
  const effectiveBookingData = confirmedBookingData || bookingData;

  if (isSuccess) {
    return (
      <SuccessReceipt
        responseJson={responseJson}
        bookingData={effectiveBookingData}
        homeUrl={homeUrl}
      />
    );
  }

  return (
    <FailureState
      responseJson={responseJson}
      hadStoredData={hadStoredData}
      homeUrl={homeUrl}
      onRetry={onRetry}
    />
  );
}

function SuccessReceipt({ responseJson, bookingData, homeUrl }) {
  const reservationId = responseJson?.reservation_id || "N/A";
  const amount = responseJson?.amount ?? bookingData?.totalPrice;
  const currency = responseJson?.currency || "INR";

  const formData = bookingData?.formData;
  const rooms = bookingData?.selectedRoom || [];
  const roomsText = formatList(rooms, (room) => room?.roomName || "");
  const packageText = formatList(rooms, (room) => room?.roomPackage || "");
  const addonsText = formatList(bookingData?.selectedAddonList, (addon) =>
    typeof addon === "string" ? addon : addon?.AddonName || addon?.name || ""
  );
  const guestName = [formData?.title, formData?.firstName, formData?.lastName].filter(Boolean).join(" ");
  const guestContact = [formData?.email, formData?.phone].filter(Boolean).join(" | ");
  const totalAdults = rooms.reduce((sum, r) => sum + (parseInt(r?.adults, 10) || 0), 0);
  const totalChildren = rooms.reduce((sum, r) => sum + (parseInt(r?.children, 10) || 0), 0);
  const guestsSummary = `${totalAdults} Adult${totalAdults === 1 ? "" : "s"}${
    totalChildren > 0 ? `, ${totalChildren} Child${totalChildren === 1 ? "" : "ren"}` : ""
  }, ${rooms.length} Room${rooms.length === 1 ? "" : "s"}`;

  const propertyAddress = bookingData?.property?.Address;
  const addressText = [
    propertyAddress?.AddressLine,
    propertyAddress?.City,
    propertyAddress?.State,
    propertyAddress?.Country,
    propertyAddress?.PostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const cancellationPolicyText = stripHtml(bookingData?.cancellationPolicyState);
  const roomImage = rooms?.[0]?.roomImage;

  const handlePrint = () => window.print();

  return (
    <div className="be-success-card">
      <div className="be-success-icon-badge">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="be-success-title">Stay Secured</h1>
      <p className="be-success-desc">Thank you for booking direct. Your accommodation has been reserved.</p>
      <div className="be-booking-id-tag">CONFIRMATION ID: {reservationId}</div>

      <div className="be-success-receipt-details">
        <h3
          style={{
            fontFamily: "var(--be-font-serif, 'Cormorant Garamond', serif)",
            fontSize: "1.3rem",
            marginBottom: "1.2rem",
            borderBottom: "1px solid #e8e6e2",
            paddingBottom: "0.8rem",
          }}
        >
          Reservation Receipt
        </h3>
        {roomImage && (
          <img
            src={roomImage}
            alt=""
            style={{ width: "100%", maxHeight: "220px", objectFit: "cover", borderRadius: "6px", marginBottom: "1rem" }}
          />
        )}
        <div className="be-receipt-grid">
          <div className="be-receipt-item">
            <span>Destination Property</span>
            <p>{bookingData?.property?.PropertyName || "—"}</p>
          </div>
          <div className="be-receipt-item">
            <span>Reserved Room</span>
            <p>{roomsText || "—"}</p>
          </div>
          <div className="be-receipt-item">
            <span>Package</span>
            <p>{packageText || "—"}</p>
          </div>
          <div className="be-receipt-item">
            <span>Check-In</span>
            <p>{formatDate(bookingData?.selectedStartDate)} (14:00 onwards)</p>
          </div>
          <div className="be-receipt-item">
            <span>Check-Out</span>
            <p>{formatDate(bookingData?.selectedEndDate)} (12:00 noon)</p>
          </div>
          <div className="be-receipt-item">
            <span>Guests</span>
            <p>{guestsSummary}</p>
          </div>
          <div className="be-receipt-item">
            <span>Guest Details</span>
            <p>{guestName || "—"}</p>
          </div>
          <div className="be-receipt-item">
            <span>Contact Coordinates</span>
            <p>{guestContact || "—"}</p>
          </div>
          {addonsText && (
            <div className="be-receipt-item" style={{ gridColumn: "1 / -1" }}>
              <span>Curated Add-ons</span>
              <p>{addonsText}</p>
            </div>
          )}
          {addressText && (
            <div className="be-receipt-item" style={{ gridColumn: "1 / -1" }}>
              <span>Hotel Details</span>
              <p>{addressText}</p>
              {propertyAddress?.Phone && <p>{propertyAddress.Phone}</p>}
              {propertyAddress?.Email && <p>{propertyAddress.Email}</p>}
            </div>
          )}
          {cancellationPolicyText && (
            <div className="be-receipt-item" style={{ gridColumn: "1 / -1" }}>
              <span>Cancellation Policy</span>
              <p>{cancellationPolicyText}</p>
            </div>
          )}
          <div className="be-receipt-item" style={{ gridColumn: "1 / -1" }}>
            <span>Total Amount Paid (GST Inc.)</span>
            <p style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--be-color-primary, #846836)" }}>
              {formatCurrency(amount, currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="be-success-actions">
        <button onClick={handlePrint} className="be-btn-success-secondary">
          Print Receipt
        </button>
        <a href={homeUrl} className="be-btn-success-primary" style={{ display: "inline-block", textDecoration: "none", lineHeight: "2.5" }}>
          Return Home
        </a>
      </div>
    </div>
  );
}

function FailureState({ responseJson, hadStoredData, homeUrl, onRetry }) {
  const hasErrorMessage = Boolean(responseJson?.error_msg);
  const title = hasErrorMessage
    ? "We Couldn't Confirm Your Booking"
    : hadStoredData
      ? "We Couldn't Confirm Your Booking"
      : "Booking Pending";

  const description = hasErrorMessage
    ? `${responseJson.error_msg} If the amount was deducted, please check your email or contact us and we'll sort it out.`
    : "We haven't received a confirmation for this booking yet. Please check your email for a confirmation, or contact us if you don't hear back soon.";

  return (
    <div className="be-success-card">
      <div className="be-success-icon-badge be-success-icon-badge--alert">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16.5" x2="12" y2="16.5" />
        </svg>
      </div>
      <h1 className="be-success-title">{title}</h1>
      <p className="be-success-desc">{description}</p>

      <div className="be-success-actions">
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try Again
          </Button>
        ) : (
          <a href={homeUrl} className="be-btn-success-secondary" style={{ display: "inline-block", textDecoration: "none", lineHeight: "2.5" }}>
            Try Again
          </a>
        )}
        <a href={homeUrl} className="be-btn-success-primary" style={{ display: "inline-block", textDecoration: "none", lineHeight: "2.5" }}>
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
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="be-spinner-icon">
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
    return parsed?.result?.[0]?.responseJson || null;
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
  return list
    .map(getLabel)
    .filter(Boolean)
    .join(", ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(amount, currency) {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR" }).format(numeric);
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
    console.error("[booking-engine-new] BookingResponse persist failed (non-fatal):", err);
  });
}
