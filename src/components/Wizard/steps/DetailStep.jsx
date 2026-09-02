"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useConfig } from "../../../config/configContext.js";
import { useCartContext } from "../../../context/CartContext.js";
import { useStayContext } from "../../../context/StayContext.js";
import { useSearchContext } from "../../../context/SearchContext.js";
import { useBookingEngineAuth } from "../../../context/AuthContext.js";
import {
  generateReservationId,
  postPaymentRequest,
  redirectToPayment,
  postUserEnrollment,
} from "../../../api/payment.js";
import { computeStayTotals, getRoomNightlyBreakdown } from "../../../utils/ratePricing.js";
import { getOrCreateSessionId } from "../../../utils/session.js";
import { postBookingWidged } from "../../../api/tracking.js";
import "./DetailStep.css";

const TITLE_OPTIONS = ["Mr", "Mrs", "Ms", "Dr"];
const COUNTRY_CODES = ["+91", "+1", "+44", "+971", "+65"];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="var(--be-color-primary, #846836)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="var(--be-color-primary, #846836)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="var(--be-color-primary, #846836)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

const errorStyle = {
  color: "#ea4335",
  fontSize: "0.72rem",
  // Line-height was inheriting the page's larger base value (often ~1.5-1.8),
  // which pads a lot of empty leading above/below the glyphs on an already-
  // small 0.72rem line — reading as a big gap around the error text even
  // though margin/gap here are both small. Pinning it tight removes that.
  lineHeight: "1.25",
  marginTop: "2px",
  marginBottom: "0",
  display: "block",
  width: "100%",
  textAlign: "left",
};

/**
 * Guest contact-details form — the wizard's single guest-details+payment
 * step. Visual spec ported 1:1 from bawa-hotels-next (placeholder-only
 * fields, no visible <label>s except on the privacy checkbox); validation
 * wiring ported from Amritara's DetailStep.js `validateForm`/
 * `handleChange`/`handlePhoneBlur`.
 *
 * The submit flow (reservation id -> build STAAH reservation payload ->
 * postPaymentRequest -> redirectToPayment) is ported from Amritara's real
 * DetailStep.js `handleSubmit`/`handleJson` (~1333-1421, ~890-951) — and
 * deliberately does NOT collect card-number/expiry/CVV in-app. The real
 * app's primary "Confirm & Pay" flow never has card fields on its form
 * either (only `formData.title/firstName/.../specialRequests`); its
 * `paymentcarddetail` block reads from `formData?.cardholderName` etc,
 * which is always undefined on this path (card fields only exist in a
 * separate PayLater modal), so real Amritara submits it essentially empty
 * and lets STAAH's hosted payment page collect the real card details after
 * the redirect below. This package previously invented a bawa-style card
 * mockup as a separate step 3 — that was a deviation, removed here to match
 * the real, working production flow exactly.
 */
export function GuestDetailsForm({ onComplete }) {
  const config = useConfig();
  const {
    userDetails,
    updateUserDetails,
    selectedAddOns,
    addonAmountTotal,
    addonTaxTotal,
    promoCodeContext,
  } = useCartContext();
  const stay = useStayContext();
  const { selectedRoom } = stay;
  const search = useSearchContext();
  const {
    selectedPropertyId,
    selectedPropertyName,
    selectedPropertyPhone,
    selectedStartDate,
    selectedEndDate,
    searchRooms,
    keyData,
    isDayUse,
    dayUseArrivalTime,
    setDayUseArrivalTime,
  } = search;
  const { user } = useBookingEngineAuth();
  const [isDayUseTimePickerOpen, setIsDayUseTimePickerOpen] = useState(false);

  // Auto-close if the guest switches back to Overnight Stay mid-form (e.g.
  // via the compact recap bar above this step) — mirrors DetailStep.js's
  // own `useEffect(() => { if (!isDayUseEnabled) setIsTimePickerOpen(false) },
  // [isDayUseEnabled])`.
  useEffect(() => {
    if (!isDayUse) setIsDayUseTimePickerOpen(false);
  }, [isDayUse]);

  // 13 hourly slots, 10 AM through 10 PM — same range as Filterbar.js's
  // reference implementation.
  const dayUseTimeOptions = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const hour = i + 10;
        const hour12 = ((hour + 11) % 12) + 1;
        const period = hour < 12 ? "AM" : "PM";
        return `${String(hour12).padStart(2, "0")}:00 ${period}`;
      }),
    [],
  );

  // "hh:mm AM/PM" -> 24h "HH:mm" for the reservation payload's arrival_time.
  const to24HourTime = (time12h) => {
    if (!time12h) return "00:00";
    const match = String(time12h).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return "00:00";
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();
    if (period === "AM" && hours === 12) hours = 0;
    if (period === "PM" && hours !== 12) hours += 12;
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  };

  const [formData, setFormData] = useState({
    title: userDetails?.title || "",
    firstName: userDetails?.firstName || user?.FirstName || "",
    lastName: userDetails?.lastName || user?.LastName || "",
    email: userDetails?.email || user?.EmailId || "",
    countryCode: userDetails?.countryCode || user?.MobilePrifix || "+91",
    phone: userDetails?.phone || user?.MobileNo || "",
    gstNumber: userDetails?.gstNumber || "",
    specialRequests: userDetails?.specialRequests || "",
    agreeToTerms: userDetails?.agreeToTerms || false,
    // Identifies a returning/enrolled loyalty guest, captured off the
    // phone-lookup autofill response below and forwarded into the payment
    // payload's CtaCustomerId/cust_address (DetailStep.js:1255,1266,1278) —
    // previously never captured at all, silently breaking loyalty-guest
    // attribution on every booking.
    customerGuid: userDetails?.customerGuid || "",
  });
  const [errors, setErrors] = useState({});
  const [isLookingUpPhone, setIsLookingUpPhone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fixes the "stuck on Processing your secure payment... forever after
  // returning from the gateway" bug. Root cause: paymentHash.js's
  // redirectToPayment does `window.history.replaceState({}, "", "/?pay-now")`
  // immediately before submitting the hidden form that navigates the
  // browser away to STAAH's hosted payment page — right as/after
  // `setIsProcessing(true)` fires below. If the guest later lands back on
  // this tab via the browser's bfcache (e.g. STAAH's own return flow uses
  // history navigation rather than a fresh redirect, or the guest hits
  // Back), the browser restores the EXACT frozen page from the instant
  // before that form submitted — including isProcessing still `true` — and
  // since nothing re-runs to advance it, the overlay never goes away.
  // `pageshow`'s `event.persisted` flag is the standard way to detect
  // exactly this bfcache restoration; resetting isProcessing here lets the
  // guest see the form again (and retry) instead of a permanently stuck
  // spinner.
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) {
        setIsProcessing(false);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Prefill from a logged-in loyalty member the moment auth resolves, without
  // clobbering anything the guest has already typed.
  useEffect(() => {
    if (!user) return;
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || user?.FirstName || "",
      lastName: prev.lastName || user?.LastName || "",
      email: prev.email || user?.EmailId || "",
      phone: prev.phone || user?.MobileNo || "",
      countryCode: prev.countryCode || user?.MobilePrifix || "+91",
    }));
  }, [user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "phone") {
      // Strip anything non-digit and cap at 10 as the guest types, rather
      // than only rejecting an invalid value at submit time — real
      // Amritara's own phone field never restricts keystrokes at all (just
      // an HTML maxLength, which still lets non-digits through), which is
      // exactly the gap being fixed here.
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, phone: digitsOnly }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Returning-guest CRM lookup by phone (non-fatal — a convenience autofill,
  // never blocks the form). Mirrors Amritara's getUserEnrollment/handlePhoneBlur.
  const handlePhoneBlur = async () => {
    if (!formData.phone || formData.phone.trim().length < 7) return;
    setIsLookingUpPhone(true);
    try {
      const keyData =
        search.keyData ||
        (config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "");
      const roomNames = (stay.selectedRoom || [])
        .map((r) => r?.roomName)
        .filter(Boolean)
        .join(", ");
      const packageNames = (stay.selectedRoom || [])
        .map((r) => r?.roomPackage)
        .filter(Boolean)
        .join(", ");
      const result = await postUserEnrollment(config, {
        payload: {
          MobileNo: formData.phone,
          PropertyId: search.selectedPropertyId?.toString(),
          Room: roomNames,
          Package: packageNames,
        },
        keyData,
      });
      const row = result?.result?.[0];
      if (row) {
        setFormData((prev) => ({
          ...prev,
          title: row?.memberTitle || prev.title,
          firstName: row?.firstName || prev.firstName,
          lastName: row?.lastName || prev.lastName,
          email: row?.email || prev.email,
          customerGuid: row?.guid || prev.customerGuid,
        }));
      }
    } catch {
      // Swallowed on purpose: a failed lookup should never block checkout.
    } finally {
      setIsLookingUpPhone(false);
    }
  };

  const validate = () => {
    const next = {};
    if (!formData.title) next.title = "Please select a title.";
    if (!formData.firstName.trim())
      next.firstName = "Please enter your first name.";
    else if (!/^[a-zA-Z\s]+$/.test(formData.firstName))
      next.firstName = "First name can only contain letters and spaces.";
    if (!formData.lastName.trim())
      next.lastName = "Please enter your last name.";
    else if (!/^[a-zA-Z\s]+$/.test(formData.lastName))
      next.lastName = "Last name can only contain letters and spaces.";
    if (!formData.email.trim()) next.email = "Please enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      next.email = "Please enter a valid email address.";
    if (!formData.phone.trim()) next.phone = "Please enter your phone number.";
    else if (!/^\d{10}$/.test(formData.phone.trim()))
      next.phone = "Please enter a valid 10-digit phone number.";
    if (!formData.agreeToTerms)
      next.agreeToTerms = "You must agree to the privacy policy.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Ported from real Amritara's DetailStep.js `proceedToPay` (~297-372) —
  // the same guest/adult/children-limit checks CartOverview.jsx's cart
  // rows already display inline as red warnings (see that file), but
  // enforced here too so an over-limit selection can't actually reach
  // payment just because the guest didn't notice the warning. Also blocks
  // on a room genuinely out of stock (roomRateWithTax <= 0) or over-booked
  // relative to minInventory (two rooms slots picking the same room when
  // only one is left). Returns "success" or the exact error string real
  // Amritara shows via toast for that failure — same wording, so an
  // integration relying on that text (analytics, support scripts) isn't
  // affected by this being a different codebase underneath.
  const proceedToPay = (rooms) => {
    const isSelected = (rooms || []).every((room) => room?.roomId);
    if (!isSelected) {
      toast.error("Select your room(s)");
      return "Select your room(s)";
    }

    const isInStock = (rooms || []).every(
      (room) => Number(room?.roomRateWithTax) > 0,
    );
    if (!isInStock) {
      toast.error("One or more room(s) are out of stock.");
      return "One or more room(s) are out of stock.";
    }

    const isGuestLimitExceeded = (rooms || []).some(
      (room) => (room.adults || 0) + (room.children || 0) > room.maxGuest,
    );
    if (isGuestLimitExceeded) {
      toast.error(
        "Selected guests are greater than the max guest allowed in one or more rooms",
      );
      return "Selected guests are greater than the max guest allowed in one or more rooms";
    }

    const isAdultLimitExceeded = (rooms || []).some(
      (room) => room.adults > room.maxAdult,
    );
    if (isAdultLimitExceeded) {
      toast.error(
        "Selected adults are greater than the max adults allowed in one or more rooms",
      );
      return "Selected adults are greater than the max adults allowed in one or more rooms";
    }

    const isChildLimitExceeded = (rooms || []).some(
      (room) => room.children > room.maxChildren,
    );
    if (isChildLimitExceeded) {
      toast.error(
        "Selected children are greater than the max children allowed in one or more rooms",
      );
      return "Selected children are greater than the max children allowed in one or more rooms";
    }

    const roomCountMap = (rooms || []).reduce((acc, room) => {
      if (!acc[room.roomId])
        acc[room.roomId] = {
          count: 0,
          roomName: room.roomName,
          minInventory: room.minInventory,
        };
      acc[room.roomId].count += 1;
      return acc;
    }, {});
    const exceededRoomId = Object.keys(roomCountMap).find(
      (roomId) =>
        roomCountMap[roomId].count > roomCountMap[roomId].minInventory,
    );
    if (exceededRoomId) {
      const { roomName, minInventory } = roomCountMap[exceededRoomId];
      const message = `inventory exceeded for "${roomName}". Available: ${minInventory}`;
      toast.error(message);
      return message;
    }

    return "success";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("[PAYMENT-FLOW] DetailStep.jsx: handleSubmit (Pay Now clicked)", { selectedPropertyId });
    if (proceedToPay(selectedRoom) !== "success") {
      console.log("[PAYMENT-FLOW] DetailStep.jsx: BLOCKED — proceedToPay check failed (room/guest mismatch)");
      return;
    }
    if (!validate()) {
      console.log("[PAYMENT-FLOW] DetailStep.jsx: BLOCKED — form validation failed", { errors });
      return;
    }
    updateUserDetails({ ...formData });

    setIsProcessing(true);
    try {
      const reservationResp = await generateReservationId(
        config,
        selectedPropertyId,
      );
      const reservationId = reservationResp?.reservation_id;
      console.log("[PAYMENT-FLOW] DetailStep.jsx: generateReservationId result", { reservationResp, reservationId });
      if (!reservationId)
        throw new Error(
          "Could not generate a reservation ID. Please try again.",
        );

      // Ported from DetailStep.js:1389 — real's exact ctaName ("Pay Now
      // Click"), fired the moment a reservation id is successfully
      // generated (i.e. right before building/submitting the payment
      // request), not on the button click itself.
      // postBookingWidged(config, {
      //   ctaName: "Pay Now Click",
      //   propertyId: selectedPropertyId,
      //   customerGuid: formData.customerGuid,
      // });

      const numberOfDays = calculateNumberOfDays(
        selectedStartDate,
        selectedEndDate,
      );
      // computeStayTotals is the single source of truth for what's actually
      // charged — CartOverview.jsx's displayed total reads from the exact
      // same function, so what the guest sees and what gets submitted here
      // can never drift apart. See its doc comment (utils/ratePricing.js)
      // for why this isn't simply StayContext's totalPrice/totalTax (those
      // fields are never populated anywhere in this package).
      // Real Amritara's `totaltax` payload field is `taxSum(room) +
      // addonTaxTotal` (DetailStep.js ~907-909) — the combined tax portion
      // embedded in `totalamountaftertax`, even though addon tax is already
      // baked into addonAmount rather than added again on top of it. That's
      // exactly `gstTotal` here.
      const { gstTotal, grandTotal, roomSurcharges, nights } =
        computeStayTotals({
          selectedRoom,
          selectedStartDate,
          selectedEndDate,
          addonAmountTotal,
          addonTaxTotal,
        });
      const totalTaxAmount = gstTotal;
      const surchargeByRoomId = new Map(
        (roomSurcharges || []).map((s) => [s.roomId, s]),
      );

      // atob()-decode a real promo code; fall back to config.defaultMemberPromoCode
      // only for a member rate with no promo applied (mirrors Amritara's
      // handleJson, which hardcoded this fallback to its own property's
      // default code — that's property-specific business data, so it's a
      // config option here rather than a package constant).
      const promocode = promoCodeContext
        ? atob(promoCodeContext)
        : (selectedRoom || []).some((r) => r?.isMemberRate)
          ? config.defaultMemberPromoCode || ""
          : "";

      const dateRange = getDateRange(selectedStartDate, selectedEndDate);
      const mappedAddons = (selectedAddOns || []).map((addon) =>
        mapAddon(addon, numberOfDays),
      );

      // Shared by BookingDetailsJson and the be_bookingData fallback below —
      // both need the same room summary (including adults/children, so
      // ConfirmStep's receipt can show a real guest headcount instead of
      // omitting it, matching real ConfirmStep.js's totalAdults/
      // totalChildren reduce over BookingDetails.selectedRoom).
      const selectedRoomSummary = (selectedRoom || []).map((room, index) => {
        const searchRoom = (searchRooms || [])[index];
        return {
          roomName: room?.roomName,
          roomId: room?.roomId,
          roomImage: room?.roomImage || "no_image.jpg",
          roomPackage: room?.roomPackage,
          adults: searchRoom?.adults ?? room?.applicableAdult ?? 1,
          children: searchRoom?.children ?? room?.applicableChild ?? 0,
        };
      });

      const roomPayload = (selectedRoom || []).map((room, index) => {
        // selectedRoom entries don't carry their own adults/children (see
        // ratePricing.js's buildRoomSelection) — fall back to the matching
        // SearchContext search-room slot by position, then to the room's
        // applicable guest counts.
        const searchRoom = (searchRooms || [])[index];
        const adults = searchRoom?.adults ?? room?.applicableAdult ?? 1;
        const children = searchRoom?.children ?? room?.applicableChild ?? 0;
        const surcharge = surchargeByRoomId.get(room?.roomId) || {};
        const extraAdultCount =
          room?.maxAdult != null && adults > room.maxAdult
            ? adults - room.maxAdult
            : 0;

        // True per-night pricing for this room (see ratePricing.js's
        // getRoomNightlyBreakdown doc comment) — used below both for the
        // per-date `price[]` entries and for this room's whole-stay total,
        // instead of repeating one flat first-night rate across every date.
        const nightlyBreakdown = getRoomNightlyBreakdown(room, nights || 1);
        const nightByDateKey = new Map(
          nightlyBreakdown.nights
            .filter((n) => n.dateKey)
            .map((n) => [n.dateKey, n]),
        );

        // Real Amritara replaces the room's normal tax with the extra-child
        // recomputed GST when there's a qualifying extra child, rather than
        // adding both — see ratePricing.js's computeRoomSurcharge doc
        // comment for the exact source lines this mirrors.
        const standardTaxTotal = nightlyBreakdown.taxTotal;
        const roomTaxAmount =
          surcharge.extraChildren >= 1
            ? surcharge.extraChildTax
            : standardTaxTotal;

        // Add-ons aren't attached per-room in this package's cart model
        // (flat list, see the Addons comment below) — approximated onto the
        // first room's own total so the sum of every room's amountaftertax
        // still reconciles with the reservation-level total.
        const roomAddonAmount = index === 0 ? addonAmountTotal || 0 : 0;
        const roomTotal =
          nightlyBreakdown.baseTotal +
          (surcharge.extraChildRoomCharge || 0) +
          (surcharge.extraAdultCharge || 0) +
          roomTaxAmount +
          roomAddonAmount;

        return {
          room_id: room?.roomId?.toString() ?? "",
          room_name: room?.roomName ?? "",
          arrival_date: formatDateISO(selectedStartDate),
          departure_date: formatDateISO(selectedEndDate),
          arrival_time: isDayUse ? to24HourTime(dayUseArrivalTime) : "00:00",
          // Real Amritara's backend key is genuinely misspelled this way
          // (DetailStep.js:960) — matching it, not "correcting" it, since a
          // corrected spelling means the backend (which looks for the
          // literal misspelled key) silently drops this field.
          sepcial_request: formData.specialRequests || "",
          bedding: { BedId: "", BedType: "", Beds: "" },
          salutation: formData.title || "",
          first_name: formData.firstName || "",
          last_name: formData.lastName || "",
          price: dateRange.map((date, dateIndex) => {
            // Each date gets its OWN rate from the room's real per-date OBP
            // data — falls back to the room's representative
            // roomRateWithTax only if that specific date isn't found in
            // packageRateList (shouldn't normally happen for dates inside
            // the booked range).
            const nightEntry = nightByDateKey.get(date);
            const dateAmountAfterTax = nightEntry
              ? nightEntry.amount + nightEntry.tax
              : Number(room?.roomRateWithTax) || 0;
            return {
              date,
              rate_id: room?.rateId,
              rate_name: room?.roomPackage,
              amountaftertax: Math.round(dateAmountAfterTax || 0).toString(),
              extraGuests: {
                extraAdult: String(extraAdultCount),
                extraChild: String(surcharge.extraChildren || 0),
                extraAdultRate: surcharge.extraAdultCharge
                  ? String(Math.round(surcharge.extraAdultCharge))
                  : "0",
                extraChildRate: surcharge.extraChildRoomCharge
                  ? String(Math.round(surcharge.extraChildRoomCharge))
                  : "0",
              },
              fees: [],
              // CartContext's add-ons aren't associated per-room (flat list), so
              // the full set is attached once, on the first room's first date,
              // to avoid duplicate-billing the same add-on across every room/date.
              Addons: index === 0 && dateIndex === 0 ? mappedAddons : [],
            };
          }),
          // Per-date tax detail isn't tracked by name in this package (only
          // an aggregate amount per room) — one GST-labelled entry is a
          // reasonable single-line approximation of real Amritara's named
          // tax breakdown here (DetailStep.js:1094-1123).
          taxes:
            roomTaxAmount > 0
              ? [{ name: "GST", value: String(Math.round(roomTaxAmount)) }]
              : [],
          amountaftertax: roomTotal.toFixed(2),
          remarks: "No Smoking",
          GuestCount: [
            { AgeQualifyingCode: "10", Count: String(adults) },
            { AgeQualifyingCode: "8", Count: String(children) },
          ],
        };
      });

      const payload = {
        PropertyId: selectedPropertyId?.toString(),
        reservations: {
          reservation: [
            {
              reservation_datetime: new Date().toISOString().split("T")[0],
              reservation_id: reservationId,
              // Signals the backend this is a Day Use (same-day, hourly)
              // booking rather than an overnight stay — the arrival_time
              // above (set on each room, not here) is meaningless without
              // this flag telling the backend to actually treat it as one.
              DayuseBooking: isDayUse ? true : false,
              commissionamount: "0.00",
              // Real Amritara sends these two raw/unrounded (DetailStep.js:
              // 905-906) — only totaltax below is rounded there. Rounding
              // every monetary field the same way is a small but real
              // discrepancy against what real Amritara actually submits.
              deposit: grandTotal.toString(),
              totalamountaftertax: grandTotal.toString(),
              totaltax: Math.round(totalTaxAmount).toString(),
              promocode,
              payment_required: "0",
              payment_type: "Channel Collect",
              currencycode: "INR",
              status: "Confirm",
              is_subscribed: false,
              customer: {
                email: formData.email || "",
                salutation: formData.title || "",
                first_name: formData.firstName || "",
                last_name: formData.lastName || "",
                remarks: formData.specialRequests || "",
                telephone: formData.phone || "",
              },
              // Plain JSON, sent essentially empty — matches real Amritara's
              // primary "Confirm & Pay" flow exactly (see this component's
              // doc comment above): no card fields are collected in-app.
              paymentcarddetail: {
                CardHolderName: "",
                CardType: "",
                ExpireDate: "",
                CardNumber: "",
                cvv: "",
                PaymentRefenceId: Math.floor(
                  Math.random() * 1000000000,
                ).toString(),
              },
              room: roomPayload,
            },
          ],
        },
      };

      // The real /api/th-payment-request endpoint does NOT accept `payload`
      // (the reservations.reservation[] object above) as its body — it wants
      // a flatter summary wrapper, with `payload` embedded as one stringified
      // field (ReservationJson). Ported from DetailStep.js ~1259-1281.
      // SessionId/Ip are a best-effort approximation: this package doesn't
      // carry the same session/IP tracking utilities the legacy app has
      // (userInfo.js/userSessionId.js weren't ported), so those are
      // simplified rather than 1:1. CtaCustomerId/cust_address ARE real
      // (sourced from formData.customerGuid, captured off the phone-lookup
      // autofill below), matching DetailStep.js:1255,1266,1278 exactly.
      const finalKeyData =
        keyData || (config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "");
      const bookingSessionId = getOrCreateSessionId();

      const finalRequestData2 = {
        property_id: selectedPropertyId?.toString(),
        property_name: selectedPropertyName,
        property_tel: selectedPropertyPhone,
        cust_name:
          `${formData.firstName || ""} ${formData.lastName || ""}`.trim(),
        cust_email: formData.email || "",
        cust_phone: formData.phone || "",
        // Real Amritara genuinely puts the loyalty customerGuid here when
        // one exists (DetailStep.js:1266) rather than a real address —
        // matching that, not "fixing" it. Its separate redirect-paramvalues
        // block below (DetailStep.js:1401) hardcodes "N/A" regardless, so
        // that one is intentionally left as-is.
        cust_address: formData.customerGuid || "N/A",
        cust_city: "N/A",
        cust_state: "N/A",
        cust_country: "N/A",
        cust_postalcode: "N/A",
        reservation_id: reservationId,
        amount: Math.round(grandTotal),
        currency: "INR",
        // Key names here (formData, selectedAddonList, property.Address,
        // cancellationPolicyState) match real ConfirmStep.js's receipt
        // field access exactly (~589-741) — if STAAH/the CMS echoes this
        // object back unchanged via /api/payment/confirm's
        // bookingDetailsJson, the confirmed receipt can read it directly
        // without a shape mismatch.
        BookingDetailsJson: JSON.stringify({
          formData,
          totalPrice: grandTotal,
          selectedRoom: selectedRoomSummary,
          selectedAddonList: mappedAddons,
          selectedStartDate,
          selectedEndDate,
          promoCode: promoCodeContext,
          sessionId: bookingSessionId,
          property: {
            PropertyName: selectedPropertyName,
            Address: { Phone: selectedPropertyPhone },
          },
          cancellationPolicyState: stay.cancellationPolicyState || "",
        }),
        ReservationJson: JSON.stringify(payload),
        SessionId: bookingSessionId,
        Ip: "",
        CtaCustomerId: formData.customerGuid || "",
        Room: (selectedRoom || []).map((room) => room?.roomName).join(", "),
        Package: (selectedRoom || [])
          .map((room) => room?.roomPackage)
          .join(", "),
      };

      console.log("[PAYMENT-FLOW] DetailStep.jsx: calling postPaymentRequest (/api/th-payment-request)", { reservationId, amount: finalRequestData2.amount });
      const paymentResp = await postPaymentRequest(config, {
        finalRequestData2,
        reservationPayload: payload,
        keyData: finalKeyData,
      });
      console.log("[PAYMENT-FLOW] DetailStep.jsx: postPaymentRequest result", { paymentResp });
      // Ported from DetailStep.js's th-payment-request success/failure
      // beacons (~505-506,579-580 pattern — ApiName "reservation post" on
      // this call, ApiErrorCode "1166" on any non-success result).
      // postBookingWidged(config, {
      //   ctaName: "Reservation post",
      //   propertyId: selectedPropertyId,
      //   apiName: "reservation post",
      //   apiUrl: `${config?.staahBaseUrl || ""}/api/th-payment-request`,
      //   apiStatus: paymentResp?.errorMessage === "success" ? "0" : "1",
      //   apiErrorCode: paymentResp?.errorMessage === "success" ? "0" : "1166",
      //   apiMessage:
      //     paymentResp?.errorMessage === "success"
      //       ? "Success"
      //       : paymentResp?.errorMessage || "Payment failed",
      // });
      if (paymentResp?.errorMessage !== "success") {
        throw new Error(
          paymentResp?.errorMessage ||
            "Payment request failed. Please try again.",
        );
      }

      // Same shape as BookingDetailsJson above on purpose — this is the
      // pre-confirm fallback ConfirmStep.jsx reads if /api/payment/confirm
      // hasn't returned (or doesn't echo bookingDetailsJson back) yet; using
      // one consistent shape for both means the receipt doesn't need two
      // separate field-mapping code paths. (This used to be a different,
      // flatter shape — propertyName/checkin/checkout/guestName/totalAmount
      // — that ConfirmStep.jsx's reader never actually matched, so every
      // field on the receipt silently rendered as "—" regardless of confirm
      // API status.)
      sessionStorage.setItem(
        "be_bookingData",
        JSON.stringify({
          formData,
          totalPrice: grandTotal,
          selectedRoom: selectedRoomSummary,
          selectedAddonList: mappedAddons,
          selectedStartDate,
          selectedEndDate,
          promoCode: promoCodeContext,
          reservationId,
          property: {
            PropertyName: selectedPropertyName,
            Address: { Phone: selectedPropertyPhone },
          },
          cancellationPolicyState: stay.cancellationPolicyState || "",
        }),
      );

      const resolvedKeyData =
        keyData || (config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "");
      const paramvalues = JSON.stringify({
        property_id: selectedPropertyId,
        property_name: selectedPropertyName,
        property_tel: selectedPropertyPhone,
        cust_name:
          `${formData.firstName || ""} ${formData.lastName || ""}`.trim(),
        cust_email: formData.email || "",
        cust_phone: formData.phone || "",
        cust_address: "N/A",
        cust_city: "N/A",
        cust_state: "N/A",
        cust_country: "N/A",
        cust_postalcode: "N/A",
        reservation_id: reservationId,
        amount: grandTotal,
        keyData: resolvedKeyData,
      });

      onComplete?.();
      console.log("[PAYMENT-FLOW] DetailStep.jsx: redirecting browser to STAAH hosted payment page NOW", { reservationId, staahBaseUrl: config?.staahBaseUrl, paramvalues });
      // Navigates away from the app (STAAH hosted payment page) — call last.
      redirectToPayment(config, paramvalues, resolvedKeyData);
    } catch (err) {
      console.error("[PAYMENT-FLOW] DetailStep.jsx: handleSubmit FAILED before reaching payment gateway", err);
      setIsProcessing(false);
      toast.error(err?.message || "Payment failed. Please try again.");
      // postBookingWidged(config, {
      //   ctaName: err?.message || "Payment failed",
      //   propertyId: selectedPropertyId,
      //   apiErrorCode: "1166",
      //   apiMessage: err?.message || "Payment failed",
      // });
    }
  };

  return (
    <div className="be-guest-details-step">
      <h3
        style={{
          fontSize: "0.85rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--be-color-primary, #846836)",
          margin: "0 0 0.6rem",
          fontFamily: "var(--be-font-sans)",
        }}
      >
        Guest Profile Details
      </h3>

      <form
        id="be-guest-details-form"
        className="be-form-card"
        onSubmit={handleSubmit}
        noValidate
      >
        <h4
          style={{
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 0.7rem",
            textTransform: "uppercase",
            fontFamily: "var(--be-font-sans)"
          }}
        >
          Guest Contact Details
        </h4>

        <div className="be-form-grid">
          <div className="be-detail-form-group" style={{ minWidth: 0 }}>
            {/* Explicit grid tracks (not flex) so the phone input's own
                intrinsic min-content width can never force this row wider
                than its container — a flex item's default min-width:auto
                does exactly that (it refuses to shrink below its content's
                natural size), which is what was pushing the input out past
                the card's right edge on narrow phones. minmax(0, 1fr) is
                the grid equivalent of min-width:0: it lets the second track
                actually shrink to fit instead of sizing off its content. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "82px minmax(0, 1fr)",
                gap: "6px",
                width: "100%",
              }}
            >
              <select
                name="countryCode"
                value={formData.countryCode}
                onChange={handleChange}
                style={{ width: "100%", minWidth: 0 }}
                aria-label="Country code"
              >
                {COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number*"
                value={formData.phone}
                onChange={handleChange}
                onBlur={handlePhoneBlur}
                disabled={isLookingUpPhone}
                inputMode="numeric"
                maxLength={10}
                style={{ width: "100%", minWidth: 0 }}
              />
            </div>
            {errors.phone && <span style={errorStyle}>{errors.phone}</span>}
          </div>

          <div className="be-detail-form-group">
            <input
              type="email"
              name="email"
              placeholder="Email Address*"
              value={formData.email}
              onChange={handleChange}
            />
            {errors.email && <span style={errorStyle}>{errors.email}</span>}
          </div>

          <div className="be-detail-form-group">
            <select
              name="title"
              value={formData.title}
              onChange={handleChange}
              aria-label="Title"
            >
              <option value="">Title</option>
              {TITLE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errors.title && <span style={errorStyle}>{errors.title}</span>}
          </div>

          <div className="be-detail-form-group">
            <input
              type="text"
              name="firstName"
              placeholder="First Name*"
              value={formData.firstName}
              onChange={handleChange}
            />
            {errors.firstName && (
              <span style={errorStyle}>{errors.firstName}</span>
            )}
          </div>

          <div className="be-detail-form-group">
            <input
              type="text"
              name="lastName"
              placeholder="Last Name*"
              value={formData.lastName}
              onChange={handleChange}
            />
            {errors.lastName && (
              <span style={errorStyle}>{errors.lastName}</span>
            )}
          </div>

          <div className="be-detail-form-group">
            <input
              type="text"
              name="gstNumber"
              placeholder="GST Number (optional)"
              value={formData.gstNumber}
              onChange={handleChange}
            />
          </div>

          {isDayUse && (
            <div className="be-detail-form-group be-full-width">
              <label>Expected Arrival Time</label>
              <button
                type="button"
                className="be-dayuse-time-trigger"
                onClick={() => setIsDayUseTimePickerOpen(true)}
              >
                <span className="be-dayuse-time-value">
                  {dayUseArrivalTime || "12:00 PM"}
                </span>
                <span className="be-dayuse-time-caret">⌄</span>
              </button>
            </div>
          )}

          <div className="be-detail-form-group be-full-width">
            <textarea
              name="specialRequests"
              placeholder="Special Requests (optional)"
              rows={2}
              value={formData.specialRequests}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="be-privacy-row">
          <input
            id="be-agree-terms"
            type="checkbox"
            name="agreeToTerms"
            className="be-privacy-checkbox"
            checked={formData.agreeToTerms}
            onChange={handleChange}
          />
          <label
            htmlFor="be-agree-terms"
            style={{ fontSize: "0.82rem", color: "#666", cursor: "pointer" }}
          >
            I agree to the{" "}
            <a href="/privacy-policy" target="_blank" rel="noreferrer">
              privacy policy
            </a>
          </label>
        </div>
        {errors.agreeToTerms && (
          <span style={{ ...errorStyle, display: "block" }}>
            {errors.agreeToTerms}
          </span>
        )}

        <div className="be-trust-badges-row">
          <div className="be-trust-badge-item">
            <CheckIcon /> Best Price Guaranteed
          </div>
          <div className="be-trust-badge-item">
            <ShieldIcon /> 100% Secure Payment
          </div>
          <div className="be-trust-badge-item">
            <BoltIcon /> Instant Confirmation
          </div>
        </div>

        {/* No inline submit button here on purpose — the real submit action
            is the cart sidebar's "Pay & Confirm Booking" button
            (CartOverview.jsx), wired to this form via the `form` attribute
            so it works from outside the form element. */}
      </form>

      {/* Portaled to document.body rather than rendered inline: this form
          lives inside Wizard.jsx's `.be-cart-left-col`, which is
          `position: sticky; overflow-y: auto` (its own independently-
          scrolling pane — see Wizard.css's doc comment). That combination
          clips a nested `position: fixed` descendant to `.be-cart-left-col`'s
          own bounds instead of the full viewport, which is exactly why this
          overlay used to only dim the guest-details column while the step
          indicator above it and the cart summary sidebar beside it stayed
          fully visible on top. Same fix already applied to shared/Modal.jsx
          for the identical reason — matched here rather than re-discovering
          it differently. */}
      {isProcessing &&
        mounted &&
        createPortal(
          <div className="be-processing-overlay">
            <div className="be-loading-dial" />
            <p>Processing your secure payment...</p>
          </div>,
          document.body,
        )}

      {isDayUse &&
        isDayUseTimePickerOpen &&
        mounted &&
        createPortal(
          <div
            className="be-dayuse-time-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsDayUseTimePickerOpen(false);
            }}
          >
            <div
              className="be-dayuse-time-sheet"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="be-dayuse-time-sheet-head">
                <span className="be-dayuse-time-sheet-title">Select arrival time</span>
                <button
                  type="button"
                  className="be-dayuse-time-close"
                  onClick={() => setIsDayUseTimePickerOpen(false)}
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="be-dayuse-time-grid">
                {dayUseTimeOptions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`be-dayuse-time-option ${t === dayUseArrivalTime ? "be-dayuse-time-option--active" : ""}`}
                    onClick={() => {
                      setDayUseArrivalTime(t);
                      setIsDayUseTimePickerOpen(false);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function formatDateISO(date) {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

/** Every calendar date of the stay (mirrors Amritara's getDateRange). */
function getDateRange(startDate, endDate) {
  if (!startDate || !endDate)
    return startDate ? [formatDateISO(startDate)] : [];
  const dates = [];
  let current = new Date(startDate);
  const last = new Date(endDate);
  while (current < last) {
    dates.push(new Date(current).toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates.length ? dates : [formatDateISO(startDate)];
}

function calculateNumberOfDays(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const diff = Math.abs(new Date(endDate) - new Date(startDate));
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) || 1;
}

/** Pull `.INR[field]` out of a Rate/AdultRate/ChildRate array entry (same shape AddOnsStep.jsx reads). */
function extractRateField(rateArray, field) {
  if (!rateArray || rateArray.length === 0) return null;
  const inr = rateArray.find((r) => r?.INR)?.INR;
  return inr && inr[field] != null ? Number(inr[field]) : null;
}

function getAddonUnitAmount(addon) {
  return (
    extractRateField(addon?.Rate, "amountAfterTax") ??
    extractRateField(addon?.AdultRate, "amountAfterTax") ??
    extractRateField(addon?.ChildRate, "amountAfterTax") ??
    0
  );
}

/**
 * Reservation-payload line item for one selected add-on. CartContext's
 * `selectedAddOns` is a flat (non-per-room) list — see AddOnsStep.jsx's own
 * comment — so `quantity` already bakes in guest count for per-guest addons;
 * this is an approximation of AddOnsStep's adult/child-split total, not a
 * byte-exact reproduction (that split isn't recoverable from the flat list
 * alone). Good enough for the reservation line item; the authoritative total
 * booked is `addonAmountTotal`/`addonTaxTotal` from CartContext, used above
 * in the reservation-level deposit/totaltax fields.
 */
function mapAddon(addon, numberOfDays) {
  const unit = getAddonUnitAmount(addon);
  const quantity = addon?.quantity || 1;
  const nights = addon?.Type === "R" ? numberOfDays : 1;
  const amount = unit * quantity * nights;
  return {
    AddonId: addon?.AddonId ?? "",
    AddonName: addon?.AddonName ?? "",
    AddonType: addon?.Type ?? "",
    PriceType: addon?.Applicable ?? "",
    AmountAfterTax: amount.toFixed(2),
  };
}

export const DetailStep = {
  GuestDetailsForm,
};
