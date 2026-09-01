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
  const { setActiveRoomSlotIndex } = useStayContext();
  // Active across every step (not just step 1) — the cart sidebar's own
  // "Modify Dates"/"Modify Guests"/promo controls render on step 2 too.
  // Sync must run for the guest-limit warnings (CartOverview.jsx) and the
  // reprice below to see up-to-date adults/children on step 2, where
  // StayStep.jsx (which used to be the only place this sync ran) isn't
  // mounted at all. Both no-op whenever nothing has actually changed.
  useSyncSelectedRoomsWithSearch();
  useRepriceSelectedRooms();

  const changeStep = (next) => {
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

  useEffect(() => {
    if (!syncStepToUrl || typeof window === "undefined") return;
    const onPopState = () => {
      const url = new URL(window.location.href);
      const urlStep = parseInt(url.searchParams.get("step"), 10);
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
        <SearchBar variant="compact" onSearch={onSearch} onBack={onBack} />
      )}

      <StepIndicator step={step} onBack={() => changeStep(1)} />

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
            <AddOnsStep />
          </div>
          <CartOverview
            onModifyRooms={(slotIndex) => {
              // Cart sidebar's per-room "Select Room"/"Modify" lines pass
              // their slot index so step 1 re-opens targeting that exact
              // room, mirroring Filterbar.js's openPropertyPage(room.id).
              if (typeof slotIndex === "number")
                setActiveRoomSlotIndex(slotIndex);
              changeStep(1);
            }}
          />
        </div>
      )}

      {step === 4 && <ConfirmStep />}
    </div>
  );
}
