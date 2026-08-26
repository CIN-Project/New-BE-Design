"use client";

import { useEffect, useRef } from "react";
import { useConfig } from "../config/configContext.js";
import { useSearchContext } from "../context/SearchContext.js";
import { useStayContext } from "../context/StayContext.js";
import { useCartContext } from "../context/CartContext.js";
import { getRoomsRates, getInventory } from "../api/rates.js";
import { mergeRoomContentWithRates, buildRoomSelection } from "../utils/ratePricing.js";
import { formatIsoDate } from "../utils/date.js";

/**
 * Re-prices every already-selected room slot whenever the guest changes
 * dates, guest counts, or the promo code from OUTSIDE step 1 — the cart
 * sidebar's own "Modify Dates"/"Modify Guests"/promo controls
 * (DateRangeModal, GuestsModal, CouponComponent) only ever write to
 * SearchContext/CartContext directly; nothing re-fetched or recomputed the
 * ALREADY-selected rooms' frozen prices, so the cart kept showing whatever
 * was priced at the moment of the original room selection regardless of
 * what the guest changed afterward. Mirrors StayStep.jsx's own
 * fetch -> merge -> buildRoomSelection pipeline, scoped down to just the
 * rooms already in `selectedRoom` (no full room list, no loading UI) — this
 * runs from any step, not just step 1, since that's where these controls
 * live (the cart sidebar renders on every step past room selection).
 *
 * Same-room, same-rate re-price only, by design (a guest's explicit choice
 * over the alternative of bouncing them back to room selection on every
 * date/guest edit): if a previously-selected room/rate no longer exists in
 * the new dates' response — sold out, or genuinely unavailable for the new
 * guest count — that slot's price is left exactly as it was rather than
 * cleared or zeroed, so the cart never shows a broken/blank price. A
 * consumer wanting stricter behavior (force back to step 1 on any change)
 * would need its own logic instead of this hook.
 *
 * Mount once, near the root of whichever step renders the cart sidebar
 * (Wizard.jsx already does this) — safe to have active on every step, since
 * it no-ops whenever nothing has actually changed or nothing is selected
 * yet.
 */
export function useRepriceSelectedRooms() {
  const config = useConfig();
  const { selectedPropertyId, selectedStartDate, selectedEndDate, searchRooms } =
    useSearchContext();
  const { selectedRoom, setSelectedRoom } = useStayContext();
  const { promoCodeContext } = useCartContext();

  const checkInParam = selectedStartDate ? formatIsoDate(selectedStartDate) : "";
  const checkOutParam = selectedEndDate ? formatIsoDate(selectedEndDate) : "";
  // Includes adults/children (not just id) — a guest-count edit on an
  // existing slot has to trigger a reprice too, the same reasoning as
  // StayStep.jsx's own searchRooms->selectedRoom sync key.
  const searchRoomsKey = (searchRooms || [])
    .map((r) => `${r.id}:${r.adults}:${r.children}`)
    .join(",");
  const repriceKey = `${selectedPropertyId || ""}|${checkInParam}|${checkOutParam}|${searchRoomsKey}|${promoCodeContext || ""}`;

  const lastKeyRef = useRef(null);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    if (isFirstRunRef.current) {
      // Captures the key this hook mounted with (the dates/guests/promo the
      // rooms were ORIGINALLY priced for at selection time) without
      // re-fetching anything — only actual CHANGES after this point should
      // trigger a reprice.
      isFirstRunRef.current = false;
      lastKeyRef.current = repriceKey;
      return;
    }
    if (repriceKey === lastKeyRef.current) return;
    lastKeyRef.current = repriceKey;

    const hasAnySelection = (selectedRoom || []).some((r) => r?.roomId);
    if (!hasAnySelection || !selectedPropertyId || !checkInParam || !checkOutParam) return;

    let cancelled = false;

    (async () => {
      try {
        // Reads adults/children from searchRooms (by slot id), not from
        // selectedRoom's own copy of those fields — selectedRoom's copy is
        // kept in sync by useSyncSelectedRoomsWithSearch.js's own effect,
        // but effects run in call order within a render and this hook has
        // no guarantee it runs after that one commits first. Going straight
        // to searchRooms (already in scope via useSearchContext above)
        // sidesteps that ordering question entirely instead of depending on
        // it.
        const searchRoomsById = new Map((searchRooms || []).map((sr) => [sr.id, sr]));
        const freshGuests = (slot) => searchRoomsById.get(slot.id) || slot;

        const guestSlotsOnly = (selectedRoom || []).map((r) => {
          const fresh = freshGuests(r);
          return {
            id: r.id,
            adults: fresh.adults,
            children: fresh.children,
            roomId: "",
          };
        });

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
            promoCodeContext,
          }),
        ]);
        if (cancelled) return;

        const contentProperty = Array.isArray(contentData?.PropertyList)
          ? contentData.PropertyList[0]
          : null;
        const inventoryRooms = Array.isArray(inventoryData?.Product)
          ? inventoryData.Product[0]?.Rooms || []
          : [];

        const { property: merged } = mergeRoomContentWithRates(
          contentProperty,
          inventoryRooms,
          guestSlotsOnly,
        );
        if (cancelled || !merged) return;

        const updated = (selectedRoom || []).map((slot) => {
          if (!slot?.roomId) return slot;
          const room = (merged.RoomData || []).find((r) => r.RoomId === slot.roomId);
          const rate = (merged.RateData || []).find((r) => r.RateId === slot.rateId);
          const mapping = (merged.Mapping || []).find(
            (m) => m.RoomId === slot.roomId && m.RateId === slot.rateId,
          );
          if (!room || !rate || !mapping) return slot;

          const fresh = freshGuests(slot);
          const repriced = buildRoomSelection(room, mapping, rate, fresh.adults ?? 1, {
            isMemberRate: slot.isMemberRate,
            savings: slot.savings,
          });
          // Also carries the fresh adults/children onto the slot itself
          // (buildRoomSelection's own return doesn't include them) — belt
          // and suspenders alongside useSyncSelectedRoomsWithSearch.js's
          // separate effect, so this hook's own output is self-consistent
          // even in the render before that other effect commits.
          return { ...slot, adults: fresh.adults, children: fresh.children, ...repriced };
        });

        setSelectedRoom(updated);
      } catch (err) {
        console.warn(
          "booking-engine-new: failed to reprice selected rooms for new dates/guests",
          err,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repriceKey]);
}
