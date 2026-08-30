"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast, { Toaster } from "react-hot-toast";
import { useConfig } from "../../config/configContext.js";
import { useSearchContext } from "../../context/SearchContext.js";
import { useCartContext } from "../../context/CartContext.js";
import { useStayContext } from "../../context/StayContext.js";
import { DestinationField } from "./DestinationField.js";
import { DateRangeField } from "./DateRangeField.js";
import { GuestsField } from "./GuestsField.js";
import { PromoField } from "./PromoField.js";
import { useCalendarRates } from "../../hooks/useCalendarRates.js";
import { resolveExternalRedirectUrl } from "../../utils/externalRedirect.js";
import { postBookingWidged } from "../../api/tracking.js";
import "./SearchBar.css";

/**
 * The capsule search bar. Visual/animation spec ported 1:1 from
 * bawa-hotels-next's homepage booking widget; search logic wired to the
 * real booking-engine domain contexts instead of bawa's mock data.
 *
 * Calendar per-day rates/sold-out markers are self-fetched (via
 * api/rates.js's getDayRateCalendar) whenever a property is selected, so
 * consumers don't need to wire `getDayRate`/`isDateSoldOut` manually — pass
 * them explicitly to override this default behavior (e.g. a consumer with
 * its own rate-caching layer).
 *
 * `variant="full"` (default) is the hero-style capsule bar. `variant="compact"`
 * renders the same fields/logic in a slimmer single-row bar with an optional
 * leading back-arrow (`onBack`) — used as the search recap bar atop the
 * wizard/listing view. Both variants share every subcomponent and all
 * context wiring; only the outer CSS layout differs (see SearchBar.css's
 * `--compact` modifier).
 */
export function SearchBar({
  onSearch,
  getDayRate,
  isDateSoldOut,
  holidays,
  variant = "full",
  onBack,
}) {
  const config = useConfig();
  const search = useSearchContext();
  const cart = useCartContext();
  const { setActiveRoomSlotIndex, setSelectedRoom } = useStayContext();

  const properties = config.properties || [];

  const {
    getDayRate: resolvedGetDayRate,
    isDateSoldOut: resolvedIsDateSoldOut,
    isDateRateLoading,
    handleCalendarMonthChange,
  } = useCalendarRates(search.selectedPropertyId, {
    getDayRate,
    isDateSoldOut,
  });

  const widgetRef = useRef(null);
  const destModalRef = useRef(null);
  const calModalRef = useRef(null);
  const guestsModalRef = useRef(null);

  const [showDestModal, setShowDestModal] = useState(false);
  const [showCalModal, setShowCalModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Compact variant, mobile only (<=768px, see SearchBar.css): whether the
  // full stacked field form is showing instead of the short summary card.
  // Irrelevant at every other width/variant, where CSS keeps the summary
  // card hidden and the form always visible regardless of this value.
  const [mobileEditOpen, setMobileEditOpen] = useState(false);

  const isCompact = variant === "compact";

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        destModalRef.current &&
        !destModalRef.current.contains(e.target) &&
        !e.target.closest("#be-destination-trigger")
      ) {
        setShowDestModal(false);
      }
      if (
        calModalRef.current &&
        !calModalRef.current.contains(e.target) &&
        !e.target.closest("#be-checkin-trigger") &&
        !e.target.closest("#be-checkout-trigger")
      ) {
        setShowCalModal(false);
      }
      if (
        guestsModalRef.current &&
        !guestsModalRef.current.contains(e.target) &&
        !e.target.closest("#be-guests-trigger")
      ) {
        setShowGuestsModal(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const checkSpace = (threshold = 400) => {
    if (!widgetRef.current) return false;
    const rect = widgetRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    return spaceBelow < threshold;
  };

  const openOnly = (setter, threshold) => {
    // The compact bar (both the tablet 3-column recap and the mobile
    // expanded edit form) always sits pinned near the top of the viewport
    // — there's rarely real room above it, so checkSpace's "not enough
    // room below, flip upward" logic just pushes the dropdown off the top
    // of the screen instead (openUpwards anchors it with bottom:121%,
    // which has nowhere to go if the trigger itself is already near y:0).
    // The full hero variant can be anywhere on a tall page, so it keeps
    // the real space-below check.
    setOpenUpwards(isCompact ? false : checkSpace(threshold));
    setShowDestModal(false);
    setShowCalModal(false);
    setShowGuestsModal(false);
    setter(true);
  };

  const handleSelectProperty = (property) => {
    console.log("Prem property",property)
    // staahPropertyId (not the CMS propertyId) is what every rate/room/
    // calendar API call needs — see api/properties.js's
    // mapCityWithPropertyResponse doc comment. Falls back to propertyId/id
    // for a consumer supplying an older/simpler config.properties shape.
    search.setSelectedPropertyId(
      property.staahPropertyId ?? property.propertyId ?? property.id,
    );
    search.setSelectedPropertyName(property.propertyName ?? property.name);
    search.setSelectedPropertyPhone(property.phone ?? null);
    search.setSelectedCityId(property.cityId ?? null);
    setShowDestModal(false);
  };

  const handleChangeRange = (start, end) => {
    if (end) {
      search.setSelectedDates(start, end);
      setShowCalModal(false);
    } else {
      search.setSelectedStartDate(start);
      search.setSelectedEndDate(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!search.selectedPropertyId) {
      toast.error("Please select a hotel.");
      return;
    }
    if (!search.selectedStartDate || !search.selectedEndDate) {
      toast.error("Please select check-in and check-out dates.");
      return;
    }

    // config.staahRedirectMode === "redirect" is this package's equivalent
    // of Amritara's site-wide NEXT_PUBLIC_STAAH_REDIRECT env var — when
    // set, a search sends the browser straight to an external hosted
    // booking widget instead of running this package's own wizard. See
    // utils/externalRedirect.js's doc comment for the real source this is
    // ported from.
    const externalUrl = resolveExternalRedirectUrl(config, {
      propertyId: search.selectedPropertyId,
      startDate: search.selectedStartDate,
      endDate: search.selectedEndDate,
      rooms: search.searchRooms,
    });
    if (externalUrl) {
      window.location.href = externalUrl;
      return;
    }

    // Ported from Filterbar.js:2580 — real's exact ctaName string
    // ("Search Click"), fired unconditionally on a valid search submit.
    // postBookingWidged(config, {
    //   ctaName: "Search Click",
    //   propertyId: search.selectedPropertyId,
    // });

    onSearch?.({
      propertyId: search.selectedPropertyId,
      propertyName: search.selectedPropertyName,
      startDate: search.selectedStartDate,
      endDate: search.selectedEndDate,
      rooms: search.searchRooms,
      promoCode: cart.promoCodeContext,
    });
    // Every search click starts room selection over from scratch — clears
    // whatever room/rate was picked on every slot (keeping only the slot's
    // id/adults/children, i.e. the same empty shape
    // useSyncSelectedRoomsWithSearch.js gives a brand-new slot) and jumps
    // back to Room 1. This is a deliberate product decision (explicitly
    // requested): a guest who clicks Search — whether it's their first
    // search or they changed dates/guests after already picking rooms —
    // should always see a fresh room list to choose from, not a repriced
    // carry-over of an earlier pick. useRepriceSelectedRooms still handles
    // the OTHER path (editing dates/guests via the cart sidebar's own
    // "Modify Dates"/"Modify Guests", without touching this Search button)
    // by repricing in place instead of clearing — those are two genuinely
    // different guest actions with two different expected outcomes.
    setSelectedRoom((prev) =>
      (prev || []).map((slot) => ({
        id: slot.id,
        adults: slot.adults,
        children: slot.children,
        roomId: "",
        roomName: "",
        roomImage: null,
      })),
    );
    setActiveRoomSlotIndex(0);
    // Collapse back to the short summary card on mobile once a search runs
    // — staying expanded would leave the full field form pinned open over
    // whatever just loaded below it.
    setMobileEditOpen(false);
  };

  // "Aug 24" — short enough for the summary card's single recap line;
  // formatDisplayDate's "24 Aug 26" is meant for the full field labels,
  // not a compact inline summary.
  const formatShort = (d) =>
    d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  console.log("Prem isCompact",isCompact)

  return (
    <div
      ref={widgetRef}
      className={`be-booking-widget-wrap ${isCompact ? "be-booking-widget-wrap--compact" : ""} ${visible ? "be-visible" : ""} ${isCompact && mobileEditOpen ? "be-mobile-editing" : ""}`}
    >
      {isCompact && (
        <div className="be-compact-summary">
          <div className="be-compact-summary-text">
            <p className="be-compact-summary-property">
              {search.selectedPropertyName || "Select a hotel"}
            </p>
            <p className="be-compact-summary-meta">
              {search.selectedStartDate && search.selectedEndDate
                ? `${formatShort(search.selectedStartDate)} – ${formatShort(search.selectedEndDate)}`
                : "Select dates"}
              {" · "}
              {search.getSearchGuestsSummary()}
            </p>
          </div>
          <button
            type="button"
            className="be-compact-summary-edit-btn"
            onClick={() => setMobileEditOpen(true)}
            aria-label="Edit search"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
      )}

      <form className="be-booking-form" onSubmit={handleSubmit}>
        {isCompact && mobileEditOpen && (
          <button
            type="button"
            className="be-compact-close-btn"
            onClick={() => setMobileEditOpen(false)}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {isCompact && onBack && (
          <button
            type="button"
            className="be-search-back-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}

        <DestinationField
          properties={properties}
          selectedPropertyId={search?.selectedPropertyId}
          onSelect={handleSelectProperty}
          isOpen={showDestModal}
          onToggle={() => openOnly(setShowDestModal, 350)}
          modalRef={destModalRef}
          triggerId="be-destination-trigger"
          openUpwards={openUpwards}
        />

        <DateRangeField
          selectedStartDate={search.selectedStartDate}
          selectedEndDate={search.selectedEndDate}
          onChangeRange={handleChangeRange}
          isOpen={showCalModal}
          onOpen={() => openOnly(setShowCalModal, 460)}
          modalRef={calModalRef}
          openUpwards={openUpwards}
          getDayRate={resolvedGetDayRate}
          isDateSoldOut={resolvedIsDateSoldOut}
          isDateRateLoading={isDateRateLoading}
          holidays={holidays}
          onMonthChange={handleCalendarMonthChange}
        />

        <GuestsField
          rooms={search.searchRooms}
          summaryText={search.getSearchGuestsSummary()}
          onAddRoom={search.addSearchRoom}
          onRemoveRoom={search.removeSearchRoom}
          onUpdateGuests={search.updateSearchRoomGuests}
          isOpen={showGuestsModal}
          onToggle={() => openOnly(setShowGuestsModal, 350)}
          onDone={() => setShowGuestsModal(false)}
          modalRef={guestsModalRef}
          openUpwards={openUpwards}
        />

        <PromoField
          value={cart.promoCodeContext || ""}
          onChange={cart.setPromoCodeContext}
        />

        <button
          type="submit"
          className="be-btn-booking-pill"
          aria-label="Search availability"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      {!isCompact &&
        mounted &&
        createPortal(<Toaster position="top-center" />, document.body)}
    </div>
  );
}
