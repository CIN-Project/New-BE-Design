"use client";

import { useEffect, useState } from "react";
import { StepIndicator } from "./StepIndicator.js";
import { StayStep } from "./steps/StayStep.js";
import { AddOnsStep } from "./steps/AddOnsStep.js";
import { DetailStep } from "./steps/DetailStep.js";
import { ConfirmStep } from "./steps/ConfirmStep.js";
import { CartOverview } from "../Cart/CartOverview.js";
import { SearchBar } from "../SearchBar/SearchBar.js";
import { useStayContext } from "../../context/StayContext.js";
import { useCartContext } from "../../context/CartContext.js";
import { useSearchContext } from "../../context/SearchContext.js";
import { useRepriceSelectedRooms } from "../../hooks/useRepriceSelectedRooms.js";
import { useSyncSelectedRoomsWithSearch } from "../../hooks/useSyncSelectedRoomsWithSearch.js";
import "./Wizard.css";

/**
 * Step numbering: 1 = room/rate selection, 2 = guest details + add-ons +
 * payment submit (one combined screen with the cart sidebar — real Amritara
 * doesn't have a separate card-entry step either, see DetailStep.jsx),
 * 4 = confirmation. Step 3 no longer exists (kept as a gap, not renumbered,
 * so an old bookmarked/shared `?step=3` URL still lands somewhere sane —
 * see the popstate handler below).
 */
export function Wizard({ onComplete, syncStepToUrl = true, onSearch, onBack }) {
  const [step, setStep] = useState(1);
  const { setActiveRoomSlotIndex, setSelectedRoom } = useStayContext();
  const { updateUserDetails } = useCartContext();
  const {
    setSelectedPropertyId,
    setSelectedPropertyName,
    setSelectedPropertyPhone,
    setSelectedStartDate,
    setSelectedEndDate,
    setIsDayUse,
  } = useSearchContext();
  // Bumped by CartOverview's "Modify Property" link, consumed once by
  // SearchBar's own autoOpenDestinationSignal effect to open specifically
  // the Location dropdown once step 1 mounts — not the calendar or guests,
  // both of which already have their own dedicated modals reachable
  // straight from the cart sidebar ("Modify Dates"/"Modify Guests") without
  // ever needing to land back on step 1 at all. A counter (not a boolean)
  // so clicking "Modify Property" again after already being on step 1
  // still re-fires the effect even though the signal was never "reset".
  const [modifyPropertySignal, setModifyPropertySignal] = useState(0);
  // Ported from Amritara_New_NextJs's back-from-payment behavior: on
  // desktop, landing back on step 4 (whether via a failed/pending STAAH
  // redirect or the guest's own Back button) still shows the actual
  // booking summary/wizard page underneath — real Amritara keeps its
  // guest-details/payment form mounted in a wide column with the status
  // card in a narrow one beside it, rather than replacing the whole page
  // with a single centered status card the way mobile does (a real
  // full-screen "Payment Unsuccessful" popup there). This package's step 2
  // (DetailStep.GuestDetailsForm + CartOverview) IS that booking summary
  // page, so on desktop it's kept rendered at step 4 too — ConfirmStep's
  // own inline (non-popup) card, see ConfirmStep.jsx, then renders below
  // it instead of alone.
  // const [isMobileViewport, setIsMobileViewport] = useState(true);
  // useEffect(() => {
  //   if (typeof window === "undefined" || !window.matchMedia) return;
  //   const mql = window.matchMedia("(max-width: 768px)");
  //   setIsMobileViewport(mql.matches);
  //   const onChange = (e) => setIsMobileViewport(e.matches);
  //   mql.addEventListener("change", onChange);
  //   return () => mql.removeEventListener("change", onChange);
  // }, []);
  // Active across every step (not just step 1) — the cart sidebar's own
  // "Modify Dates"/"Modify Guests"/promo controls render on step 2 too.
  // Sync must run for the guest-limit warnings (CartOverview.jsx) and the
  // reprice below to see up-to-date adults/children on step 2, where
  // StayStep.jsx (which used to be the only place this sync ran) isn't
  // mounted at all. Both no-op whenever nothing has actually changed.
  useSyncSelectedRoomsWithSearch();
  useRepriceSelectedRooms();

  const changeStep = (next) => {
    console.log("[PAYMENT-FLOW] Wizard.jsx: changeStep", { from: step, to: next });
    setStep(next);
    if (syncStepToUrl && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(next));
      window.history.pushState({}, "", url);
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Mobile-only "Back to Cart" on the payment-failure card (ConfirmStep.jsx's
  // FailureState) — desktop keeps its existing "Return Home" link
  // unchanged. Restores the same be_bookingData snapshot the mount-time
  // pay-now-gated fallback above reads, so the guest lands back on step 2
  // with their room selection and guest-details form exactly as they left
  // it, still editable, instead of being sent all the way back to the
  // homepage after a failed/declined payment.
  const handleBackToCart = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("be_bookingData");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.rawSelectedRoom)) {
          setSelectedRoom(parsed.rawSelectedRoom);
        }
        if (parsed?.formData) {
          updateUserDetails(parsed.formData);
        }
        // Bouncing off STAAH is always a full page reload of this app, so
        // SearchContext's property/dates — plain in-memory React state,
        // nothing more — reset to their defaults exactly like
        // StayContext/CartContext do. Without restoring these too,
        // CartOverview's "Selected Property"/"Stay & Guests" rows read as
        // blank ("—") even once the room/guest data above came back fine.
        if (parsed?.selectedPropertyId != null) {
          setSelectedPropertyId(parsed.selectedPropertyId);
        }
        if (parsed?.property?.PropertyName) {
          setSelectedPropertyName(parsed.property.PropertyName);
        }
        if (parsed?.property?.Address?.Phone) {
          setSelectedPropertyPhone(parsed.property.Address.Phone);
        }
        if (parsed?.selectedStartDate) {
          setSelectedStartDate(new Date(parsed.selectedStartDate));
        }
        if (parsed?.selectedEndDate) {
          setSelectedEndDate(new Date(parsed.selectedEndDate));
        }
        if (typeof parsed?.isDayUse === "boolean") {
          setIsDayUse(parsed.isDayUse);
        }
      }
    } catch {
      // No usable snapshot — still take the guest to step 2 rather than
      // stranding them on the failure card with no way back but Home.
    }
    changeStep(2);
  };

  // On mount only (not popstate — that's the effect below, for back/forward
  // navigation once already here): jump straight to the confirmation step
  // if STAAH just redirected the browser back with `?tokenKey=...`. Ported
  // from real Amritara's Filterbar.js (~2011-2027) — `if (tokenKey) {
  // setCurrentStep(4); ... }` fires unconditionally on mount there too,
  // since ConfirmStep.jsx's own verifyToken/confirmPayment calls are what
  // actually resolve success vs failure from here; the wizard's own step
  // state has no other way to know a payment redirect just landed.
  // Without this, a fresh mount (any real payment redirect always is one)
  // always started at step 1 regardless of the URL — ConfirmStep never
  // rendered at all, so its whole verify/confirm flow never ran.
  //
  // Bonus fix, same root cause: a direct/shared `?step=N` link (not just a
  // payment redirect) previously only worked via browser back/forward
  // (the popstate effect below) — a fresh load of that same URL ignored it
  // and always opened on step 1.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tokenKey = params.get("tokenKey");
    console.log("[PAYMENT-FLOW] Wizard.jsx: mount-time step check", {
      fullUrl: window.location.href,
      tokenKeyPresent: Boolean(tokenKey),
      urlStepParam: params.get("step"),
      syncStepToUrl,
    });
    if (tokenKey) {
      console.log("[PAYMENT-FLOW] Wizard.jsx: tokenKey present on mount -> jumping to step 4 (ConfirmStep)");
      setStep(4);
      return;
    }
    // No tokenKey (STAAH never redirected back — the guest just hit the
    // browser's own Back button from its hosted payment page, possibly
    // before STAAH even responded at all) but a payment attempt was left
    // in-flight. This host app renders <Wizard syncStepToUrl={false}>
    // (BookingFlow.jsx), so `step` never gets pushed into the URL/history
    // at all — without this check, a fresh reload here always fell back to
    // the default step (1, room/rate selection), which read as "back sent
    // me to a totally unfamiliar page" even though this IS still the
    // booking page. Real Amritara's own back-from-gateway behavior (no
    // tokenKey yet) returns the guest to the SAME booking-summary/guest-
    // details screen they were on — step 2 here, not step 4's
    // confirm/failure card, which is reserved for when STAAH actually DID
    // respond (tokenKey present, handled above).
    // 30 minutes — comfortably longer than anyone spends on STAAH's hosted
    // payment page, but short enough that an abandoned/test attempt from
    // hours or days ago (sessionStorage never expires on its own) can't
    // keep hijacking every later, unrelated fresh search into this
    // fallback forever.
    //
    // A missing `savedAt` is treated as FRESH (trust it), not stale —
    // deliberately the opposite of what the comment here used to say.
    // DetailStep.jsx's own `savedAt: Date.now()` write has, in practice,
    // gone missing/been reverted independently of this file more than
    // once this project — when that happens, `parsed?.savedAt || 0`
    // becomes 0, so `age` computes as "milliseconds since 1970": a
    // multi-decade number, always far past the 30-minute cutoff. That
    // silently discarded a booking saved moments ago as if it were
    // ancient, which is exactly backwards — a guest bouncing straight
    // back from STAAH is the COMMON case this whole fallback exists for,
    // while genuinely stale, `savedAt`-less data left over from days ago
    // is the rare one. Only an EXPLICIT, parseable `savedAt` that's
    // actually too old now gets discarded.
    // The real signal that THIS mount is actually a "bounced off STAAH
    // before it responded" case, not just any later unrelated visit: the
    // `pay-now` marker paymentHash.js's redirectToPayment writes into the
    // URL (via replaceState) right before navigating to STAAH, so hitting
    // the browser's own Back button lands right back on it. sessionStorage
    // itself is no help here — be_bookingData outlives the transaction it
    // was written for (nothing clears it once the guest moves on, and it
    // isn't scoped to any one property/search), so a stale snapshot from
    // an earlier, entirely different booking attempt was matching this
    // fallback's OWN "no tokenKey but be_bookingData present" condition on
    // every later fresh "Book Now" click too — even for a different
    // property, even after explicitly picking a different room on step 1.
    // Gating on pay-now is what actually tells those apart.
    const payNowMarkerPresent = params.has("pay-now");
    const PENDING_BOOKING_MAX_AGE_MS = 30 * 60 * 1000;
    let hasPendingBookingData = false;
    let pendingBookingData = null;
    try {
      const raw = window.sessionStorage.getItem("be_bookingData");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!payNowMarkerPresent) {
          console.log(
            "[PAYMENT-FLOW] Wizard.jsx: be_bookingData present but no pay-now marker in the URL — this isn't a bounce-back from STAAH, clearing stale data instead of restoring",
          );
          window.sessionStorage.removeItem("be_bookingData");
          window.sessionStorage.removeItem("be_paymentResponse");
        } else if (typeof parsed?.savedAt !== "number") {
          hasPendingBookingData = true;
          pendingBookingData = parsed;
        } else {
          const age = Date.now() - parsed.savedAt;
          if (age >= 0 && age <= PENDING_BOOKING_MAX_AGE_MS) {
            hasPendingBookingData = true;
            pendingBookingData = parsed;
          } else {
            console.log(
              "[PAYMENT-FLOW] Wizard.jsx: be_bookingData present but stale — ignoring and clearing",
              { savedAt: parsed.savedAt, ageMs: age },
            );
            window.sessionStorage.removeItem("be_bookingData");
            window.sessionStorage.removeItem("be_paymentResponse");
          }
        }
      }
    } catch {
      hasPendingBookingData = false;
    }
    if (hasPendingBookingData) {
      // Unconditional, unlike the two guarded logs below — this fires
      // regardless of what pendingBookingData actually contains, so a
      // silent "restoration didn't happen" is distinguishable from "this
      // code isn't even running": if THIS log is missing, the deployed
      // bundle predates this fix; if it's present but rawSelectedRoom is
      // absent/empty/not-an-array, DetailStep.jsx's SAVE side (the
      // `rawSelectedRoom: selectedRoom` line) is what's missing instead.
      console.log(
        "[PAYMENT-FLOW] Wizard.jsx: pendingBookingData contents at restore time",
        {
          keys: pendingBookingData ? Object.keys(pendingBookingData) : null,
          hasRawSelectedRoom: Array.isArray(pendingBookingData?.rawSelectedRoom),
          rawSelectedRoomLength: Array.isArray(pendingBookingData?.rawSelectedRoom)
            ? pendingBookingData.rawSelectedRoom.length
            : null,
          rawSelectedRoom: pendingBookingData?.rawSelectedRoom,
          hasFormData: Boolean(pendingBookingData?.formData),
          formData: pendingBookingData?.formData,
        },
      );
      // Restores the actual room selection + guest form data (not just
      // the flattened receipt summary) so step 2 shows the real cart and
      // pricing instead of an empty "Select Room" / ₹0 state, and stays
      // fully editable — CartOverview/proceedToPay both read straight off
      // StayContext.selectedRoom, and DetailStep's own form fields read
      // off CartContext.userDetails on mount.
      if (Array.isArray(pendingBookingData?.rawSelectedRoom)) {
        console.log(
          "[PAYMENT-FLOW] Wizard.jsx: restoring StayContext.selectedRoom from be_bookingData",
          { rawSelectedRoom: pendingBookingData.rawSelectedRoom },
        );
        setSelectedRoom(pendingBookingData.rawSelectedRoom);
      }
      if (pendingBookingData?.formData) {
        console.log(
          "[PAYMENT-FLOW] Wizard.jsx: restoring guest details form from be_bookingData",
          { formData: pendingBookingData.formData },
        );
        updateUserDetails(pendingBookingData.formData);
      }
      // Same SearchContext restoration as handleBackToCart below (property/
      // dates/isDayUse) — this fallback is a raw browser-Back bounce landing
      // straight on step 2, a different path than that button, but the same
      // full page reload wipes the same in-memory context state either way.
      if (pendingBookingData?.selectedPropertyId != null) {
        setSelectedPropertyId(pendingBookingData.selectedPropertyId);
      }
      if (pendingBookingData?.property?.PropertyName) {
        setSelectedPropertyName(pendingBookingData.property.PropertyName);
      }
      if (pendingBookingData?.property?.Address?.Phone) {
        setSelectedPropertyPhone(pendingBookingData.property.Address.Phone);
      }
      if (pendingBookingData?.selectedStartDate) {
        setSelectedStartDate(new Date(pendingBookingData.selectedStartDate));
      }
      if (pendingBookingData?.selectedEndDate) {
        setSelectedEndDate(new Date(pendingBookingData.selectedEndDate));
      }
      if (typeof pendingBookingData?.isDayUse === "boolean") {
        setIsDayUse(pendingBookingData.isDayUse);
      }
      console.log(
        "[PAYMENT-FLOW] Wizard.jsx: no tokenKey but a payment was left in-flight (be_bookingData present) -> jumping to step 2 (booking summary)",
      );
      setStep(2);
      // Consume the pay-now marker now that it's done its job — otherwise
      // this exact URL still reads as "just bounced off STAAH" forever
      // after, so ANY later revisit (the guest's own Back arrow calling
      // router.back() and landing back here for lack of anywhere else to
      // go, a remount, browser forward/back) jumps straight back to step 2
      // again instead of ever behaving like a normal fresh/closed state —
      // this was the concrete bug: "Back to Rooms" then the wizard's own
      // back arrow (meant to close it) bounced straight back to the
      // booking summary instead of actually closing.
      if (payNowMarkerPresent) {
        const url = new URL(window.location.href);
        url.searchParams.delete("pay-now");
        window.history.replaceState({}, "", url);
      }
      return;
    }
    if (!syncStepToUrl) return;
    const urlStep = parseInt(params.get("step"), 10);
    if (urlStep === 3) setStep(2);
    else if (urlStep >= 1 && urlStep <= 4) {
      console.log("[PAYMENT-FLOW] Wizard.jsx: restoring step from URL on mount", { urlStep });
      setStep(urlStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!syncStepToUrl || typeof window === "undefined") return;
    const onPopState = () => {
      const url = new URL(window.location.href);
      const urlStep = parseInt(url.searchParams.get("step"), 10);
      console.log("[PAYMENT-FLOW] Wizard.jsx: popstate (back/forward) step change", { urlStep });
      if (urlStep === 3) setStep(2);
      else if (urlStep >= 1 && urlStep <= 4) setStep(urlStep);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncStepToUrl]);

  return (
    <div className="be-wizard">
      {/* Compact search recap bar only on step 1 (room/rate selection) —
          bawa-hotels-next's real guest-details/checkout step has no search
          bar at all, going straight from the top of the page to "Back to
          Rooms" + the step indicator. Previously rendered by BookingFlow.jsx
          as a constant sibling above <Wizard>, so it had no way to know the
          internal step and stayed visible on every step — moved here so it
          can actually hide itself past step 1. */}
      {step === 1 && (onSearch || onBack) && (
        <SearchBar
          variant="compact"
          onSearch={onSearch}
          onBack={onBack}
          autoOpenDestinationSignal={modifyPropertySignal}
        />
      )}

      <StepIndicator
        step={step}
        onBack={() => {
          // This is the OTHER way back to step 1 (the plain back arrow),
          // distinct from CartOverview's "Modify Property" link below —
          // that one bumps modifyPropertySignal specifically so the
          // re-mounted compact SearchBar auto-opens the Location dropdown.
          // Without resetting it back to 0 here, a signal left over from an
          // earlier "Modify Property" click (still non-zero — it only ever
          // increments) leaks into this unrelated path: the SearchBar that
          // remounts on THIS step-1 re-entry sees the same already-elevated
          // value and reopens the dropdown even though the guest never
          // clicked Modify this time.
          setModifyPropertySignal(0);
          changeStep(1);
        }}
      />

      {step === 1 && <StayStep onRoomsSelected={() => changeStep(2)} />}

      {step === 2 && (
        <div className="be-cart-details-layout">
          <div className="be-cart-left-col">
            {/* Guest details + add-ons on one screen, no separate card-entry
                step — real Amritara's "Confirm & Pay" flow doesn't collect
                card details in-app either (see DetailStep.jsx's doc comment
                on GuestDetailsForm). Add-ons always render below guest
                details per request. The actual submit button lives in
                CartOverview's sidebar, wired to this form via the `form`
                attribute. */}
            <DetailStep.GuestDetailsForm onComplete={onComplete} />
            {/* <AddOnsStep /> */}
          </div>
          <CartOverview
            onModifyRooms={(slotIndex) => {
              // Cart sidebar's per-room "Select Room"/"Modify" lines pass
              // their slot index so step 1 re-opens targeting that exact
              // room, mirroring Filterbar.js's openPropertyPage(room.id).
              if (typeof slotIndex === "number")
                setActiveRoomSlotIndex(slotIndex);
              // Same leftover-signal leak as StepIndicator's onBack above —
              // this re-enters step 1 to modify ROOMS, not the property, so
              // a signal left over from an earlier "Modify Property" click
              // must not reopen the Location dropdown here either.
              setModifyPropertySignal(0);
              changeStep(1);
            }}
            onModifyProperty={() => {
              setModifyPropertySignal((n) => n + 1);
              changeStep(1);
            }}
          />
        </div>
      )}

      {step === 4 && <ConfirmStep onBackToCart={handleBackToCart} />}
    </div>
  );
}
