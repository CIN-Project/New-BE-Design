"use client";

import { useEffect } from "react";
import { useSearchContext } from "../context/SearchContext.js";
import { useStayContext } from "../context/StayContext.js";

/**
 * Keeps StayContext's `selectedRoom` array (one entry per booked room slot)
 * in sync with SearchContext's `searchRooms` by id — adding a fresh empty
 * entry for a new slot id, dropping entries for removed ones, refreshing
 * adults/children on every existing slot, and leaving every other slot's
 * already-picked roomId/rateId selection untouched.
 *
 * This used to live only inside StayStep.jsx's own effect (step 1), which
 * meant editing guests from the CART sidebar's "Modify Guests" on step 2 —
 * where StayStep isn't mounted at all — updated searchRooms but never
 * propagated into selectedRoom[i].adults/children. Two visible symptoms:
 * CartOverview.jsx's guest-limit warnings (`room.children > room.maxChildren`
 * etc.) kept comparing against the OLD count and never fired, and
 * useRepriceSelectedRooms.js's reprice used the OLD count too. Mounted
 * unconditionally in Wizard.jsx so it's active on every step regardless of
 * which one is showing.
 *
 * Deliberately does NOT duplicate StayStep.jsx's own currentRoomIndex-reset
 * side effect (out-of-bounds slot handling) — that's step-1-specific UI
 * state, not part of the core sync. StayStep.jsx keeps its own copy of this
 * same sync as well; both checking the same "already in sync?" condition
 * makes having both harmless (whichever runs second just no-ops), so this
 * is purely additive rather than a change to that existing, working effect.
 */
export function useSyncSelectedRoomsWithSearch() {
  const { searchRooms } = useSearchContext();
  const { selectedRoom, setSelectedRoom } = useStayContext();

  const searchRoomsKey = (searchRooms || [])
    .map((r) => `${r.id}:${r.adults}:${r.children}`)
    .join(",");

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRoomsKey]);
}
