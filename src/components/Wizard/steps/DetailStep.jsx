"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast, { Toaster } from "react-hot-toast";
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
  lineHeight: "1.25",
  marginTop: "2px",
  marginBottom: "0",
  display: "block",
  width: "100%",
  textAlign: "left",
};

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
    selectedPropertyEmail,
    selectedPropertyAddress,
    selectedPropertyCity,
    selectedPropertyState,
    selectedPropertyPostalCode,
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
    customerGuid: userDetails?.customerGuid || "",
  });
  const [errors, setErrors] = useState({});
  const [isLookingUpPhone, setIsLookingUpPhone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) {
        setIsProcessing(false);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (name === "phone") {
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

  // Most "Book Now" entry points across a consumer site (mega menu, hotel
  // cards, offers, ...) land here via a direct URL carrying propertyId/
  // propertyName only — SearchContext's phone/email/address fields are
  // only ever populated by SearchBar.jsx's own handleSelectProperty (the
  // Location dropdown), which never runs for that far more common direct-
  // link path. config.properties (the same list SearchBar's dropdown is
  // built from) already carries phone/email/addressLine per property, so
  // it's a reliable fallback lookup here regardless of which way this
  // property actually got selected.
  const resolvedProperty = (config.properties || []).find(
    (p) =>
      String(p.staahPropertyId) === String(selectedPropertyId) ||
      String(p.propertyId) === String(selectedPropertyId),
  );
  console.log("resolvedProperty",resolvedProperty)
  const resolvedPropertyPhone =
    selectedPropertyPhone ?? resolvedProperty?.phone ?? null;
  const resolvedPropertyEmail =
    selectedPropertyEmail ?? resolvedProperty?.email ?? null;
  const resolvedPropertyAddress =
    selectedPropertyAddress ?? resolvedProperty?.addressLine ?? null;
  const resolvedPropertyCity =
    selectedPropertyCity ?? resolvedProperty?.city ?? null;
  const resolvedPropertyState =
    selectedPropertyState ?? resolvedProperty?.state ?? null;
  const resolvedPropertyPostalCode =
    selectedPropertyPostalCode ?? resolvedProperty?.postalCode ?? null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formOfPayment =
      e.nativeEvent?.submitter?.value === "pay_later"
        ? "pay_later"
        : "pay_now";
    console.log(
      `[PAYMENT-FLOW] DetailStep.jsx: handleSubmit (${formOfPayment === "pay_later" ? "Pay Later" : "Pay Now"} clicked)`,
      { selectedPropertyId },
    );
    if (proceedToPay(selectedRoom) !== "success") {
      console.log("[PAYMENT-FLOW] DetailStep.jsx: BLOCKED — proceedToPay check failed (room/guest mismatch)");
      return;
    }
    if (!validate()) {
      console.log("[PAYMENT-FLOW] DetailStep.jsx: BLOCKED — form validation failed", { errors });
      const formEl = document.getElementById("be-guest-details-form");
      if (formEl) {
        const header = document.querySelector(".main-header");
        const headerOffset = header
          ? header.getBoundingClientRect().height
          : 0;
        const top =
          formEl.getBoundingClientRect().top +
          window.scrollY -
          headerOffset -
          16;
        window.scrollTo({ top, behavior: "smooth" });
      }
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

      const numberOfDays = calculateNumberOfDays(
        selectedStartDate,
        selectedEndDate,
      );

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

      const promocode = promoCodeContext
        ? atob(promoCodeContext)
        : (selectedRoom || []).some((r) => r?.isMemberRate)
          ? config.defaultMemberPromoCode || ""
          : "";

      const dateRange = getDateRange(selectedStartDate, selectedEndDate);
      const mappedAddons = (selectedAddOns || []).map((addon) =>
        mapAddon(addon, numberOfDays),
      );

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
        const searchRoom = (searchRooms || [])[index];
        const adults = searchRoom?.adults ?? room?.applicableAdult ?? 1;
        const children = searchRoom?.children ?? room?.applicableChild ?? 0;
        const surcharge = surchargeByRoomId.get(room?.roomId) || {};
        const extraAdultCount =
          room?.maxAdult != null && adults > room.maxAdult
            ? adults - room.maxAdult
            : 0;

        const nightlyBreakdown = getRoomNightlyBreakdown(room, nights || 1);
        const nightByDateKey = new Map(
          nightlyBreakdown.nights
            .filter((n) => n.dateKey)
            .map((n) => [n.dateKey, n]),
        );

        const standardTaxTotal = nightlyBreakdown.taxTotal;
        const roomTaxAmount =
          surcharge.extraChildren >= 1
            ? surcharge.extraChildTax
            : standardTaxTotal;

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
          sepcial_request: formData.specialRequests || "",
          bedding: { BedId: "", BedType: "", Beds: "" },
          salutation: formData.title || "",
          first_name: formData.firstName || "",
          last_name: formData.lastName || "",
          price: dateRange.map((date, dateIndex) => {
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
              Addons: index === 0 && dateIndex === 0 ? mappedAddons : [],
            };
          }),
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
              DayuseBooking: isDayUse ? true : false,
              commissionamount: "0.00",
              deposit: formOfPayment === "pay_later"? "0" : grandTotal.toString(),
              totalamountaftertax: grandTotal.toString(),
              totaltax: Math.round(totalTaxAmount).toString(),
              promocode,
              payment_required: formOfPayment === "pay_later"? grandTotal.toString() : "0" ,
              payment_type: formOfPayment === "pay_later"? "Hotel Collect":"Channel Collect",
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

      const finalKeyData =
        keyData || (config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "");
      const bookingSessionId = getOrCreateSessionId();

      const finalRequestData2 = {
        property_id: selectedPropertyId?.toString(),
        property_name: selectedPropertyName,
        property_tel: resolvedPropertyPhone,
        cust_name:
          `${formData.firstName || ""} ${formData.lastName || ""}`.trim(),
        cust_email: formData.email || "",
        cust_phone: formData.phone || "",
        cust_address: formData.customerGuid || "N/A",
        cust_city: "N/A",
        cust_state: "N/A",
        cust_country: "N/A",
        cust_postalcode: "N/A",
        reservation_id: reservationId,
        amount: Math.round(grandTotal),
        currency: "INR",
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
            Address: {
              // Matches real Amritara's own Address shape exactly (Location/
              // AddressLine/City/State/Country/CountryCode/Email/Phone/
              // PostalCode — see property?.Address in its DetailStep.js).
              // City/State/PostalCode are recovered from this consumer's
              // own single combined address string (properties.js's
              // parseIndianAddress — verified against its real live CMS
              // response, every one of its 6 hotel addresses follows the
              // same "..., City, State - PIN" pattern), not fabricated.
              // Location stays null — nothing in this consumer's data maps
              // to it at all (real Amritara's own likely carries lat/long
              // or a place-id, neither of which exists here). Country/
              // CountryCode are safe to hardcode — every property this
              // package serves for this consumer is in India, same
              // reasoning already used for the hotel JSON-LD schema's own
              // addressCountry.
              Location: null,
              AddressLine: resolvedPropertyAddress,
              City: resolvedPropertyCity,
              State: resolvedPropertyState,
              Country: "India",
              CountryCode: "IN",
              Email: resolvedPropertyEmail,
              Phone: resolvedPropertyPhone,
              PostalCode: resolvedPropertyPostalCode,
            },
          },
          cancellationPolicyState: stay.cancellationPolicyState || "",
          termsAndConditions: "_",
        }),
        
        ReservationJson: JSON.stringify(payload),
        SessionId: bookingSessionId,
        Ip: "",
        CtaCustomerId: formData.customerGuid || "",
        Room: (selectedRoom || []).map((room) => room?.roomName).join(", "),
        Package: (selectedRoom || [])
          .map((room) => room?.roomPackage)
          .join(", "),
        form_of_payment: formOfPayment,
      };

      console.log(
        `[PAYMENT-FLOW] DetailStep.jsx: calling postPaymentRequest (${formOfPayment === "pay_later" ? "/api/th-payment-request2" : "/api/th-payment-request"})`,
        { reservationId, amount: finalRequestData2.amount, formOfPayment },
      );
      const paymentResp = await postPaymentRequest(config, {
        finalRequestData2,
        reservationPayload: payload,
        keyData: finalKeyData,
        formOfPayment,
      });
      console.log("[PAYMENT-FLOW] DetailStep.jsx: postPaymentRequest result", { paymentResp });
      if (paymentResp?.errorMessage !== "success") {
        throw new Error(
          paymentResp?.errorMessage ||
            "Payment request failed. Please try again.",
        );
      }

      console.log(
        "[PAYMENT-FLOW] DetailStep.jsx: saving be_bookingData snapshot",
        {
          hasSelectedRoom: Array.isArray(selectedRoom),
          selectedRoomLength: Array.isArray(selectedRoom)
            ? selectedRoom.length
            : null,
          selectedRoom,
        },
      );
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
            Address: {
              // Matches real Amritara's own Address shape exactly (Location/
              // AddressLine/City/State/Country/CountryCode/Email/Phone/
              // PostalCode — see property?.Address in its DetailStep.js).
              // City/State/PostalCode are recovered from this consumer's
              // own single combined address string (properties.js's
              // parseIndianAddress — verified against its real live CMS
              // response, every one of its 6 hotel addresses follows the
              // same "..., City, State - PIN" pattern), not fabricated.
              // Location stays null — nothing in this consumer's data maps
              // to it at all (real Amritara's own likely carries lat/long
              // or a place-id, neither of which exists here). Country/
              // CountryCode are safe to hardcode — every property this
              // package serves for this consumer is in India, same
              // reasoning already used for the hotel JSON-LD schema's own
              // addressCountry.
              Location: null,
              AddressLine: resolvedPropertyAddress,
              City: resolvedPropertyCity,
              State: resolvedPropertyState,
              Country: "India",
              CountryCode: "IN",
              Email: resolvedPropertyEmail,
              Phone: resolvedPropertyPhone,
              PostalCode: resolvedPropertyPostalCode,
            },
          },
          cancellationPolicyState: stay.cancellationPolicyState || "",
          termsAndConditions: "",
          // Restored back into SearchContext on both the pay-now-gated
          // mount fallback and "Back to Cart" (Wizard.jsx) — without this,
          // a day-use booking that bounces off STAAH came back looking
          // like a normal overnight stay (wrong Check-in/Check-out pairing
          // in CartOverview, wrong nightly-vs-flat pricing) since isDayUse
          // itself, unlike selectedStartDate/selectedEndDate, was never
          // part of this snapshot at all.
          isDayUse,
          // Everything below is unused by the receipt itself — it's what
          // lets ConfirmStep.jsx's "Try Again" button actually retry the
          // SAME payment (re-POST to STAAH + redirect again) instead of
          // just sending the guest home. Without these, handleRetryClick's
          // fallback path (used whenever the gateway's own verify-token
          // response doesn't carry a usable reservationJson/bookingDetailsJson
          // to retry from directly) has nothing to rebuild a payment
          // request from and always bails straight to homeUrl — this is
          // exactly the "Try Again just goes to the home page" bug.
          selectedPropertyId,
          formOfPayment,
          keyData: finalKeyData,
          reservationPayload: payload,
          finalRequestData2,
          // The FULL StayContext room objects (roomId, roomRateWithTax,
          // maxGuest/maxAdult/maxChildren, minInventory, nightly
          // breakdown, etc.) — NOT the flattened `selectedRoom` above
          // (that's a display-only summary for the receipt: just
          // roomName/roomImage/roomPackage/adults/children). CartOverview
          // and proceedToPay's own validation both read straight off
          // StayContext.selectedRoom, so restoring FROM this on Back is
          // what lets step 2 show the real cart (rooms + price breakdown)
          // and stay fully editable, instead of an empty "Select Room" /
          // ₹0 cart that looks broken even though the guest already
          // picked everything.
          rawSelectedRoom: selectedRoom,
          // Wizard.jsx's mount-effect fallback only trusts this snapshot
          // for a short window after it's saved — see that file's own
          // comment — so a stale/abandoned attempt from a much earlier
          // visit can't resurrect a fake in-progress checkout indefinitely.
          savedAt: Date.now(),
        }),
      );

      const resolvedKeyData =
        keyData || (config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : "");
      const paramvalues = JSON.stringify({
        property_id: selectedPropertyId,
        property_name: selectedPropertyName,
        property_tel: resolvedPropertyPhone,
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
        form_of_payment: formOfPayment,
      });

      onComplete?.();
      console.log("[PAYMENT-FLOW] DetailStep.jsx: redirecting browser to STAAH hosted payment page NOW", { reservationId, formOfPayment, staahBaseUrl: config?.staahBaseUrl, paramvalues });
      // Navigates away from the app (STAAH hosted payment page) — call last.
      redirectToPayment(config, paramvalues, resolvedKeyData);
    } catch (err) {
      console.error("[PAYMENT-FLOW] DetailStep.jsx: handleSubmit FAILED before reaching payment gateway", err);
      setIsProcessing(false);
      toast.error(err?.message || "Payment failed. Please try again.");
      postBookingWidged(config, {
        ctaName: err?.message || "Payment failed",
        propertyId: selectedPropertyId,
        apiErrorCode: "1166",
        apiMessage: err?.message || "Payment failed",
      });
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

        {/* Mobile-only (see DetailStep.css) — desktop keeps using
            CartOverview's own sticky-sidebar buttons (hidden here via CSS)
            since scrolling to the very end of a long form to find the pay
            button there would be a real regression on a tall viewport. On
            mobile there's no sticky sidebar to keep it visible in anyway
            (CartOverview stacks above this form instead), so real
            Amritara's own placement — end of the form, after the privacy
            checkbox, before the trust badges — is what this matches. Same
            form/name/value wiring as CartOverview's buttons: handleSubmit
            tells them apart via e.submitter either way. */}
        <div className="be-mobile-pay-actions">
          <button
            type="submit"
            name="formOfPayment"
            value="pay_now"
            className="be-mobile-pay-btn"
          >
            Confirm &amp; Pay
          </button>
          <div className="be-mobile-pay-divider" role="separator">
            <span>OR</span>
          </div>
          <button
            type="submit"
            name="formOfPayment"
            value="pay_later"
            className="be-mobile-pay-later-btn"
          >
            Pay Later
          </button>
        </div>

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
      </form>

      {/* react-hot-toast's toast.error(...) calls (proceedToPay above, e.g.
          "Select your room(s)") are global, but only actually render where
          a <Toaster> is mounted — StayStep.jsx and SearchBar.jsx each have
          their own, but neither is mounted once the guest reaches this
          step (step 2), so a validation failure here previously fired the
          toast into thin air: the submit was correctly blocked, but the
          guest saw no feedback explaining why nothing happened. */}
      <Toaster position="top-right" />

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
