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
  // BookingFlow's mobileModal renders this "full" variant inside a tall,
  // scrollable full-screen sheet — checkSpace below measures space under
  // the *whole form* (via widgetRef), and with every field stacked plus a
  // full-width submit button, that reads as "not enough room" even for the
  // very first field (Location) near the top. Flipping it upward then
  // renders the dropdown above the field, i.e. off the top of the sheet
  // where there's nothing to scroll to — it just gets clipped. Forcing
  // every dropdown open-down here (same override isCompact already gets)
  // fixes it without touching the desktop/inline-mobile checkSpace logic.
  alwaysOpenDown = false,
  // Bumped by Wizard.jsx whenever CartOverview's "Modify Property" link is
  // clicked — see Wizard.jsx's own doc comment on modifyPropertySignal. A
  // counter, not a boolean, specifically so a second "Modify Property"
  // click while already sitting on step 1 still re-opens the dropdown (a
  // boolean that's already `true` wouldn't change, so the effect below
  // wouldn't re-fire).
  autoOpenDestinationSignal,
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
    isDayUse: search.isDayUse,
  });

  const widgetRef = useRef(null);
  const destModalRef = useRef(null);
  const calModalRef = useRef(null);
  const guestsModalRef = useRef(null);
  // Set by openOnly right before it opens a dropdown, consumed once by the
  // very next handleClickOutside run. Needed because handleClickOutside is
  // a raw `document.addEventListener` listener, not a React handler — it
  // fires AFTER React's own onClick (and the synchronous re-render/commit
  // that follows it) as the SAME click event keeps bubbling up to
  // `document`. Without this, any dropdown opened as a side effect of
  // clicking something that ISN'T that dropdown's own trigger (e.g.
  // handleSelectProperty opening the calendar off a destination-option
  // click, or handleChangeRange opening guests off a calendar-day click)
  // gets immediately closed again by this same click: the click target
  // doesn't match the newly-opened dropdown's own trigger id, so
  // handleClickOutside reads it as an outside click and closes it right
  // back down before the guest ever sees it open. A plain trigger click
  // (e.g. clicking the Location field itself) doesn't need this — its own
  // trigger-id check in handleClickOutside already exempts it — but it's
  // harmless to set unconditionally on every openOnly call regardless.
  const suppressNextOutsideCloseRef = useRef(false);

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
      if (suppressNextOutsideCloseRef.current) {
        suppressNextOutsideCloseRef.current = false;
        return;
      }
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
    setOpenUpwards(isCompact || alwaysOpenDown ? false : checkSpace(threshold));
    setShowDestModal(false);
    setShowCalModal(false);
    setShowGuestsModal(false);
    setter(true);
    suppressNextOutsideCloseRef.current = true;
  };

  // "Modify Property" (CartOverview.jsx, via Wizard.jsx's
  // modifyPropertySignal) — auto-opens ONLY the Location dropdown once step
  // 1 mounts, not the calendar or guests, both of which already have their
  // own direct "Modify Dates"/"Modify Guests" entry points from the cart
  // sidebar without ever routing back through here. Guarded so the initial
  // render (signal starts at 0/undefined) never auto-opens anything on its
  // own — only an actual increment does.
  const isFirstAutoOpenRender = useRef(true);
  useEffect(() => {
    if (isFirstAutoOpenRender.current) {
      isFirstAutoOpenRender.current = false;
      return;
    }
    if (autoOpenDestinationSignal) {
      openOnly(setShowDestModal, 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenDestinationSignal]);

  const handleSelectProperty = (property) => {
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
    // Guided flow: picking a location advances straight into the calendar
    // instead of leaving the guest to notice and open it themselves —
    // openOnly already closes every other dropdown (including this one)
    // before opening the target, so this is the same "close everything,
    // open just this" used everywhere else (e.g. the calendar trigger's own
    // onOpen). Unconditional on every call means picking a *different*
    // location later — even mid-flow, with the calendar already open and
    // dates half-picked — closes whatever's open and restarts this same
    // hand-off from scratch, exactly like a fresh location pick would.
    openOnly(setShowCalModal, 460);
  };

  // Day Use / Overnight Stay toggle — ported from Filterbar.js's day-use
  // switch. Resets any picked arrival time on every mode change (matches
  // Filterbar.js's own reset-on-toggle), and if a check-in date is already
  // picked, immediately snaps the internal end date to +1 day so switching
  // modes mid-selection doesn't leave a stale multi-night range behind
  // (RangeCalendar's own day-use click handler does the same +1-day
  // derivation for a *fresh* pick — this covers switching modes on a date
  // that was already selected before the toggle changed).
  const handleStayModeChange = (nextIsDayUse) => {
    if (nextIsDayUse === search.isDayUse) return;
    search.setIsDayUse(nextIsDayUse);
    search.setDayUseArrivalTime("");
    if (nextIsDayUse && search.selectedStartDate) {
      const nextDay = new Date(search.selectedStartDate);
      nextDay.setDate(nextDay.getDate() + 1);
      search.setSelectedEndDate(nextDay);
    }
    setShowCalModal(false);
  };

  const handleChangeRange = (start, end) => {
    if (end) {
      search.setSelectedDates(start, end);
      // Continues the same guided hand-off handleSelectProperty starts
      // (location -> calendar) one step further: a completed date range
      // advances straight into the guests/rooms picker instead of leaving
      // the guest to open it themselves. openOnly closes the calendar (and
      // everything else) before opening this, same as every other step.
      openOnly(setShowGuestsModal, 350);
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
      isDayUse: search.isDayUse,
      dayUseArrivalTime: search.dayUseArrivalTime,
    });
    // The one explicit "run the search now" signal StayStep.jsx's room
    // fetch actually waits for — see SearchContext's searchTrigger doc
    // comment. Without this, this button wouldn't even need to exist for
    // the wizard's own compact recap bar: every field write already lands
    // in context immediately regardless.
    search.commitSearch();
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

  // Shared between the full capsule (its own standalone field) and the
  // compact recap bar (grouped with the back button, see the render below)
  // so both stay in sync without duplicating the markup.
  const stayModeToggle = (
    <div className="be-form-group be-stay-mode-group">
      <div className="be-form-field-inputs">
        <label>Day Use</label>
        <button
          type="button"
          role="switch"
          aria-checked={search.isDayUse}
          aria-label="Toggle Day Use booking"
          className={`be-stay-mode-switch ${search.isDayUse ? "be-stay-mode-switch--active" : ""}`}
          onClick={() => handleStayModeChange(!search.isDayUse)}
        >
          <span className="be-stay-mode-switch-knob" />
        </button>
      </div>
    </div>
  );

  // Desktop reference design puts the back arrow as its own separate
  // circle to the left of the pill, with visible page background between
  // it and the pill's rounded edge — not fused into the same card the way
  // it reads on mobile/tablet (unchanged there, still the one grouped with
  // the Day Use switch inside .be-compact-leading-controls below). Rather
  // than repositioning that one button across two very different layouts
  // (which would also have to fight its own sticky/scroll behavior — see
  // this button's own comment further down), this renders a second,
  // genuinely separate DOM sibling before the pill, shown only at
  // >=1025px (SearchBar.css's .be-search-back-btn--standalone), while the
  // inside one is hidden at that width instead of removed, so mobile/
  // tablet's markup and behavior stay exactly as they were.
  const desktopBackButton = isCompact && onBack && (
    <button
      type="button"
      className="be-search-back-btn be-search-back-btn--standalone"
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
  );

  const widget = (
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
              {search.selectedStartDate && (search.isDayUse || search.selectedEndDate)
                ? search.isDayUse
                  ? formatShort(search.selectedStartDate)
                  : `${formatShort(search.selectedStartDate)} – ${formatShort(search.selectedEndDate)}`
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

      <form
        className={`be-booking-form ${search.isDayUse ? "be-booking-form--dayuse" : ""}`}
        onSubmit={handleSubmit}
      >
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

        {isCompact ? (
          // Grouped together so both share the grid's existing leading
          // `auto` track (already sized for the back button alone) instead
          // of needing a whole new track whose presence/absence would
          // depend on whether `onBack` was passed — that would leave every
          // later field off by one grid slot whenever it wasn't.
          <div className="be-compact-leading-controls">
            {onBack && (
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
            {stayModeToggle}
          </div>
        ) : (
          // Full variant (the main search entry point): its own standalone
          // field, first in the row — same placement Filterbar.js uses for
          // its own day-use switch — since there's no back button here to
          // group it with.
          stayModeToggle
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
          isDayUse={search.isDayUse}
        />

        <GuestsField
          rooms={search.searchRooms}
          summaryText={search.getSearchGuestsSummary()}
          onAddRoom={search.addSearchRoom}
          onRemoveRoom={search.removeSearchRoom}
          onUpdateGuests={search.updateSearchRoomGuests}
          isOpen={showGuestsModal}
          onToggle={() => openOnly(setShowGuestsModal, 350)}
          onDone={() => {
            setShowGuestsModal(false);
            // Last leg of the guided hand-off (location -> calendar ->
            // guests -> here): closing the guests picker moves keyboard
            // focus into Promo Code, the one field left before Search — the
            // guest doesn't have to click into it themselves, just type or
            // move straight to Search. See PromoField.jsx's id.
            document.getElementById("be-promo-input")?.focus();
          }}
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
          {/* Hidden by default (see SearchBar.css) — every existing layout
              (desktop capsule, compact recap bar) keeps its icon-only
              circular button untouched. BookingFlow's mobileModal sheet is
              the only place this becomes visible, via a descendant
              selector on its own wrapper class. */}
          <span className="be-btn-booking-pill-label">Search</span>
        </button>
      </form>

      {!isCompact &&
        mounted &&
        createPortal(<Toaster position="top-center" />, document.body)}
    </div>
  );

  if (!isCompact) return widget;

  // .be-compact-bar-row only changes anything at >=1025px (see
  // SearchBar.css) — below that it's a plain full-width wrapper with no
  // layout effect of its own, so the pill's existing sticky/margin/shadow
  // behavior on mobile/tablet is unaffected by this extra wrapping element.
  return (
    <div className="be-compact-bar-row">
      {desktopBackButton}
      {widget}
    </div>
  );
}
