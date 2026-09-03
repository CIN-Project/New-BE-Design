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
  // Bumped only by commitSearch() — StayStep.jsx's room-content/rate fetch
  // depends on THIS, not on selectedPropertyId/selectedStartDate/
  // selectedEndDate directly, specifically so that live-editing the wizard's
  // own compact recap SearchBar (picking a different location/dates there)
  // no longer silently refetches and swaps out the room list the guest is
  // already looking at. Those context fields still update immediately as
  // each field is picked (CartOverview, DetailStep, the field displays
  // themselves, etc. all need that live value) — this only decouples WHEN
  // the room list itself refreshes: automatically the first time valid
  // criteria appear (initial URL hydration or a completed homepage search,
  // both funneled through here via StayStep's own bootstrap effect — see
  // its hasSearchedRef comment), and after that, only again on an explicit
  // Search click (SearchBar.jsx's handleSubmit calls commitSearch()).
  searchTrigger: 0,
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
    ctx.setSearchRooms((rooms) => [
      ...rooms,
      { id: Date.now(), adults: 2, children: 0 },
    ]);
  };

  const removeSearchRoom = (id) => {
    ctx.setSearchRooms((rooms) =>
      rooms.length === 1 ? rooms : rooms.filter((r) => r.id !== id),
    );
  };

  // `maxOverride` lets a caller that actually knows this specific room's
  // real MaxAdult/MaxChildren (GuestsPicker.jsx, only once a real room has
  // been picked for this slot — see its own roomLimits doc comment) use
  // that instead of the generic 4/3 ceiling below, which otherwise applies
  // regardless of what the room actually allows. Without this, a room whose
  // real max is HIGHER than the generic ceiling (e.g. maxAdult: 6) would
  // silently refuse to go past 4 even while GuestsPicker's own + button
  // still showed as enabled (its disabled state is driven by the same real
  // limit, not this generic one) — clicking it would look like it did
  // nothing.
  const updateSearchRoomGuests = (id, field, operation, maxOverride) => {
    ctx.setSearchRooms((rooms) =>
      rooms.map((r) => {
        if (r.id !== id) return r;
        const current = r[field];
        const max = maxOverride ?? (field === "adults" ? 4 : 3);
        const next =
          operation === "inc"
            ? Math.min(max, current + 1)
            : field === "adults"
              ? Math.max(1, current - 1)
              : Math.max(0, current - 1);
        return { ...r, [field]: next };
      }),
    );
  };

  // See searchTrigger's own doc comment on initialState above — the one
  // explicit "the guest actually wants this search to run now" signal.
  const commitSearch = () => {
    ctx.setSearchTrigger((prev) => prev + 1);
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
    commitSearch,
  };
}
