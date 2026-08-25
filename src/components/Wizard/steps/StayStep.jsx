"use client";

import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useConfig } from "../../../config/configContext.js";
import { useSearchContext } from "../../../context/SearchContext.js";
import { useStayContext } from "../../../context/StayContext.js";
import { useCartContext } from "../../../context/CartContext.js";
import { useBookingEngineAuth } from "../../../context/AuthContext.js";
import { getRoomsRates, getInventory } from "../../../api/rates.js";
import { postBookingWidged } from "../../../api/tracking.js";
import {
  normalizeRateName,
  getGuestRateFromObp,
  findMemberRatePlan,
  computeRatePlanTotals,
  buildRoomSelection,
  validateGuestLimits,
  validateRoomInventorySelection,
  mergeRoomContentWithRates,
} from "../../../utils/ratePricing.js";
import { formatIsoDate } from "../../../utils/date.js";
import { LoyaltyUnlockModal } from "../../Auth/LoyaltyUnlockModal.js";
import { Button } from "../../shared/Button.js";
import { ImageSlider } from "../../shared/ImageSlider.js";
import "./StayStep.css";

/**
 * StayStep — wizard step 1: room + rate-plan selection.
 *
 * Visual spec ported 1:1 from bawa-hotels-next's booking/page.js (room-row
 * card -> CSS-grid-rows accordion -> horizontal rate-plan carousel ->
 * Standard/Member rate-option toggle). Business logic delegates entirely to
 * ../../../utils/ratePricing.js, which was ported from the legacy
 * Amritara_New_NextJs Filterbar.js (RateData/Mapping filtering,
 * findMemberRatePlan's name-based pairing, guest-limit / inventory
 * validation, and the selection object shape merged onto StayContext's
 * `selectedRoom` array).
 *
 * Field-shape notes (verified against Filterbar.js, since the STAAH
 * response isn't formally documented anywhere in this package):
 *  - The room/rate search is actually TWO API calls merged together: CMS
 *    "content" (getRoomsRates -> PropertyList[0], has RoomData/RateData/
 *    Mapping but no live pricing) and STAAH "inventory" (getInventory ->
 *    Product[0].Rooms, has live per-date OBP pricing but no room content).
 *    `mergeRoomContentWithRates` (utils/ratePricing.js) combines them into
 *    the single `property` shape this file renders from, ported from
 *    Filterbar.js's checkIfBothReady (~669-898) — see that function's doc
 *    comment for the full field-level detail.
 *  - `property.RoomData[]` items (post-merge, exposed here as
 *    `filteredRooms`): RoomId, RoomName, RoomDescription (HTML), Images[],
 *    MaxGuest, MaxAdult, MaxChildren, MinInventory, RackRate,
 *    RatePlans[{ RateId, Rates }]. There is NO room-size/sq-ft or bed-type
 *    field anywhere in the legacy source, so the meta row only ever shows
 *    guest-capacity figures (see Filterbar.js ~2758-2820, which reads only
 *    MaxGuest/MaxAdult/MaxChildren/RoomName/Images off a room).
 *  - `property.RateData[]` items: RateId, RateName, MappingDisplayName
 *    (used as the rate-card title, not RateName — Filterbar.js ~5573),
 *    RateDescription (HTML "inclusions" blob, used as-is at ~5594-5598).
 *  - `property.Mapping[]` items: RoomId, RateId, ApplicableGuest,
 *    ApplicableAdult, ApplicableChild.
 *  - Cancellation policy text comes from StayContext's
 *    `cancellationPolicyPackage` array, matched by RateId (Filterbar.js
 *    ~5605); populated by the merge's `uniqueRatePlans` result below.
 */

const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** Decodes named/numeric HTML entities without relying on `document` (this
 * runs during SSR too, for a client component's first render). */
function decodeHtmlEntities(text = "") {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match,
    );
}

function stripHtmlTags(html = "") {
  return decodeHtmlEntities(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInclusionItems(rate, cancellationText) {
  const html = rate?.RateDescription || "";
  const liMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtmlTags(m[1]))
    .filter(Boolean);
  if (liMatches.length) return liMatches.slice(0, 10);

  const plain = stripHtmlTags(html);
  if (plain) {
    const parts = plain
      .split(/(?<=[.;])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    if (parts.length) return parts.slice(0, 8);
  }

  return cancellationText ? [cancellationText] : [];
}

/** Real STAAH room-content fields beyond what was originally documented
 * here: `RoomSize` ("450:sqft" or sometimes "" for unpopulated variants),
 * `Bedding` (an array, empty for every room sampled across several real
 * Amritara properties — rendered only when actually present, never
 * fabricated), and `RoomAmenities` (a { categoryName: string[] } map) —
 * confirmed directly against a live GetRoomsRates response. */
function parseRoomSize(roomSize) {
  if (!roomSize) return null;
  const [value, unit] = String(roomSize).split(":");
  const numeric = parseFloat(value);
  if (!numeric) return null;
  const unitLabel = (unit || "sqft").toLowerCase() === "sqm" ? "SQM" : "SQ FT";
  return `${Math.round(numeric)} ${unitLabel}`;
}

function formatBedding(bedding) {
  if (!Array.isArray(bedding) || bedding.length === 0) return null;
  const labels = bedding
    .map((b) =>
      typeof b === "string" ? b : b?.BedType || b?.Description || b?.Name,
    )
    .filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

function SizeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function BedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
      <path d="M2 18v2" />
      <path d="M22 18v2" />
      <path d="M4 10V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v4" />
      <path d="M13 10V8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function GuestsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** "Read More" popup — full room description + amenities, all real STAAH
 * content (RoomDescription/RoomSize/Bedding/RoomAmenities), not bawa's
 * abbreviated card copy. */
function RoomDetailsModal({ room, onClose }) {
  if (!room) return null;

  const sizeLabel = parseRoomSize(room.RoomSize);
  const beddingLabel = formatBedding(room.Bedding);
  const fullDescription = stripHtmlTags(room.RoomDescription || "");
  const amenityGroups = Object.entries(room.RoomAmenities || {}).filter(
    ([, items]) => Array.isArray(items) && items.length,
  );

  return (
    <div className="be-room-modal-backdrop" onClick={onClose}>
      <div className="be-room-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="be-room-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        {room.Images?.length > 0 && (
          <ImageSlider images={room.Images} className="be-room-modal-img" />
        )}

        <div className="be-room-modal-body">
          <h3 className="be-room-modal-title">{room.RoomName}</h3>

          <div className="be-room-row-meta">
            {sizeLabel && (
              <span>
                <SizeIcon /> {sizeLabel}
              </span>
            )}
            {beddingLabel && (
              <span>
                <BedIcon /> {beddingLabel}
              </span>
            )}
            {room.MaxGuest ? (
              <span>
                <GuestsIcon /> Max Occupancy: {room.MaxGuest} Guests
              </span>
            ) : null}
          </div>

          {fullDescription && (
            <p className="be-room-modal-desc">{fullDescription}</p>
          )}

          {amenityGroups.map(([category, items]) => (
            <div className="be-room-modal-amenity-group" key={category}>
              <h4>{category}</h4>
              <div className="be-room-modal-amenity-list">
                {items.map((item, i) => (
                  <span className="be-room-modal-amenity-item" key={i}>
                    <CheckIcon /> {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function classifyCancellation(text = "") {
  const lower = text.toLowerCase();
  if (!lower) return null;
  if (
    lower.includes("non-refundable") ||
    lower.includes("non refundable") ||
    lower.includes("nonrefundable")
  ) {
    return { label: "Non-Refundable", cls: "be-non-ref" };
  }
  if (
    lower.includes("free cancellation") ||
    lower.includes("fully refundable") ||
    lower.includes("free of charge")
  ) {
    return { label: "Free Cancellation", cls: "be-free" };
  }
  return null;
}

/** Standard (non-member) rate plans mapped to a room, mirroring the
 * RateData.filter(...).map(...) block in Filterbar.js (~5400-5456). */
function getStandardRateEntries(property, room) {
  const rateData = property?.RateData || [];
  const mapping = property?.Mapping || [];

  return rateData
    .filter(
      (rate) =>
        !normalizeRateName(rate?.RateName).startsWith("member ") &&
        mapping.some(
          (m) => m.RoomId === room?.RoomId && m.RateId === rate?.RateId,
        ),
    )
    .map((rate) => {
      const rateMapping = mapping.find(
        (m) => m.RoomId === room?.RoomId && m.RateId === rate?.RateId,
      );
      const ratePlan = room?.RatePlans?.find(
        (rp) => rp?.RateId === rateMapping?.RateId,
      );
      return { rate, mapping: rateMapping, ratePlan };
    })
    .filter((entry) => entry.ratePlan);
}

/** Whether a room has ANY computable rate at all for these dates — mirrors
 * Filterbar.js's room-list `minRate` computation (~4721-4736), which loops
 * every one of the room's RatePlans (standard AND member alike, unfiltered
 * — this is the raw availability check, not the display price) taking each
 * plan's first date's 1-adult OBP rate, and keeps the smallest positive
 * one. A room can have MinInventory > 0 (bookable count-wise) but still
 * have no valid rate returned for the searched dates; real Amritara drops
 * such a room from the list entirely rather than showing a blank/zero
 * price (see the room-list filter above this function's call site).
 * Returns null when no rate plan has any positive rate. */
function getRoomMinRate(room) {
  let minRate = null;
  (room?.RatePlans || []).forEach((plan) => {
    const firstDateKey = Object.keys(plan?.Rates || {})[0];
    const obp = plan?.Rates?.[firstDateKey]?.OBP;
    const guestRate = getGuestRateFromObp(obp, 1);
    const rate = parseFloat(guestRate?.RateBeforeTax || "0");
    if (rate > 0 && (minRate === null || rate < minRate)) {
      minRate = rate;
    }
  });
  return minRate;
}

/** Room-card "starting from" price: cheapest 1-adult rate across all of the
 * room's standard rate plans (mirrors Filterbar.js's `minRate` ~5457-5461) —
 * AND, if any of those rate plans has a member-rate sibling (see
 * findMemberRatePlan), the member price too, since a member rate is always
 * the cheaper of the pair. Real Amritara's own `minRate` never considers
 * member rates for this card-level figure (it's shown pre-expand, before a
 * guest has picked a specific rate) — this is a deliberate addition beyond
 * that, so the card can advertise the lower member price (with a "Member
 * Rate" badge) up front rather than only revealing it once the card is
 * expanded, the same way the expanded rate cards already show a locked
 * member row alongside the standard one regardless of login state.
 * Returns null when no rate exists at all, otherwise
 * { price: number, isMemberRate: boolean }. */
function getRoomFromPrice(property, room) {
  const entries = getStandardRateEntries(property, room);
  let min = Infinity;
  let minIsMemberRate = false;

  entries.forEach(({ rate, ratePlan }) => {
    const firstKey = Object.keys(ratePlan?.Rates || {})[0];
    const obp = ratePlan?.Rates?.[firstKey]?.OBP;
    const guestRate = getGuestRateFromObp(obp, 1);
    const val = parseFloat(guestRate?.RateBeforeTax || "0");
    if (val > 0 && val < min) {
      min = val;
      minIsMemberRate = false;
    }

    const { memberRatePlan } = findMemberRatePlan(property, room, rate);
    if (!memberRatePlan) return;
    const memberFirstKey = Object.keys(memberRatePlan?.Rates || {})[0];
    const memberObp = memberRatePlan?.Rates?.[memberFirstKey]?.OBP;
    const memberGuestRate = getGuestRateFromObp(memberObp, 1);
    const memberVal = parseFloat(memberGuestRate?.RateBeforeTax || "0");
    if (memberVal > 0 && memberVal < min) {
      min = memberVal;
      minIsMemberRate = true;
    }
  });

  return isFinite(min) ? { price: Math.round(min), isMemberRate: minIsMemberRate } : null;
}

function calcNights(start, end) {
  if (!start || !end) return 1;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

function toIsoDateParam(value) {
  if (!value) return "";
  if (value instanceof Date) return formatIsoDate(value);
  const asDate = new Date(value);
  return isNaN(asDate.getTime()) ? String(value) : formatIsoDate(asDate);
}

function formatMoney(n) {
  return Math.round(n || 0).toLocaleString("en-IN");
}

function CheckIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 8.5L6.5 12L13 4.5"
        stroke="var(--be-color-primary, #846836)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockClosedIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill="var(--be-color-primary, #846836)"
      />
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke="var(--be-color-primary, #846836)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill="none"
        stroke="#27ae60"
        strokeWidth="1.5"
      />
      <path
        d="M5 7V5a3 3 0 0 1 5.5-1.6"
        stroke="#27ae60"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One rate-plan card inside the horizontal carousel: title/cancellation
 * pill header, scrollable inclusions, Standard-vs-Member toggle + select
 * button footer. */
function RateCard({
  room,
  property,
  rate,
  mapping,
  ratePlan,
  adults,
  nights,
  cancellationPolicyPackage,
  activeTab,
  onSetActiveTab,
  onSelectStandard,
  onSelectMember,
  isStandardSelected,
  isMemberSelected,
  animating,
  user,
}) {
  const { memberMapping, memberRate, memberRatePlan } = findMemberRatePlan(
    property,
    room,
    rate,
  );

  const standardTotals = computeRatePlanTotals(ratePlan, mapping, adults);
  const memberTotals = memberRatePlan
    ? computeRatePlanTotals(memberRatePlan, memberMapping, adults)
    : null;

  const memberSavings = memberTotals
    ? Math.max(
        0,
        Math.round(standardTotals.totalCartValue - memberTotals.totalCartValue),
      )
    : 0;

  const cancellationText =
    (cancellationPolicyPackage || []).find(
      (rp) => String(rp?.RateId) === String(rate?.RateId),
    )?.CancellationPolicy?.Description || "";
  const cancellation = classifyCancellation(cancellationText);
  const inclusionItems = extractInclusionItems(rate, cancellationText);

  const effectiveTab = activeTab ?? (memberRatePlan ? "member" : "standard");
  const isSelected =
    effectiveTab === "member" ? isMemberSelected : isStandardSelected;

  return (
    <div className={`be-rate-card-col${isSelected ? " be-selected" : ""}`}>
      <div className="be-rate-card-header">
        <h4 className="be-rate-card-title">
          {rate?.MappingDisplayName || rate?.RateName}
        </h4>
        {cancellation && (
          <span className={`be-cancellation-pill ${cancellation.cls}`}>
            {cancellation.label}
          </span>
        )}
      </div>

      <div className="be-rate-card-inclusions-wrapper">
        <div className="be-rate-card-inclusions">
          {inclusionItems.map((item, i) => (
            <div className="be-rate-card-inclusion-item" key={i}>
              <span className="be-inclusion-check-wrap">
                <CheckIcon />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="be-rate-card-pricing-footer">
        <div className="be-rate-options-container">
          <div
            className={`be-rate-option-row${effectiveTab === "standard" ? " be-active" : ""}`}
            onClick={() => onSetActiveTab("standard")}
            role="button"
            tabIndex={0}
          >
            <div className="be-rate-option-left">
              <span className="be-radio-circle">
                {effectiveTab === "standard" && (
                  <span className="be-radio-dot" />
                )}
              </span>
              <span className="be-rate-option-meta">
                <span className="be-rate-option-label">Standard Rate</span>
              </span>
            </div>
            <span className="be-rate-option-price">
              &#8377;{formatMoney(standardTotals.totalCartValue)}
              <div className="be-rate-unit">
                for {nights} night{nights > 1 ? "s" : ""}
              </div>
            </span>
          </div>

          {memberRatePlan && memberMapping && (
            <div
              className={`be-rate-option-row be-member-row${effectiveTab === "member" ? " be-active" : ""}${
                animating ? " be-unlock-sweep" : ""
              }`}
              onClick={() => onSetActiveTab("member")}
              role="button"
              tabIndex={0}
            >
              <div className="be-rate-option-left">
                <span className="be-radio-circle">
                  {effectiveTab === "member" && (
                    <span className="be-radio-dot" />
                  )}
                </span>
                <span className="be-rate-option-meta">
                  <span className="be-rate-option-label be-member-label">
                    {user ? <LockOpenIcon /> : <LockClosedIcon />}
                    Member Rate
                  </span>
                  {memberSavings > 0 && (
                    <span className="be-rate-option-savings">
                      Save &#8377;{formatMoney(memberSavings)}
                    </span>
                  )}
                </span>
              </div>
              <span
                className={`be-rate-option-price be-member-price${animating ? " be-unlocking-flash" : ""}`}
              >
                &#8377;{formatMoney(memberTotals.totalCartValue)}
                <div className="be-rate-unit">
                  for {nights} night{nights > 1 ? "s" : ""}
                </div>
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`be-rate-select-btn${isSelected ? " be-selected" : ""}`}
          onClick={() =>
            effectiveTab === "member"
              ? onSelectMember({
                  memberMapping,
                  memberRate,
                  savings: memberSavings,
                  standardMapping: mapping,
                  standardRate: rate,
                })
              : onSelectStandard()
          }
        >
          {isSelected
            ? "Selected"
            : effectiveTab === "member"
              ? user
                ? "Book Member Rate"
                : "Unlock Member Rate"
              : "Select Rate"}
        </button>
      </div>
    </div>
  );
}

/** One room-type row: image + details + "View Rates" toggle, expanding
 * (via the CSS grid-rows trick, driven declaratively off `isExpanded`) into
 * the horizontal rate-plan carousel. */
function RoomRow({
  room,
  property,
  isExpanded,
  onToggleExpand,
  isActiveSlotRoom,
  activeRoomIndex,
  fromPrice,
  fromPriceIsMemberRate,
  standardEntries,
  adults,
  nights,
  cancellationPolicyPackage,
  activeTabMap,
  onSetActiveTab,
  activeSlotEntry,
  onSelectStandard,
  onSelectMember,
  animatingUnlockKey,
  user,
  onOpenDetails,
}) {
  const gridRef = useRef(null);
  const expandWrapperRef = useRef(null);
  const fullDescription = stripHtmlTags(room?.RoomDescription || "");
  const showNav = standardEntries.length > 3;
  const sizeLabel = parseRoomSize(room?.RoomSize);
  const beddingLabel = formatBedding(room?.Bedding);

  // Auto-scroll to the newly-revealed rate plans on expand — ported exactly
  // from bawa-hotels-next's real toggleRoomExpansion (~458-492): scroll the
  // wrapper into view once the CSS grid-rows expand transition finishes
  // (360ms, just past the 0.35s transition — see .be-rate-plans-expand-
  // wrapper's own transition duration), then nudge an extra 80px after
  // another 300ms. Collapse does nothing (bawa doesn't scroll on collapse
  // either).
  useEffect(() => {
    if (!isExpanded) return;
    let innerTimeout;
    const outerTimeout = setTimeout(() => {
      expandWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      innerTimeout = setTimeout(() => {
        window.scrollBy({ top: 80, behavior: "smooth" });
      }, 300);
    }, 360);
    return () => {
      clearTimeout(outerTimeout);
      clearTimeout(innerTimeout);
    };
  }, [isExpanded]);

  const scrollByCard = (dir) => {
    const el = gridRef.current;
    if (!el) return;
    const card = el.querySelector(".be-rate-card-col");
    const cardWidth = card ? card.getBoundingClientRect().width : 300;
    el.scrollBy({ left: dir * (cardWidth + 19.2), behavior: "smooth" });
  };

  return (
    <div
      className={`be-room-row-card${isActiveSlotRoom ? " be-selected" : ""}`}
    >
      <div className="be-room-row-top">
        <ImageSlider images={room?.Images} className="be-room-row-img" />

        <div className="be-room-row-details">
          <div>
            <div className="be-room-row-header">
              <h3 className="be-room-row-name">{room?.RoomName}</h3>
            </div>
            <div className="be-room-row-meta">
              {sizeLabel && (
                <span>
                  <SizeIcon /> {sizeLabel}
                </span>
              )}
              {beddingLabel && (
                <span>
                  <BedIcon /> {beddingLabel}
                </span>
              )}
              {room?.MaxGuest ? (
                <span>
                  <GuestsIcon /> Max Occupancy: {room.MaxGuest} Guests
                </span>
              ) : null}
            </div>
            {fullDescription && (
              <div className="be-room-row-desc-row">
                <p className="be-room-row-desc">{fullDescription}</p>
                <button
                  type="button"
                  className="be-room-read-more"
                  onClick={() => onOpenDetails?.(room)}
                >
                  Read More
                </button>
              </div>
            )}
          </div>

          <div className="be-room-price-select-row">
            <div className="be-room-row-price-container">
              <span className="be-room-row-price-label">
                Rates Starting From
              </span>
              <span className="be-room-row-price">
                {fromPrice != null ? `₹${formatMoney(fromPrice)}` : "—"}
                <span> / night</span>
                {fromPrice != null && fromPriceIsMemberRate && (
                  <span className="be-member-rate-badge">Member Rate</span>
                )}
              </span>
            </div>
            <button
              type="button"
              className={`be-btn-select-room${isExpanded ? " be-expanded" : ""}`}
              onClick={onToggleExpand}
            >
              {isExpanded ? "Hide Rates" : "View Rates"}
              <span className="be-arrow">&#8594;</span>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={expandWrapperRef}
        className={`be-rate-plans-expand-wrapper${isExpanded ? " be-expanded" : ""}`}
      >
        <div className="be-rate-plans-container">
          {/* be-rate-plans-container is the grid item of the 0fr/1fr collapse
              trick above and must stay padding-free (see StayStep.css) — all
              the actual visual padding lives on this inner div instead, so
              it can go to true 0 height when collapsed instead of leaving a
              fixed-size gap between room cards. */}
          <div className="be-rate-plans-container-inner">
            {standardEntries.length === 0 ? (
              <p className="be-rate-plans-empty">
                No rate plans available for this room.
              </p>
            ) : (
              <div className="be-rate-plans-carousel-wrapper">
                {showNav && (
                  <button
                    type="button"
                    className="be-carousel-nav-btn be-prev"
                    onClick={() => scrollByCard(-1)}
                    aria-label="Previous rate plans"
                  >
                    &#8249;
                  </button>
                )}

                <div className="be-rate-plans-grid" ref={gridRef}>
                  {standardEntries.map(({ rate, mapping, ratePlan }) => {
                    // Scoped by activeRoomIndex, not just room+rate — two
                    // room slots booking the identical room type and rate
                    // plan (a common case: 2x "Standard Room, Best
                    // Available Rate") used to share the same cardKey, so
                    // activeTabMap's "which tab is being previewed" (member
                    // vs standard) and the unlock-sweep animation leaked
                    // from whichever slot was edited last into every other
                    // slot showing that same room+rate — e.g. switching to
                    // an empty Room 2 that happens to show the same room
                    // Room 1 was just booked under would render the member
                    // rate's radio as visually "active" even though nothing
                    // has actually been picked for Room 2 yet. The true
                    // selected/confirmed state (isStandardSelected/
                    // isMemberSelected below) was never affected by this —
                    // it already compares against activeSlotEntry, which is
                    // correctly per-slot — only the tab-preview UI state
                    // was leaking.
                    const cardKey = `${activeRoomIndex}_${room.RoomId}_${rate.RateId}`;
                    const { memberRate } = findMemberRatePlan(
                      property,
                      room,
                      rate,
                    );

                    const isStandardSelected =
                      activeSlotEntry?.roomId === room.RoomId &&
                      activeSlotEntry?.rateId === rate.RateId &&
                      !activeSlotEntry?.isMemberRate;

                    const isMemberSelected = Boolean(
                      memberRate &&
                      activeSlotEntry?.roomId === room.RoomId &&
                      activeSlotEntry?.rateId === memberRate.RateId &&
                      activeSlotEntry?.isMemberRate,
                    );

                    return (
                      <RateCard
                        key={cardKey}
                        room={room}
                        property={property}
                        rate={rate}
                        mapping={mapping}
                        ratePlan={ratePlan}
                        adults={adults}
                        nights={nights}
                        cancellationPolicyPackage={cancellationPolicyPackage}
                        activeTab={activeTabMap[cardKey]}
                        onSetActiveTab={(tab) => onSetActiveTab(cardKey, tab)}
                        onSelectStandard={() =>
                          onSelectStandard(room, mapping, rate)
                        }
                        onSelectMember={({
                          memberMapping,
                          memberRate,
                          savings,
                          standardMapping,
                          standardRate,
                        }) =>
                          onSelectMember(
                            room,
                            memberMapping,
                            memberRate,
                            savings,
                            cardKey,
                            standardMapping,
                            standardRate,
                          )
                        }
                        isStandardSelected={isStandardSelected}
                        isMemberSelected={isMemberSelected}
                        animating={animatingUnlockKey === cardKey}
                        user={user}
                      />
                    );
                  })}
                </div>

                {showNav && (
                  <button
                    type="button"
                    className="be-carousel-nav-btn be-next"
                    onClick={() => scrollByCard(1)}
                    aria-label="Next rate plans"
                  >
                    &#8250;
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only progress stepper for multi-room bookings — "Room 1", "Room 2"…
 * circles, ported from Filterbar.js's step-wizard-card-section (~4586-4627).
 * Real Amritara's circles carry no click handler (the switcher is the
 * per-room "Select Room"/"Modify" line in the cart sidebar instead, which
 * only appears from step 2 onward) — this mirrors that exactly: status
 * display only, not interactive. */
function RoomSlotStepper({ selectedRoom, activeIndex, onSelectSlot }) {
  const rooms = selectedRoom || [];
  if (rooms.length < 2) return null;

  return (
    <div className="be-room-slot-stepper">
      {rooms.map((room, i) => {
        const completed = Boolean(room?.roomId);
        const active = i === activeIndex;
        return (
          <div className="be-room-slot-step-wrap" key={room?.id ?? i}>
            <button
              type="button"
              className="be-room-slot-step-btn"
              onClick={() => onSelectSlot?.(i)}
              aria-label={`Switch to Room ${i + 1}${completed ? " (edit selection)" : ""}`}
              aria-current={active}
            >
              <span
                className={`be-room-slot-circle${completed ? " be-completed" : ""}${active ? " be-active" : ""}`}
              >
                {completed ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8.5L6.5 12L13 4.5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="be-room-slot-label">Room {i + 1}</span>
            </button>
            {i < rooms.length - 1 && (
              <div
                className={`be-room-slot-line${completed ? " be-completed" : ""}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StayStep({ onRoomsSelected }) {
  const config = useConfig();
  const {
    selectedPropertyId,
    selectedStartDate,
    selectedEndDate,
    searchRooms,
  } = useSearchContext();
  const { promoCodeContext } = useCartContext();
  const {
    filteredRooms,
    setFilteredRooms,
    rateResponse,
    setRateResponse,
    selectedRoom,
    setSelectedRoom,
    cancellationPolicyPackage,
    setCancellationPolicyPackage,
    setCancellationPolicyState,
    setIsMemberRate,
    setIsMemberRateSelected,
    activeRoomSlotIndex: currentRoomIndex,
    setActiveRoomSlotIndex: setCurrentRoomIndex,
  } = useStayContext();
  const { user } = useBookingEngineAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const [expandedRoomIds, setExpandedRoomIds] = useState(() => new Set());
  const [activeTabMap, setActiveTabMap] = useState({});
  const [pendingMemberSelection, setPendingMemberSelection] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [animatingUnlockKey, setAnimatingUnlockKey] = useState(null);
  const [detailsRoom, setDetailsRoom] = useState(null);
  // Purely a UX transition, no data implications: briefly shows a "moving
  // to the next room" loader between picking a rate for one slot and
  // switching to the next empty one, so the jump doesn't feel instant/
  // unclear about which room just got selected. null = not transitioning.
  const [advancingToIndex, setAdvancingToIndex] = useState(null);

  const checkInParam = toIsoDateParam(selectedStartDate);
  const checkOutParam = toIsoDateParam(selectedEndDate);
  // Includes adults/children, not just id — a guest-count edit on an
  // EXISTING room slot (no add/remove) must also re-trigger the sync effect
  // below. This used to key off ids alone, so bumping "Children" in the
  // Travelers picker without adding/removing a room never propagated into
  // `selectedRoom` at all: the room-list capacity filter and the extra-
  // child/extra-adult surcharge calc both read `selectedRoom`, not
  // `searchRooms`, so they kept computing against the stale prior guest
  // count until a room was added or removed for some unrelated reason.
  const searchRoomsKey = (searchRooms || [])
    .map((r) => `${r.id}:${r.adults}:${r.children}`)
    .join(",");
  const nights = calcNights(selectedStartDate, selectedEndDate);

  // Keep StayContext's `selectedRoom` array (one entry per booked room slot)
  // in sync with SearchContext's `searchRooms` by id — adding a fresh empty
  // entry for a new slot id, dropping entries for removed ones, refreshing
  // adults/children on every existing slot, and leaving every other slot's
  // already-picked roomId/rateId selection untouched. This used to wipe
  // every slot's selection whenever the id set changed at all (e.g. adding a
  // 3rd room), discarding rooms 1-2's already-picked rates along with it —
  // real Amritara's RoomManager.js (updateRoom, ~70-99) never does that; it
  // only ever mutates the specific room being edited, by id.
  useEffect(() => {
    if (!searchRooms?.length) return;
    const inSync =
      Array.isArray(selectedRoom) &&
      selectedRoom.length === searchRooms.length &&
      searchRooms.every(
        (sr, i) =>
          selectedRoom[i]?.id === sr.id &&
          selectedRoom[i]?.adults === sr.adults &&
          selectedRoom[i]?.children === sr.children,
      );

    if (!inSync) {
      const existingById = new Map((selectedRoom || []).map((r) => [r.id, r]));
      setSelectedRoom(
        searchRooms.map((sr) => {
          const existing = existingById.get(sr.id);
          return existing
            ? { ...existing, adults: sr.adults, children: sr.children }
            : {
                id: sr.id,
                adults: sr.adults,
                children: sr.children,
                roomId: "",
                roomName: "",
                roomImage: null,
              };
        }),
      );
      // Only reset the active slot if it's now out of bounds (a room was
      // removed) — a room being added shouldn't kick the view back to slot
      // 1 if the guest was already looking at slot 2.
      if (currentRoomIndex >= searchRooms.length) {
        setCurrentRoomIndex(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRoomsKey]);

  // Raw API responses, kept outside React state so a guest-count change
  // (selectedRoom) can re-run the merge below without re-fetching either
  // API — mirrors Filterbar.js's contentProperties.current/rateDataRef.
  const contentPropertyRef = useRef(null);
  const inventoryRoomsRef = useRef(null);
  const hasSearchedRef = useRef(false);

  // Fetch room content + live rates for the current property/date
  // range/promo code (two separate APIs — see the merge note above).
  useEffect(() => {
    if (!selectedPropertyId || !checkInParam || !checkOutParam) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      hasSearchedRef.current = true;
      try {
        const [contentData, inventoryData] = await Promise.all([
          getRoomsRates(config, {
            propertyId: selectedPropertyId,
            checkInDate: checkInParam,
            checkOutDate: checkOutParam,
            promoCode: promoCodeContext,
          }),
          getInventory(config, {
            propertyId: selectedPropertyId,
            fromDate: checkInParam,
            toDate: checkOutParam,
            guId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            promoCodeContext: promoCodeContext,
          }),
        ]);
        if (cancelled) return;

        contentPropertyRef.current = Array.isArray(contentData?.PropertyList)
          ? contentData.PropertyList[0]
          : null;
        inventoryRoomsRef.current = Array.isArray(inventoryData?.Product)
          ? inventoryData.Product[0]?.Rooms || []
          : [];

        applyMerge();
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load room rates.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    setExpandedRoomIds(new Set());
    setActiveTabMap({});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config,
    selectedPropertyId,
    checkInParam,
    checkOutParam,
    promoCodeContext,
    retryTick,
  ]);

  // Re-run the content+inventory merge (no re-fetch) whenever the current
  // guest-slot selections change, since per-date OBP totals depend on them.
  function applyMerge() {
    // mergeRoomContentWithRates skips a slot when `sel.roomId ===
    // room.RoomId` (ported faithfully from Filterbar.js's checkIfBothReady
    // ~694) — harmless in real Amritara only because that merge runs
    // exactly once per fetch, before any room has been picked (every
    // slot's roomId is still ""). This package re-runs applyMerge later
    // too (guest-count changes, or StayStep remounting after "Modify Room"
    // with a slot already filled), so it can run with a real roomId
    // already set — which makes that skip condition match the very room
    // the guest picked, zeroing out its own price. The merge only needs
    // guest counts per slot, not which room was chosen, so stripping
    // roomId here keeps that skip condition permanently harmless
    // regardless of when this runs.
    const guestSlotsOnly = (selectedRoom || []).map((r) => ({
      id: r.id,
      adults: r.adults,
      children: r.children,
      roomId: "",
    }));

    const { property, uniqueRatePlans } = mergeRoomContentWithRates(
      contentPropertyRef.current,
      inventoryRoomsRef.current,
      guestSlotsOnly,
    );

    // Real Amritara only ever shows rooms with live inventory (Filterbar.js's
    // checkIfBothReady: `availableRooms = RoomData.filter(r => r.MinInventory > 0)`,
    // ~886-889) — the merged RoomData list also includes every STAAH "room"
    // entry that exists for the property regardless of current availability,
    // including meal-plan/package variants of the same physical room
    // (e.g. "Executive Room with Balcony", its "... CP", "... MAP
    // Staycation", "... AP" siblings — separate STAAH room ids for the same
    // room, each with 0 inventory unless that specific package is bookable
    // for the selected dates). Without this filter every variant renders as
    // its own room card.
    //
    // Two more real-source filters were missing entirely here (Filterbar.js
    // ~4696-4757, the "✅ NEW FILTER (IMPORTANT FIX)" block):
    //  - internal/test rooms named EXACTLY "B2B"/"b2b"/"B2b"/"b2B" (a literal
    //    equality check, not a substring match — a real room whose name
    //    merely contains "b2b" would NOT be excluded by this list), plus any
    //    room whose name contains "copy" anywhere (case-insensitively, this
    //    one IS a substring check) — Filterbar.js's own two separate
    //    conditions, `!excludeRoomNames.includes(room.RoomName)` and
    //    `!room.RoomName.toLowerCase().includes("copy")`.
    //  - a room with MinInventory > 0 but NO actual computable rate for
    //    these dates (every rate plan's 1-adult OBP entry is 0/missing) is
    //    still effectively unbookable — real Amritara drops it from the
    //    list rather than showing a room with a blank/zero starting price.
    const EXCLUDED_ROOM_NAMES_EXACT = ["B2B", "b2b", "B2b", "b2B"];
    const availableRooms = (property?.RoomData || [])
      .filter((room) => Number(room?.MinInventory) > 0)
      .filter(
        (room) =>
          !EXCLUDED_ROOM_NAMES_EXACT.includes(room?.RoomName) &&
          !(room?.RoomName || "").toLowerCase().includes("copy"),
      )
      .filter((room) => getRoomMinRate(room) !== null);

    if (!property || availableRooms.length === 0) {
      setError("No rooms available for the selected dates.");
      setRateResponse(null);
      setFilteredRooms([]);
      setCancellationPolicyPackage([]);
    } else {
      setError(null);
      setRateResponse(property);
      setFilteredRooms(availableRooms);
      setCancellationPolicyPackage(uniqueRatePlans);
    }
  }

  useEffect(() => {
    if (!hasSearchedRef.current) return;
    applyMerge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom]);

  const toggleExpand = (roomId) => {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  // Jumping to a slot from the Room 1/Room 2 stepper — no fetch, no merge,
  // just switching which slot is "active" (isSelected/isActiveSlotRoom
  // downstream key off currentRoomIndex already, so nothing re-loads).
  // If that slot already has a pick, auto-expand its room card so editing
  // it shows the previously-selected rate highlighted immediately, instead
  // of landing on the collapsed room list with no indication of what was
  // chosen.
  const handleSelectSlot = (index) => {
    setCurrentRoomIndex(index);
    const existingRoomId = selectedRoom?.[index]?.roomId;
    if (existingRoomId) {
      setExpandedRoomIds((prev) => new Set(prev).add(existingRoomId));
    }
  };

  const setCardTab = (cardKey, tab) => {
    setActiveTabMap((prev) => ({ ...prev, [cardKey]: tab }));
  };

  const activeSlot = searchRooms?.[currentRoomIndex];
  const activeSlotEntry = selectedRoom?.[currentRoomIndex];

  // Applies a selection to one room slot and returns the updated array so
  // the caller can decide where to advance next without waiting on a state
  // update to flush.
  const applySelection = (slotId, selection) => {
    const updated = (selectedRoom || []).map((r) =>
      r.id === slotId ? { ...r, ...selection } : r,
    );
    setSelectedRoom(updated);

    // Real Amritara resolves cancellationPolicyPackage into this single
    // string the moment a rate is chosen (Filterbar.js's handleSelectRoom
    // family) — StayContext already had the field and a generated setter
    // for it, but nothing ever called the setter, so CartOverview's
    // cancellation-policy section silently never showed anything. RateCard
    // already does this exact same lookup for its own inline display
    // (cancellationText, ~line 493) — this mirrors it at selection time.
    const cancellationText =
      (cancellationPolicyPackage || []).find((rp) => rp?.RateId === selection?.rateId)
        ?.CancellationPolicy?.Description || "";
    if (cancellationText) setCancellationPolicyState(cancellationText);

    // Ported from Filterbar.js:2913/3293 — real's exact ctaName string
    // ("Select Package And Cart Open"), fired whenever a room+rate is
    // chosen (standard, member, or post-login-unlock — applySelection is
    // the single funnel all three go through).
    postBookingWidged(config, {
      ctaName: "Select Package And Cart Open",
      propertyId: selectedPropertyId,
      checkIn: checkInParam,
      checkOut: checkOutParam,
      roomsName: selection?.roomName,
      packageName: selection?.roomPackage,
      isCartOpen: true,
    });

    return updated;
  };

  // Mirrors Filterbar.js's handleSelectRoom: after filling a slot, jump to
  // the first still-empty slot rather than blindly incrementing — this way
  // modifying an earlier slot from the cart sidebar (see CartOverview's
  // per-room "Modify"/"Select Room" links) re-targets correctly instead of
  // skipping ahead.
  const advanceAfterSelection = (updatedRooms) => {
    const nextEmptyIndex = (updatedRooms || []).findIndex((r) => !r.roomId);
    if (nextEmptyIndex === -1) {
      onRoomsSelected?.();
      return;
    }
    // Brief transition before actually switching slots — see
    // advancingToIndex's doc comment. Everything else about the flow
    // (selection itself, the merge, validation) already happened above;
    // this only delays *displaying* the next slot.
    setAdvancingToIndex(nextEmptyIndex);
    setTimeout(() => {
      setCurrentRoomIndex(nextEmptyIndex);
      setAdvancingToIndex(null);
    }, 700);
  };

  const triggerUnlockAnimation = (cardKey) => {
    setAnimatingUnlockKey(cardKey);
    setTimeout(() => setAnimatingUnlockKey(null), 1200);
  };

  const handleSelectStandard = (room, mapping, rate) => {
    if (!activeSlot) return;
    const adults = activeSlot.adults ?? 1;
    const children = activeSlot.children ?? 0;

    const guestCheck = validateGuestLimits(room, { adults, children });
    if (!guestCheck.ok) {
      toast.error(guestCheck.message);
      return;
    }
    const invCheck = validateRoomInventorySelection(
      selectedRoom || [],
      activeSlot.id,
      room,
    );
    if (!invCheck.ok) {
      toast.error(invCheck.message);
      return;
    }

    const selection = buildRoomSelection(room, mapping, rate, adults, {
      isMemberRate: false,
    });
    const updated = applySelection(activeSlot.id, selection);
    advanceAfterSelection(updated);
  };

  const handleSelectMember = (
    room,
    memberMapping,
    memberRate,
    savings,
    cardKey,
    standardMapping,
    standardRate,
  ) => {
    if (!activeSlot) return;
    const adults = activeSlot.adults ?? 1;
    const children = activeSlot.children ?? 0;

    if (!user) {
      setPendingMemberSelection({
        room,
        memberMapping,
        memberRate,
        savings,
        cardKey,
        standardMapping,
        standardRate,
      });
      setShowLoginModal(true);
      return;
    }

    const guestCheck = validateGuestLimits(room, { adults, children });
    if (!guestCheck.ok) {
      toast.error(guestCheck.message);
      return;
    }
    const invCheck = validateRoomInventorySelection(
      selectedRoom || [],
      activeSlot.id,
      room,
    );
    if (!invCheck.ok) {
      toast.error(invCheck.message);
      return;
    }

    const selection = buildRoomSelection(
      room,
      memberMapping,
      memberRate,
      adults,
      { isMemberRate: true, savings },
    );
    const updated = applySelection(activeSlot.id, selection);
    setIsMemberRate(true);
    setIsMemberRateSelected(true);
    triggerUnlockAnimation(cardKey);
    advanceAfterSelection(updated);
  };

  const handleUnlocked = () => {
    setShowLoginModal(false);
    if (!pendingMemberSelection || !activeSlot) {
      setPendingMemberSelection(null);
      return;
    }

    const { room, memberMapping, memberRate, savings, cardKey } =
      pendingMemberSelection;
    const adults = activeSlot.adults ?? 1;
    const children = activeSlot.children ?? 0;

    const guestCheck = validateGuestLimits(room, { adults, children });
    if (!guestCheck.ok) {
      toast.error(guestCheck.message);
      setPendingMemberSelection(null);
      return;
    }
    const invCheck = validateRoomInventorySelection(
      selectedRoom || [],
      activeSlot.id,
      room,
    );
    if (!invCheck.ok) {
      toast.error(invCheck.message);
      setPendingMemberSelection(null);
      return;
    }

    const selection = buildRoomSelection(
      room,
      memberMapping,
      memberRate,
      adults,
      { isMemberRate: true, savings },
    );
    const updated = applySelection(activeSlot.id, selection);
    setIsMemberRate(true);
    setIsMemberRateSelected(true);
    triggerUnlockAnimation(cardKey);
    setPendingMemberSelection(null);
    advanceAfterSelection(updated);
  };

  const handleDeclineStandardRate = () => {
    setShowLoginModal(false);
    const pending = pendingMemberSelection;
    setPendingMemberSelection(null);
    if (!pending) return;
    const { room, standardMapping, standardRate } = pending;
    if (!standardMapping || !standardRate) return;
    handleSelectStandard(room, standardMapping, standardRate);
  };

  // Guest-capacity room-list filter — Filterbar.js's "✅ NEW FILTER
  // (IMPORTANT FIX)" block (~4759-4818). Missing entirely before: a room a
  // party can't actually fit in was still shown in the list (only flagged
  // with a toast *after* the guest tried to select it), which is exactly
  // why an extra, too-small room could show up here that real Amritara
  // never lists at all for the same search. `emptyRoom`/`maxAdultsInRoom`/
  // `maxAdultsOnly` names match the real source directly.
  const emptyRoom = (selectedRoom || []).find((r) => !r?.roomId);
  const maxAdultsInRoom = emptyRoom
    ? (emptyRoom.adults || 0) + (emptyRoom.children || 0)
    : (selectedRoom || []).reduce(
        (max, r) => (r.adults > max ? (r.adults || 0) + (r.children || 0) : max),
        0,
      );
  const maxAdultsOnly = emptyRoom
    ? emptyRoom.adults || 0
    : (selectedRoom || []).reduce((max, r) => (r.adults > max ? r.adults : max), 0);

  // Copied via [...] before filtering/sorting since `filteredRooms` here may
  // otherwise be the exact same array reference as component state —
  // mutating it in place (e.g. via .sort()) would mutate state directly.
  //
  // Real Amritara's fallback-to-unfiltered-list (~4810-4818) only fires when
  // NO room at all survived the name/rate-availability filter one stage
  // earlier (this package's `filteredRooms` being empty, which already
  // routes to the "no rooms" error state above rather than reaching this
  // code) — it does NOT fall back to showing oversized/undersized rooms just
  // because the guest-capacity filter alone empties an already-non-empty
  // list. In that case real shows nothing (isSoldOutProp), matching this
  // package's existing empty-state message below.
  const rooms = [...(filteredRooms || [])].filter(
    (room) =>
      Number(room?.MaxGuest) >= maxAdultsInRoom && Number(room?.MaxAdult) >= maxAdultsOnly,
  );
  // Real's price-ascending sort (~4801-4804) as the primary tie-break; its
  // "target room on top" rule (~4796-4799) depends on a filteredRoomId
  // concept (which room a guest arrived pre-targeting, e.g. from a search-
  // suggestion deep link) this package doesn't track, so that part is
  // skipped — everything else sorts the same way.
  rooms.sort((a, b) => {
    const priceA = getRoomMinRate(a) ?? Infinity;
    const priceB = getRoomMinRate(b) ?? Infinity;
    if (priceA !== priceB) return priceA - priceB;
    return (a?.RoomName || "").localeCompare(b?.RoomName || "");
  });

  console.log("rooms",rooms)

  return (
    <div className="be-stay-step">
      <Toaster position="top-right" />

      {!loading && !error && rooms.length > 0 && (
        <RoomSlotStepper
          selectedRoom={selectedRoom}
          activeIndex={currentRoomIndex}
          onSelectSlot={handleSelectSlot}
        />
      )}

      {loading && (
        <div className="be-stay-loading">Loading available rooms…</div>
      )}

      {advancingToIndex !== null && (
        <div className="be-stay-loading be-room-advance-loading">
          <span className="be-room-advance-spinner" aria-hidden="true" />
          Room {currentRoomIndex + 1} selected — loading Room {advancingToIndex + 1}…
        </div>
      )}

      {!loading && advancingToIndex === null && error && (
        <div className="be-stay-error">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setRetryTick((t) => t + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && advancingToIndex === null && !error && rooms.length === 0 && (
        <div className="be-stay-empty">
          {hasSearchedRef.current
            ? "No rooms available for the selected dates."
            : "Select a destination and dates above to see available rooms."}
        </div>
      )}

      {!loading &&
        advancingToIndex === null &&
        !error &&
        rooms.map((room) => {
          const standardEntries = getStandardRateEntries(rateResponse, room);
          const fromPriceInfo = getRoomFromPrice(rateResponse, room);

          return (
            <RoomRow
              key={room.RoomId}
              room={room}
              property={rateResponse}
              isExpanded={expandedRoomIds.has(room.RoomId)}
              onToggleExpand={() => toggleExpand(room.RoomId)}
              isActiveSlotRoom={activeSlotEntry?.roomId === room.RoomId}
              activeRoomIndex={currentRoomIndex}
              fromPrice={fromPriceInfo?.price ?? null}
              fromPriceIsMemberRate={fromPriceInfo?.isMemberRate ?? false}
              standardEntries={standardEntries}
              adults={activeSlot?.adults ?? 1}
              nights={nights}
              cancellationPolicyPackage={cancellationPolicyPackage}
              activeTabMap={activeTabMap}
              onSetActiveTab={setCardTab}
              activeSlotEntry={activeSlotEntry}
              onSelectStandard={handleSelectStandard}
              onSelectMember={handleSelectMember}
              animatingUnlockKey={animatingUnlockKey}
              user={user}
              onOpenDetails={setDetailsRoom}
            />
          );
        })}

      <RoomDetailsModal
        room={detailsRoom}
        onClose={() => setDetailsRoom(null)}
      />

      <LoyaltyUnlockModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setPendingMemberSelection(null);
        }}
        onUnlocked={handleUnlocked}
        onDeclineStandardRate={handleDeclineStandardRate}
      />
    </div>
  );
}
