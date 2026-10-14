"use client";

import { createDomainContext } from "./createDomainContext.js";

const initialState = {
  selectedRoom: null,
  selectedRooms: [],
  activeRoomSlotIndex: 0,
  filteredRooms: [],
  selectedRoomRate: null,
  selectedRackRate: 0,
  selectedRoomRackRate: null,
  selectedRoomDetails: null,
  cancellationPolicyState: null,
  cancellationPolicyPackage: [],
  isRoomsChange: false,
  rateResponse: null,
  totalPrice: 0,
  totalRoomPrice: 0,
  baseRoomPrice: 0,
  roomTaxes: [],
  totalTax: 0,
  isMemberRate: false,
  isMemberRateSelected: null,
  defaultOffer: null,
  isTokenKey: false,
  isInventoryAvailable: true,
  offerTagIndex: null,
  storedIndex: null,
  isStayStepOpen: false,
  totalRoomsBasePrice: 0,
  totalRoomsBasePriceMember: 0,
  selectedInitialRoom: null,
  wmrRateKey: null,
  // True from the moment a room/rate refetch is triggered (Search click,
  // a property/date change that auto-refreshes — see StayStep.jsx) until
  // it resolves. CartOverview.jsx disables the Pay & Confirm/Pay Later
  // buttons while this is true, so a guest can't submit a booking against
  // room/rate data that's mid-refresh (and about to change under them).
  isRatesRefreshing: false,
  isRatePing: false,
  ratePingRoomId: 0,
  ratePingPrpertyId: 0,
  ratePingPackageId: 0,
  ratePingBasePrice: 0,
  ratePingTaxPrice: 0,
  ratePingChainId: null,
  ratePingChainName: null,
  ratePingMember: null,
  rateSearchPrice: 0,
  // STAAH's PropertyData.ChildAge/InfantAge (GetRoomsRates content call) —
  // the real, property-specific child-age dropdown range, same source
  // Trevon's RoomManager.js reads (ChildAge=oldest selectable age,
  // InfantAge=oldest age that's still free/non-"chargeable"). Set by
  // StayStep.jsx once a property's content is fetched; defaults match
  // GuestsPicker.jsx's own pre-existing "(0-12 yrs)" fallback sublabel so
  // nothing looks broken before that fetch resolves.
  propertyChildAge: 12,
  propertyInfantAge: 0,
};

const { Provider, useDomainContext } = createDomainContext(
  "StayContext",
  initialState,
);

export function StayProvider({ children }) {
  return <Provider>{children}</Provider>;
}

export function useStayContext() {
  const ctx = useDomainContext();

  const getRoomNameById = (roomId) => {
    if (!ctx.filteredRooms || ctx.filteredRooms.length === 0)
      return "Unknown Room";
    const room = ctx.filteredRooms.find((r) => r.roomCategoryId === roomId);
    return room ? room.roomName : "Unknown Room";
  };

  return { ...ctx, getRoomNameById };
}
