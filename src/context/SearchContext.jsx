"use client";

import { createDomainContext } from "./createDomainContext.js";
import { useConfig } from "../config/configContext.js";

const initialState = {
  selectedPropertyId: null,
  selectedCityId: null,
  selectedPropertyName: null,
  selectedPropertyPhone: null,
  propertyId: null,
  selectedStartDate: null,
  selectedEndDate: null,
  property: null,
  isDateChanged: false,
  keyData: null,
  searchResults: [],
  searchRooms: [{ id: 1, adults: 2, children: 0 }],
  // Day Use booking — ported from Filterbar.js's day-use toggle. Kept as a
  // single flag (not Filterbar.js's two-tier "live filter state" vs
  // "committed context state" split) since this package doesn't have that
  // same "results must stay stable mid-search" concern — SearchBar.jsx's
  // fields are the only thing reading isDayUse before a search runs, and
  // StayStep/DetailStep read it fresh each render regardless of when it
  // last changed.
  isDayUse: false,
  dayUseArrivalTime: "",
  // Set only when a "Book Now" for one specific room (a hotel detail page's
  // Accommodation section, not any of the site's other generic "Book Now"
  // entry points) hands off to /be-booking — StayStep tries to match it
  // against its real STAAH room list on load and auto-expand + scroll to
  // that room, best-effort (this page's own room-name text has no
  // guaranteed 1:1 relationship to STAAH's own room naming). Cleared by
  // StayStep once it's acted on it (matched or not), so it never re-applies
  // itself against a later, unrelated room list.
  preselectRoomName: null,
};

const { Provider, useDomainContext } = createDomainContext(
  "SearchContext",
  initialState,
);

export function SearchProvider({ children }) {
  const config = useConfig();
  return (
    <Provider
      initialState={{
        keyData: config.tokenDbKey ? `dbKey=${config.tokenDbKey}` : null,
      }}
    >
      {children}
    </Provider>
  );
}

export function useSearchContext() {
  const ctx = useDomainContext();

  const setSelectedDates = (startDate, endDate) => {
    if (startDate > endDate) {
      console.error("[booking-engine-new] Start date cannot be after end date");
      return;
    }
    ctx.setSelectedStartDate(startDate);
    ctx.setSelectedEndDate(endDate);
  };

  const addSearchRoom = () => {
    ctx.setSearchRooms((rooms) =>
      rooms.length >= 4
        ? rooms
        : [...rooms, { id: Date.now(), adults: 2, children: 0 }],
    );
  };

  const removeSearchRoom = (id) => {
    ctx.setSearchRooms((rooms) =>
      rooms.length === 1 ? rooms : rooms.filter((r) => r.id !== id),
    );
  };

  const updateSearchRoomGuests = (id, field, operation) => {
    ctx.setSearchRooms((rooms) =>
      rooms.map((r) => {
        if (r.id !== id) return r;
        const current = r[field];
        const next =
          operation === "inc"
            ? field === "adults"
              ? Math.min(4, current + 1)
              : Math.min(3, current + 1)
            : field === "adults"
              ? Math.max(1, current - 1)
              : Math.max(0, current - 1);
        return { ...r, [field]: next };
      }),
    );
  };

  // Matches real Amritara's RoomManager.js (~162) exactly — always
  // "Adult"/"Room" singular regardless of count, and children always shown
  // (never hidden at 0) rather than folded into a combined "Guests" figure.
  const getSearchGuestsSummary = () => {
    const totalAdults = ctx.searchRooms.reduce((acc, r) => acc + r.adults, 0);
    const totalChildren = ctx.searchRooms.reduce((acc, r) => acc + (r.children || 0), 0);
    const totalRooms = ctx.searchRooms.length;
    return `${totalAdults} Adult, ${totalChildren} Children - ${totalRooms} Room`;
  };

  return {
    ...ctx,
    setSelectedDates,
    addSearchRoom,
    removeSearchRoom,
    updateSearchRoomGuests,
    getSearchGuestsSummary,
  };
}
