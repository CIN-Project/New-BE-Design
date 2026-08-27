"use client";

import { useState } from "react";
import { useSearchContext } from "../../context/SearchContext.js";
import { useStayContext } from "../../context/StayContext.js";
import { useCartContext } from "../../context/CartContext.js";
import { formatDisplayDate } from "../../utils/date.js";
import { computeStayTotals } from "../../utils/ratePricing.js";
import { CouponComponent } from "./CouponComponent.js";
import { DateRangeModal } from "../SearchBar/DateRangeModal.js";
import { GuestsModal } from "../SearchBar/GuestsModal.js";
import "./CartOverview.css";

const modifyLinkStyle = {
  fontSize: "0.75rem",
  color: "var(--be-color-primary, #846836)",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatCurrency(value) {
  return `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
}

/** "Wed, 15 Jul" — used only for the per-night price/GST breakdown rows. */
function formatNightLabel(date) {
  if (!date) return "";
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform 0.2s ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Persistent cart sidebar shown alongside the guest-details/add-ons step.
 * Visual spec ported 1:1 from bawa-hotels-next; pricing/summary logic is
 * real (unlike Amritara's CartOverview.js, which was never rendered
 * anywhere and never applied the promo discount to its total) — every
 * figure here comes from utils/ratePricing.js's computeStayTotals, the same
 * function DetailStep.jsx's real payment submission uses, so what's shown
 * here and what actually gets charged can never drift apart.
 */
export function CartOverview({ onModifyRooms }) {
  const {
    selectedPropertyName,
    selectedStartDate,
    selectedEndDate,
    searchRooms,
  } = useSearchContext();
  const { selectedRoom, cancellationPolicyState } = useStayContext();
  const { addonAmountTotal, addonTaxTotal, selectedAddOns, promoCodeContext } =
    useCartContext();

  const [isBaseCostOpen, setIsBaseCostOpen] = useState(false);
  const [isGstOpen, setIsGstOpen] = useState(false);
  const [isPolicyExpanded, setIsPolicyExpanded] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [showPromoInput, setShowPromoInput] = useState(false);

  const totalAdults = (searchRooms || []).reduce(
    (sum, r) => sum + (r.adults || 0),
    0,
  );
  const totalChildren = (searchRooms || []).reduce(
    (sum, r) => sum + (r.children || 0),
    0,
  );
  const guestsSummary = `${totalAdults} Adult${totalAdults === 1 ? "" : "s"}${
    totalChildren > 0
      ? `, ${totalChildren} Child${totalChildren === 1 ? "" : "ren"}`
      : ""
  }`;

  const {
    nights,
    roomBaseCost,
    gstTotal,
    gstPercent,
    extraChargeTotal,
    taxesAndFeesTotal,
    addonAmount,
    grandTotal,
    perNightBreakdown,
    totalSavings,
  } = computeStayTotals({
    selectedRoom,
    selectedStartDate,
    selectedEndDate,
    addonAmountTotal,
    addonTaxTotal,
  });

  const addonCount = (selectedAddOns || []).length;
  const totalPayable = grandTotal;

  return (
    <div className="cart-sidebar">
      <div className="cart-sidebar-header">
        <h4 className="cart-sidebar-title">
          <svg
            className="cart-sidebar-title-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Booking Cart Summary
        </h4>
      </div>

      <div className="cart-body-scroll">
        {/* Selected Property */}
        <div className="cart-section">
          <div className="cart-section-header">
            <h5 className="cart-section-title">Selected Property</h5>
            <span style={modifyLinkStyle} onClick={onModifyRooms}>
              Modify
            </span>
          </div>
          <p className="cart-line">{selectedPropertyName || "—"}</p>
        </div>

        {/* Stay & Guests */}
        <div className="cart-section">
          <h5 className="cart-section-title">Stay &amp; Guests</h5>

          <div className="cart-stay-summary">
            <div className="cart-stay-date">
              <span className="cart-stay-date-value">
                {formatDisplayDate(selectedStartDate) || "—"}
              </span>
              <span className="cart-stay-date-label">Check-in</span>
            </div>
            <div className="cart-stay-middle">
              <span className="cart-stay-nights">
                {nights} Night{nights === 1 ? "" : "s"}
              </span>
              <span className="cart-stay-line" aria-hidden="true" />
              <span className="cart-stay-guests">{guestsSummary}</span>
            </div>
            <div className="cart-stay-date cart-stay-date-right">
              <span className="cart-stay-date-value">
                {formatDisplayDate(selectedEndDate) || "—"}
              </span>
              <span className="cart-stay-date-label">Check-out</span>
            </div>
          </div>

          <div className="cart-stay-links">
            <span
              style={modifyLinkStyle}
              onClick={() => setShowDateModal(true)}
            >
              Modify Dates
            </span>
            <span className="cart-stay-links-divider">|</span>
            <span
              style={modifyLinkStyle}
              onClick={() => setShowGuestsModal(true)}
            >
              Modify Guests
            </span>
            {!promoCodeContext && (
              <>
                <span className="cart-stay-links-divider">|</span>
                <span
                  style={modifyLinkStyle}
                  onClick={() => setShowPromoInput((v) => !v)}
                >
                  {showPromoInput ? "Cancel Promo" : "Add Promocode"}
                </span>
              </>
            )}
          </div>

          {(showPromoInput || promoCodeContext) && (
            <CouponComponent
              isOpen={showPromoInput}
              onClose={() => setShowPromoInput(false)}
            />
          )}
        </div>

        {/* Accommodation & Rate — one line per room slot. Mirrors Filterbar.js's
            cart-sidebar summary: an empty slot renders a clickable "Room N :
            Select Room" placeholder, a filled slot renders its name/package/
            price plus "Modify" — both target that exact slot via
            onModifyRooms(index), which sets StayContext's
            activeRoomSlotIndex before navigating back to step 1. */}
        <div className="cart-section">
          <h5 className="cart-section-title">Accommodation &amp; Rate</h5>
          {(selectedRoom || []).length > 0 ? (
            (selectedRoom || []).map((room, index) =>
              room?.roomId ? (
                <div
                  // Keyed by the room SLOT's own identity (room.id, same as
                  // the placeholder branch below), not by which room+rate
                  // was picked for it — two different slots picking the
                  // identical room+rate (e.g. two "Deluxe Room, Best
                  // Available Rate" bookings) previously collided on the
                  // same key since roomId+rateId was all it was keyed on.
                  key={room?.id ?? index}
                >
                  {/* Ported from real Amritara's CartOverview.js (~598-622)
                      — a room picked before a "Modify Dates"/"Modify Guests"
                      edit can end up over that room's own capacity (e.g. the
                      guest count went up but the room selection didn't
                      change, or useRepriceSelectedRooms.js's same-room
                      reprice kept a room that no longer fits). Purely
                      informational here; DetailStep.jsx's proceedToPay
                      enforces the same three limits at submit time so this
                      can't silently reach payment. */}
                  {(room?.adults || 0) + (room?.children || 0) > room?.maxGuest && (
                    <p className="cart-room-limit-warning">
                      <span className="cart-room-limit-warning-mark">*</span> Maximum{" "}
                      {room?.maxGuest} guests are allowed
                    </p>
                  )}
                  {room?.adults > room?.maxAdult && (
                    <p className="cart-room-limit-warning">
                      <span className="cart-room-limit-warning-mark">*</span> Maximum{" "}
                      {room?.maxAdult} adults are allowed
                    </p>
                  )}
                  {room?.children > room?.maxChildren && (
                    <p className="cart-room-limit-warning">
                      <span className="cart-room-limit-warning-mark">*</span> Maximum{" "}
                      {room?.maxChildren} children are allowed
                    </p>
                  )}
                  <div className="cart-room-row">
                    <div>
                      <p className="cart-room-name">
                        Room {index + 1}: {room.roomName}
                      </p>
                      <p className="cart-room-package">{room.roomPackage}</p>
                    </div>
                    <div className="cart-room-right">
                      <p className="cart-room-price">
                        {formatCurrency(
                          room?.packageRate ?? room?.roomRateWithTax,
                        )}
                      </p>
                      <span
                        style={modifyLinkStyle}
                        onClick={() => onModifyRooms?.(index)}
                      >
                        Modify
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="cart-room-row cart-room-row-placeholder"
                  key={room?.id ?? index}
                >
                  <span
                    className="cart-room-select-link"
                    onClick={() => onModifyRooms?.(index)}
                  >
                    Room {index + 1} : Select Room
                  </span>
                </div>
              ),
            )
          ) : (
            <p className="cart-line cart-line-muted">No rooms selected.</p>
          )}
        </div>

        {/* Cancellation Policy — omitted entirely when there's nothing to show */}
        {cancellationPolicyState ? (
          <div className="cart-section">
            <h5 className="cart-section-title">Cancellation Policy</h5>
            <p className="cart-line cart-line-muted">
              {isPolicyExpanded || cancellationPolicyState.length <= 60
                ? cancellationPolicyState
                : `${cancellationPolicyState.slice(0, 60)}…`}{" "}
              {cancellationPolicyState.length > 60 && (
                <span
                  style={modifyLinkStyle}
                  onClick={() => setIsPolicyExpanded((v) => !v)}
                >
                  {isPolicyExpanded ? "Show Less" : "Read More"}
                </span>
              )}
            </p>
          </div>
        ) : null}

        {/* Pricing breakdown — two expandable groups (Base Stay Cost / GST),
            each decomposed per-night. Real Amritara's own StayStep.js cart
            widget (~1657-1685) breaks "Price" down the same way — per room,
            per actual calendar date — because nightly OBP rates genuinely
            differ (weekday/weekend pricing etc); computeStayTotals's
            perNightBreakdown now sums each room's own per-date rate data
            (getRoomNightlyBreakdown) rather than repeating one flat
            rate-times-nights figure, so what's shown here matches what
            real Amritara actually charges for a stay with varying nightly
            rates. */}
        <div className="cart-section">
          <div
            className="cart-accordion-row"
            onClick={() => setIsBaseCostOpen((v) => !v)}
          >
            <span className="cart-accordion-label">
              Base Stay Cost ({nights} night{nights === 1 ? "" : "s"}){" "}
              <ChevronIcon open={isBaseCostOpen} />
            </span>
            <span className="cart-accordion-value">
              {formatCurrency(roomBaseCost)}
            </span>
          </div>

          {isBaseCostOpen && (
            <div className="cart-accordion-body">
              {perNightBreakdown.map((night, i) => {
                const nightTotal = night.rooms.reduce(
                  (sum, r) => sum + r.amount,
                  0,
                );
                return (
                  <div className="cart-night-block" key={i}>
                    <div className="cart-night-header">
                      <span>
                        Night {i + 1}: {formatNightLabel(night.date)}
                      </span>
                      <span>{formatCurrency(nightTotal)}</span>
                    </div>
                    {night.rooms.map((r, ri) => (
                      <div className="cart-night-line" key={ri}>
                        <span>
                          Room {ri + 1}: {r.roomName}
                        </span>
                        <span>{formatCurrency(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {addonCount > 0 ? (
                <div className="cart-night-header cart-night-header-total">
                  <span>Stay Add-ons ({addonCount})</span>
                  <span>{formatCurrency(addonAmount)}</span>
                </div>
              ) : null}
            </div>
          )}

          <div
            className="cart-accordion-row"
            onClick={() => setIsGstOpen((v) => !v)}
          >
            <span className="cart-accordion-label">
              Taxes &amp; Fees <ChevronIcon open={isGstOpen} />
            </span>
            <span className="cart-accordion-value">
              {formatCurrency(taxesAndFeesTotal)}
            </span>
          </div>

          {isGstOpen && (
            <div className="cart-accordion-body">
              <div className="cart-night-line">
                <span>GST ({gstPercent}%)</span>
                <span>{formatCurrency(gstTotal)}</span>
              </div>
              {/* Extra-child/extra-adult surcharge (computeRoomSurcharge) —
                  real Amritara's cart shows this as its own "Extra Child
                  Rate" line alongside GST under "Taxes & Fees", not folded
                  invisibly into the base room price. */}
              {extraChargeTotal > 0 ? (
                <div className="cart-night-line">
                  <span>Extra Child Rate</span>
                  <span>{formatCurrency(extraChargeTotal)}</span>
                </div>
              ) : null}
              <div className="cart-night-line">
                <span>CGST ({Math.round(gstPercent / 2)}%)</span>
                <span>{formatCurrency(gstTotal / 2)}</span>
              </div>
              <div className="cart-night-line">
                <span>SGST ({Math.round(gstPercent / 2)}%)</span>
                <span>{formatCurrency(gstTotal / 2)}</span>
              </div>
              {perNightBreakdown.map((night, i) => {
                const nightTax =
                  night.rooms.reduce((sum, r) => sum + r.tax, 0) +
                  night.addonTax;
                return (
                  <div className="cart-night-block" key={i}>
                    <div className="cart-night-header">
                      <span>
                        Night {i + 1}: {formatNightLabel(night.date)} GST
                      </span>
                      <span>{formatCurrency(nightTax)}</span>
                    </div>
                    {night.rooms.map((r, ri) => (
                      <div className="cart-night-line" key={ri}>
                        <span>
                          Room {ri + 1}: {r.roomName}
                        </span>
                        <span>{formatCurrency(r.tax)}</span>
                      </div>
                    ))}
                    {night.addonTax > 0 ? (
                      <div className="cart-night-line">
                        <span>Stay Add-ons GST ({gstPercent}%)</span>
                        <span>{formatCurrency(night.addonTax)}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Aggregate member-rate savings across every selected room — real
              Amritara's StayStep.js shows this same rolled-up "You Saved"
              figure (~1483/1488) above its cart total; this package
              computed the per-room number but never surfaced the sum. */}
          {totalSavings > 0 ? (
            <div className="cart-price-row cart-price-row-discount">
              <span>You Saved</span>
              <span>{formatCurrency(totalSavings)}</span>
            </div>
          ) : null}

          {/* No discount amount is shown here on purpose — there isn't one
              to show. Whatever a valid promo code actually discounts is
              applied server-side, baked directly into the room rates
              StayStep re-fetches once promoCodeContext changes; there's no
              separate client-known figure to display next to it (a
              hardcoded em-dash used to sit here claiming a discount with
              no real value behind it — misleading, since applying a promo
              code changed nothing else the guest could see). */}
          {promoCodeContext ? (
            <div className="cart-price-row cart-price-row-discount">
              <span>Promo code applied</span>
              <span className="cart-line-muted">reflected in rate above</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="cart-sidebar-footer">
        <div className="cart-total-row">
          <span>Total Stay Cost</span>
          <span className="cart-total-amount">
            {formatCurrency(totalPayable)}
          </span>
        </div>
        {/* Submits the guest-details form (Wizard.jsx's step 2) from outside
            it via the HTML form attribute — there's no separate card-entry
            step to navigate to first, matching real Amritara's "Confirm &
            Pay" flow (see DetailStep.jsx). */}
        <button
          type="submit"
          form="be-guest-details-form"
          className="cart-pay-btn"
        >
          Pay &amp; Confirm Booking <span aria-hidden="true">&rarr;</span>
        </button>
      </div>

      {/* Both modals read/write SearchContext directly (no local copy of
          the dates/guests), so a change made here is reflected everywhere
          else in the app immediately — the search bar, StayStep's search,
          etc. */}
      <DateRangeModal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
      />
      <GuestsModal
        isOpen={showGuestsModal}
        onClose={() => setShowGuestsModal(false)}
      />
    </div>
  );
}
