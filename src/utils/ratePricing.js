/**
 * Pure rate/room-selection pricing logic, ported from the legacy
 * `Filterbar.js` (Amritara_New_NextJs, src/app/cin_booking_engine/Filterbar.js:
 * normalizeRateName ~311, getMemberRateName ~314, getGuestRateFromObp ~317,
 * getRateObpEntry ~346, validateRoomInventorySelection ~2863,
 * handleSelectMemberRate ~2892, handleSelectRoom ~3276, and the rate-card
 * pricing block ~5430-5555).
 *
 * No React, no context, no DOM, no toast/analytics calls. Every function
 * takes plain data in and returns plain data out; the calling component is
 * responsible for wiring the results into React state and for any
 * side-effecting concerns (toasts, GTM/dataLayer pushes, login modals).
 *
 * MEMBER RATES: member rates are STAAH rate plans literally named
 * "Member <standard rate name>" (see normalizeRateName/getMemberRateName
 * below). That name-match is the actual mechanism the live app uses to pair
 * a standard rate plan with its member variant — there is NO id-list-based
 * member-rate detection, despite dead `memberRateIds`-style context fields
 * that may still be floating around elsewhere in the codebase.
 *
 * RATE PING ("ratePing*" fields): this is a price-verification/anti-tamper
 * mechanism. When a booking-widget session is entered carrying a specific
 * room + package + price (e.g. from an external/marketing link, or a
 * previous step in the flow), the app re-verifies that price against the
 * STAAH API (see the `verifyToken`-style flow in src/api/rates.js) and, for
 * that exact room+package combination only, uses the verified/"pinged"
 * price instead of the value freshly recomputed from `RateData`/`OBP`. The
 * shape of the override seen throughout the source is:
 *
 *   (mapping?.RateId == ratePingPackageId && room?.RoomId == ratePingRoomId)
 *     ? ratePingBasePrice
 *     : freshlyComputedValue
 *
 * with `ratePingMember` ("Y"/"N") distinguishing whether the pinged price
 * belongs to the member or standard rate variant, and `isRatePing` flagging
 * whether a ping is currently active for the session. This module preserves
 * those override conditionals faithfully wherever they sit inside the ported
 * functions, but does not implement the ping API call/lifecycle itself —
 * that orchestration (calling the verify endpoint, deciding when to arm
 * `isRatePing`, storing `ratePingBasePrice`/`ratePingTaxPrice`/etc. in
 * context) belongs to the caller.
 */

/** Lowercase + collapse whitespace, so rate names can be compared reliably. */
export function normalizeRateName(rateName = "") {
  return rateName.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The normalized name a rate plan's member variant is expected to have.
 * e.g. getMemberRateName("Best Available Rate") === "member best available rate".
 */
export function getMemberRateName(standardRateName = "") {
  return normalizeRateName(`Member ${standardRateName}`);
}

/**
 * Pick the OBP (occupancy-based-pricing) entry for a given rate id out of a
 * plan's OBP list. `obp` may be an array or an object keyed by index; falls
 * back to the first entry if no id matches (mirrors source behavior).
 */
export function getRateObpEntry(obp, rateId) {
  const obpEntries = Array.isArray(obp) ? obp : Object.values(obp || {});

  return (
    obpEntries.find((entry) => String(entry?.rateId) === String(rateId)) ||
    obpEntries[0] ||
    null
  );
}

/**
 * Resolve the per-guest rate for a given adult count out of an OBP entry (or
 * list of entries). Tries, in order: (1) a direct hit on the adults key,
 * (2) the same key scanned across all entries, (3) the highest-numbered
 * guest-count key available anywhere, as a last-resort fallback.
 */
export function getGuestRateFromObp(obp, adults = 1) {
  const adultKey = String(adults || 1);
  const directRate = obp?.[adultKey];

  if (directRate?.RateBeforeTax != null) {
    return directRate;
  }

  const obpEntries = Array.isArray(obp) ? obp : Object.values(obp || {});
  const matchingRate = obpEntries
    .map((entry) => entry?.[adultKey])
    .find((guestRate) => guestRate?.RateBeforeTax != null);

  if (matchingRate) {
    return matchingRate;
  }

  return obpEntries
    .flatMap((entry) =>
      Object.entries(entry || {})
        .filter(([key, value]) => !isNaN(Number(key)) && value?.RateBeforeTax != null)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, value]) => value)
    )
    .at(-1);
}

/**
 * Last-resort rate value: the highest-keyed (or last array) OBP entry's
 * field, used whenever the requested guest-count key isn't present at all.
 * Mirrors the repeated array-vs-object fallback block in Filterbar.js.
 */
function lastObpValue(rates, field) {
  if (!rates) return 0;

  if (Array.isArray(rates)) {
    const last = rates[rates.length - 1];
    return last?.[field] ?? 0;
  }

  const keys = Object.keys(rates).sort((a, b) => Number(a) - Number(b));
  const lastKey = keys[keys.length - 1];
  return rates[lastKey]?.[field] ?? 0;
}

/**
 * Given a property's RateData/Mapping and a room's RatePlans, find the
 * sibling "member" rate plan for a standard rate — matched purely by name
 * (see MEMBER RATES note above), not by any id list.
 *
 * @param {object} property - has `.RateData` (array of rate definitions)
 *   and `.Mapping` (array of { RoomId, RateId, ApplicableGuest, ... }).
 * @param {object} room - a room entry with `.RoomId` and `.RatePlans`
 *   (array of { RateId, Rates }).
 * @param {object} standardRate - the rate object the member rate should be
 *   paired with; its `.MappingDisplayName` is the name basis (matches
 *   Filterbar.js line ~5442, which keys off MappingDisplayName, not RateName).
 * @returns {{ memberRate: object|null, memberMapping: object|null, memberRatePlan: object|null }}
 */
export function findMemberRatePlan(property, room, standardRate) {
  const memberRate =
    property?.RateData?.find(
      (candidateRate) =>
        normalizeRateName(candidateRate?.RateName) ===
        getMemberRateName(standardRate?.MappingDisplayName)
    ) || null;

  const memberMapping = memberRate
    ? property?.Mapping?.find(
        (map) => map?.RoomId === room?.RoomId && map?.RateId === memberRate?.RateId
      ) || null
    : null;

  const memberRatePlan =
    room?.RatePlans?.find((element) => element?.RateId === memberMapping?.RateId) || null;

  return { memberRate, memberMapping, memberRatePlan };
}

/**
 * Accumulate a rate plan's per-date OBP entries into cart totals for a given
 * adult count. Mirrors the `Object.values(matchedRatePlan.Rates).forEach(...)`
 * loop in Filterbar.js (~5491-5508 for the standard plan, ~5518-5545 for the
 * member plan — the two loops are equivalent for this purpose; the member
 * loop's `TotalRate || RateAfterTax` fallback for `cartValueWithTax` is not
 * reproduced here since it only matters when `TotalRate` is missing, which
 * in practice does not occur for either plan type).
 *
 * The caller is responsible for applying any ratePing override on top of the
 * result, e.g. (mirroring Filterbar.js ~5547-5555):
 *
 *   const totalCartValueBeforeTax =
 *     (mapping?.RateId == ratePingPackageId && room?.RoomId == ratePingRoomId && ratePingMember == "N")
 *       ? ratePingBasePrice
 *       : totals.totalCartValue;
 *
 * @param {object} ratePlan - a room's matched RatePlans entry ({ Rates }).
 * @param {object} mapping - the Mapping entry for this rate ({ RateId, ... }).
 * @param {number|string} adults - adult count to price for.
 * @returns {{ totalCartValue: number, cartValueWithTax: number, totalSavings: number }}
 */
export function computeRatePlanTotals(ratePlan, mapping, adults) {
  let totalCartValue = 0;
  let cartValueWithTax = 0;
  let totalSavings = 0;

  if (!ratePlan?.Rates) {
    return { totalCartValue, cartValueWithTax, totalSavings };
  }

  const adultKey = String(adults || 1);

  Object.values(ratePlan.Rates).forEach((dateData) => {
    const obp = getRateObpEntry(dateData?.OBP, mapping?.RateId);
    const guestRate = getGuestRateFromObp(obp, adultKey);

    if (guestRate) {
      totalCartValue += parseFloat(guestRate?.RateBeforeTax || "0");
      totalSavings += parseFloat(guestRate?.Savings || "0");
      cartValueWithTax += parseFloat(obp?.TotalRate || "0");
    }
  });

  return { totalCartValue, cartValueWithTax, totalSavings };
}

/**
 * Compose the room+rate "selection" object shape that the cart/wizard state
 * expects, mirroring the object literal built inside
 * handleSelectRoom/handleSelectMemberRate's setSelectedRoom updaters. The
 * caller should merge this onto the existing cart-room record, e.g.:
 *
 *   setSelectedRoom((prev) =>
 *     prev.map((r) => (r.id === editingId ? { ...r, ...buildRoomSelection(...) } : r))
 *   );
 *
 * Excluded on purpose (caller's responsibility, not this pure module's):
 *  - guest-limit gating: call validateGuestLimits() first and skip building
 *    a selection (or surface its message) when it fails, exactly like the
 *    isGuestLimitExceeded/isAdultLimitExceeded/isChildLimitExceeded checks
 *    that guard each branch in Filterbar.js before building the object.
 *  - the login gate: Filterbar.js's handleSelectMemberRate calls
 *    setIsOpenLogin(true) when `!isLoggedin` instead of building a
 *    selection at all — the caller should check auth state (see
 *    AuthContext.useBookingEngineAuth()) and render the loyalty unlock
 *    modal itself before calling this function for a member rate.
 *  - analytics/tracking (postBookingWidged, window.dataLayer pushes) and
 *    routing (replaceAction("select-package")) — not ported, do in the
 *    calling component.
 *
 * Deliberate simplification: Filterbar.js's "no existing cart room" branches
 * compute `adultExRate` with a formula that diverges between the standard
 * path (`rate(adults) - rate("0")`, baseline key "0") and the member path
 * (`rate(adults) - rate(1)` via getGuestRateFromObp, baseline key "1") — this
 * looks like an inconsistency/bug in the source rather than intentional
 * behavior. This port standardizes on a single robust formula for
 * `roomAdultExtraCharge`: rate(adults) - rate(1 adult), computed via
 * getGuestRateFromObp for both member and standard rates.
 *
 * @param {object} room - the room entry (has RoomId, RoomName, RackRate,
 *   Images, MaxGuest, MaxAdult, MaxChildren, MinInventory, RatePlans).
 * @param {object} mapping - the Mapping entry for the chosen rate (has
 *   RateId, ApplicableGuest, ApplicableAdult, ApplicableChild).
 * @param {object} rate - the rate definition (has RateName, RateId).
 * @param {number} adults - adult count the price should be resolved for.
 * @param {{ isMemberRate?: boolean, savings?: number }} [options]
 * @returns {object} the selection fields to merge onto a cart-room record.
 */
export function buildRoomSelection(room, mapping, rate, adults, options = {}) {
  const { isMemberRate = false, savings } = options;

  const ratePlan = room?.RatePlans?.find((el) => el?.RateId === mapping?.RateId);
  const firstDateKey = Object.keys(ratePlan?.Rates || {})[0];
  const rates = ratePlan?.Rates?.[firstDateKey]?.OBP;

  const selectedGuestRate = getGuestRateFromObp(rates, adults);
  const baseGuestRate = getGuestRateFromObp(rates, 1);

  const primary = selectedGuestRate?.RateAfterTax ?? undefined;
  const fallback = lastObpValue(rates, "RateAfterTax");

  const primaryBe = selectedGuestRate?.RateBeforeTax ?? undefined;
  const fallbackBe = lastObpValue(rates, "RateBeforeTax");

  return {
    isMemberRate,
    roomId: room?.RoomId,
    roomName: room?.RoomName,
    roomRate: room?.RackRate,
    roomImage: room?.Images?.[0],
    maxGuest: room?.MaxGuest,
    maxAdult: room?.MaxAdult,
    maxChildren: room?.MaxChildren,
    roomPackage: rate?.RateName,
    rateId: rate?.RateId,
    applicableGuest: mapping?.ApplicableGuest,
    applicableAdult: mapping?.ApplicableAdult,
    applicableChild: mapping?.ApplicableChild || 0,
    roomRateWithTax: Math.round(primary ?? fallback),
    packageRate: parseFloat(primaryBe ?? fallbackBe),
    roomAdultExtraCharge:
      Math.round(selectedGuestRate?.RateAfterTax || 0) -
      Math.round(baseGuestRate?.RateAfterTax || 0),
    minInventory: room?.MinInventory,
    packageRateList: ratePlan?.Rates ?? null,
    savings,
  };
}

/**
 * Extra-guest surcharge — the piece that was missing entirely from this
 * package's pricing before this port existed. buildRoomSelection's
 * packageRate/roomRateWithTax only ever reflect the base-occupancy OBP
 * entry for the selected adult count; real Amritara's StayStep.js
 * (rateUpdate ~275-609, fetchRateApi ~611-1039 — the two are duplicated,
 * near-identical implementations of the same formula) separately adds an
 * extra-child room charge (with its own GST-threshold tax recompute) and a
 * flat extra-adult charge whenever the room's guest count exceeds the rate
 * plan's applicable occupancy. Silently dropping this undercharges any
 * booking with children beyond applicableChild/applicableGuest, or adults
 * beyond maxAdult — and any GST recompute that comes with it.
 *
 * Ported faithfully, including two source quirks that read as inconsistent
 * but are what real Amritara actually charges:
 *  - the extra-child room charge/tax are summed across every date in the
 *    stay (rateEntries.reduce/flatMap over ALL dates in real code) — so the
 *    values returned here are already whole-stay totals, not per-night
 *    (do not multiply by nights again).
 *  - the extra-adult charge is read from only the FIRST date's
 *    ExtraAdultRate and added once — real code uses `firstRateObj`, never
 *    multiplied by nights or by the count of extra adults.
 *  - when extraChildren >= 1, the recomputed GST REPLACES the room's normal
 *    per-date tax rather than adding to it (real ~505-604's if/else
 *    branch) — the caller must not also add the standard
 *    roomRateWithTax-minus-packageRate tax for that room in that case.
 *
 * @param {object} selectedRoomEntry - a selectedRoom[] entry after
 *   buildRoomSelection has been merged onto it (needs adults, children,
 *   applicableAdult, applicableChild, applicableGuest, maxAdult,
 *   packageRateList) — all already present on that object today.
 * @returns {{ extraChildren: number, extraAdultCharge: number,
 *   extraChildRoomCharge: number, extraChildTax: number,
 *   extraChildSaving: number }} extraChildRoomCharge/extraChildTax/
 *   extraChildSaving are whole-stay sums already; extraAdultCharge is a
 *   one-time flat amount. None of these should be multiplied by nights.
 */
export function computeRoomSurcharge(selectedRoomEntry) {
  const empty = {
    extraChildren: 0,
    extraAdultCharge: 0,
    extraChildRoomCharge: 0,
    extraChildTax: 0,
    extraChildSaving: 0,
  };
  if (!selectedRoomEntry) return empty;

  const {
    adults = 0,
    children = 0,
    applicableAdult = 0,
    applicableChild = 0,
    applicableGuest = 0,
    maxAdult = 0,
    packageRateList,
  } = selectedRoomEntry;

  let adjustedAdults = adults;
  let adjustedChildren = children;
  if (adults < applicableAdult && children > 0) {
    const neededAdults = applicableAdult - adults;
    const childrenToAdults = Math.min(neededAdults, children);
    adjustedAdults += childrenToAdults;
    adjustedChildren -= childrenToAdults;
  }

  const extraChildren =
    adjustedChildren > applicableChild
      ? Math.min(
          adjustedChildren - applicableChild,
          Math.max(0, adjustedAdults + adjustedChildren - applicableGuest)
        )
      : 0;

  const dateEntries = packageRateList ? Object.values(packageRateList) : [];

  let extraChildRoomCharge = 0;
  let extraChildSaving = 0;
  let extraChildTax = 0;

  if (extraChildren >= 1 && dateEntries.length > 0) {
    const totalExtraChildRate = dateEntries.reduce(
      (sum, d) => sum + parseFloat(d?.ExtraChildRate?.RateBeforeTax || 0),
      0,
    );
    const totalExtraChildSaving = dateEntries.reduce(
      (sum, d) => sum + parseFloat(d?.ExtraChildRate?.Savings || 0),
      0,
    );
    extraChildRoomCharge = Math.round(totalExtraChildRate) * extraChildren;
    extraChildSaving = Math.round(totalExtraChildSaving) * extraChildren;

    extraChildTax = dateEntries.reduce((sum, d) => {
      const guestRate = getGuestRateFromObp(d?.OBP, adults);
      const baseRate = parseFloat(guestRate?.RateBeforeTax || 0);
      const perChildRate = parseFloat(d?.ExtraChildRate?.RateBeforeTax || 0);
      const price = baseRate + perChildRate * extraChildren;
      return sum + (price >= 7500 ? Math.round(price * 0.18) : Math.round(price * 0.05));
    }, 0);
  }

  let extraAdultCharge = 0;
  if (adults > maxAdult && dateEntries.length > 0) {
    const extraAdultRate = dateEntries[0]?.ExtraAdultRate;
    if (parseFloat(extraAdultRate?.RateAfterTax) > 1.0) {
      extraAdultCharge = parseFloat(extraAdultRate?.RateBeforeTax || 0);
    }
  }

  return { extraChildren, extraAdultCharge, extraChildRoomCharge, extraChildTax, extraChildSaving };
}

/**
 * Pure guest-limit validation for a room, mirroring the
 * isGuestLimitExceeded/isAdultLimitExceeded/isChildLimitExceeded checks
 * repeated in every branch of handleSelectRoom/handleSelectMemberRate
 * (Filterbar.js). Returns a result the caller decides how to surface
 * (toast, inline message, etc.) instead of pushing to a toast queue itself.
 *
 * @param {object} room - the room being selected, with MaxGuest, MaxAdult,
 *   MaxChildren, RoomName.
 * @param {{ adults?: number, children?: number }} selection - the guest
 *   counts currently on the cart-room entry being validated against `room`.
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateGuestLimits(room, selection) {
  const adults = selection?.adults || 0;
  const children = selection?.children || 0;

  if (adults + children > room?.MaxGuest) {
    return {
      ok: false,
      message: `A maximum of ${room?.MaxGuest} guests are allowed in ${room?.RoomName}`,
    };
  }

  if (adults > room?.MaxAdult) {
    return {
      ok: false,
      message: `A maximum of ${room?.MaxAdult} adults are allowed in ${room?.RoomName}`,
    };
  }

  if (children > room?.MaxChildren) {
    return {
      ok: false,
      message: `A maximum of ${room?.MaxChildren} children are allowed in ${room?.RoomName}`,
    };
  }

  return { ok: true };
}

/**
 * Pure room-inventory validation, mirroring validateRoomInventorySelection
 * in Filterbar.js (~2863-2890). Checks that selecting `room` won't exceed
 * its MinInventory given how many cart-room entries already hold the same
 * roomId (excluding the entry currently being edited, if any).
 *
 * @param {Array<{ id?: any, roomId?: any }>} selectedRooms - the current
 *   cart-room entries (Filterbar.js's `selectedRoom` state array).
 * @param {any} editingRoomEntryId - id of the cart-room entry being edited
 *   (Filterbar.js's `selectedRoomDetails?.id`), excluded from the count so
 *   re-selecting the same slot doesn't count against itself. Pass
 *   undefined/null when adding a brand new entry.
 * @param {object} room - the room being selected, with RoomId, RoomName,
 *   MinInventory.
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateRoomInventorySelection(selectedRooms, editingRoomEntryId, room) {
  const roomId = room?.RoomId;
  const minInventory = Number(room?.MinInventory ?? 0);

  const selectedSameRoomCount = (selectedRooms || []).filter((entry) => {
    if (entry?.id === editingRoomEntryId) return false;
    return entry?.roomId === roomId;
  }).length;

  const nextSelectedCount = selectedSameRoomCount + 1;

  if (minInventory <= 0) {
    return { ok: false, message: "This room is not available for selected date." };
  }

  if (nextSelectedCount > minInventory) {
    return {
      ok: false,
      message: `Only ${minInventory} room(s) allowed for ${room?.RoomName}`,
    };
  }

  return { ok: true };
}

/**
 * Merge the CMS "content" response (room names/images, rate names, room<->
 * rate mapping — from api/rates.js's getRoomsRates) with the STAAH
 * "inventory" pricing response (live occupancy-based rates — from
 * api/rates.js's getInventory) into the single property shape the rest of
 * this module (and StayStep) expects: RoomData carrying merged pricing,
 * RateData backfilled with MappingDisplayName, plus a de-duplicated
 * rate-plan list for the cancellation-policy panel.
 *
 * Ported from Filterbar.js's checkIfBothReady (~669-898). The per-date OBP
 * total for each rate plan is recomputed against the CURRENT selectedRoom
 * guest-slot entries (adults/children/rateId per room slot), since price
 * depends on how many guests are currently assigned to that room, not just
 * on the raw API response. Re-run this whenever selectedRoom changes, not
 * just when the API responses change.
 *
 * Faithfully preserves a source quirk: the room-level `TotalRate` below
 * indexes the now-array-shaped `OBP` directly by `s.rateId`
 * (`OBP?.[s.rateId]`) rather than searching it (the way getRateObpEntry
 * does elsewhere in this module) — this is what Filterbar.js ~789 actually
 * does, kept as-is rather than "fixed", per this module's port philosophy.
 *
 * @param {object} contentProperty - PropertyList[0] from getRoomsRates:
 *   { PropertyData, RoomData[], RateData[], Mapping[] }.
 * @param {Array} inventoryRooms - Product[0].Rooms from getInventory:
 *   [{ RoomId, MinInventory, RestrictionTitle, RatePlans[{RateId, Rates}] }].
 * @param {Array} selectedRoom - StayContext's selectedRoom array of guest
 *   slots: [{ id, roomId, rateId, adults, children }].
 * @returns {{ property: object|null, uniqueRatePlans: Array }} `property` is
 *   contentProperty with RoomData/RateData merged in (null if inventoryRooms
 *   is empty/missing, or contentProperty has no RoomData); `uniqueRatePlans`
 *   is de-duplicated by RateId, for StayContext's cancellationPolicyPackage.
 */
export function mergeRoomContentWithRates(contentProperty, inventoryRooms, selectedRoom) {
  if (!contentProperty || !Array.isArray(inventoryRooms) || inventoryRooms.length === 0) {
    return { property: null, uniqueRatePlans: [] };
  }

  const dayRateMapping = contentProperty?.Mapping;

  const dayRate = inventoryRooms.map((room) => {
    const updatedRatePlans = (room?.RatePlans || []).map((plan) => {
      const updatedRates = {};

      for (const [dateKey, rateValue] of Object.entries(plan.Rates || {})) {
        const updatedOBP = [];

        for (const sel of selectedRoom || []) {
          if (sel.roomId === room.RoomId) continue;

          const mapping = dayRateMapping?.find((m) => m?.RateId === plan?.RateId);
          const adults = sel.adults || 0;
          const children = sel.children || 0;
          const applicableAdult = mapping?.ApplicableAdult || 0;
          const applicableChild = mapping?.ApplicableChild || 0;
          const applicableGuest = mapping?.ApplicableGuest || 0;
          const maxAdult = mapping?.MaxAdult || 0;

          let adjustedAdults = adults;
          let adjustedChildren = children;

          if (adults < applicableAdult && children > 0) {
            const neededAdults = applicableAdult - adults;
            const childrenToAdults = Math.min(neededAdults, children);
            adjustedAdults += childrenToAdults;
            adjustedChildren -= childrenToAdults;
          }

          const extraChildren =
            adjustedChildren > applicableChild
              ? Math.min(
                  adjustedChildren - applicableChild,
                  Math.max(0, adjustedAdults + adjustedChildren - applicableGuest)
                )
              : 0;

          let guestRate = {};
          const obpKeys = Object.keys(rateValue.OBP || {});
          const obpLength = obpKeys.length;

          if (adults < obpLength) {
            guestRate = rateValue.OBP?.[adults.toString()] || {};
          } else {
            guestRate = rateValue.OBP?.[obpKeys[obpLength - 1]] || {};
          }

          const baseRate = parseFloat(guestRate?.RateBeforeTax || 0);
          const perChildRate = parseFloat(rateValue?.ExtraChildRate?.RateBeforeTax || 0);

          const guestTaxTotal = Array.isArray(guestRate?.Tax)
            ? guestRate.Tax.reduce((s, t) => s + parseFloat(t?.Amount || 0), 0)
            : 0;
          let extraChildTaxTotal = 0;
          if (extraChildren >= 1) {
            const price =
              parseFloat(rateValue?.ExtraChildRate?.RateBeforeTax * parseInt(extraChildren, 10)) +
              parseFloat(baseRate);
            extraChildTaxTotal = price >= 7500 ? Math.round(price * 0.18) : Math.round(price * 0.05);
          }

          const totalRate =
            baseRate +
            perChildRate * extraChildren +
            (extraChildTaxTotal === 0 ? guestTaxTotal : 0) +
            extraChildTaxTotal;

          updatedOBP.push({
            ...rateValue.OBP,
            rateId: sel.rateId,
            TotalRate: Math.round(totalRate).toString(),
          });
        }

        updatedRates[dateKey] = {
          ...rateValue,
          OBP: updatedOBP,
          ExtraAdultRate: rateValue?.ExtraAdultRate || {},
          ExtraChildRate: rateValue?.ExtraChildRate || {},
        };
      }

      return { ...plan, Rates: updatedRates };
    });

    const firstPlanRates = room?.RatePlans?.[0]?.Rates || {};
    const firstDateKey = Object.keys(firstPlanRates)[0];

    const roomLevelTotal = (selectedRoom || [])
      .filter((s) => s.roomId === room.RoomId)
      .reduce((sum, s) => {
        const updatedFirstDateKey = Object.keys(updatedRatePlans[0]?.Rates || {})[0];
        return (
          sum +
          parseFloat(updatedRatePlans[0]?.Rates?.[updatedFirstDateKey]?.OBP?.[s.rateId]?.TotalRate || 0)
        );
      }, 0);

    return {
      RoomId: room?.RoomId,
      MinInventory: room?.MinInventory ?? 0,
      RestrictionTitle: room?.RestrictionTitle ?? "",
      RateBeforeTax: firstPlanRates?.[firstDateKey]?.OBP?.["1"]?.RateBeforeTax || "0",
      RateAfterTax: firstPlanRates?.[firstDateKey]?.OBP?.["1"]?.RateAfterTax || "0",
      RatePlans: updatedRatePlans,
      TotalRate: Math.round(roomLevelTotal).toString(),
    };
  });

  const uniqueRatePlans = [];
  const seen = new Set();
  dayRate.forEach((d) => {
    d?.RatePlans?.forEach((rp) => {
      if (rp?.RateId && !seen.has(rp.RateId)) {
        seen.add(rp.RateId);
        uniqueRatePlans.push(rp);
      }
    });
  });

  if (!contentProperty?.RoomData || dayRate.length === 0) {
    return { property: null, uniqueRatePlans };
  }

  const mergedRoomData = contentProperty.RoomData.map((room) => {
    const matched = dayRate.find((r) => r.RoomId == room?.RoomId);
    return {
      ...room,
      RackRate: matched?.RateBeforeTax ? parseFloat(matched.RateBeforeTax) : room?.RackRate,
      MinInventory: matched?.MinInventory ?? 0,
      RestrictionTitle: matched?.RestrictionTitle ?? "",
      RatePlans: matched?.RatePlans || [],
      TotalRate: matched?.TotalRate ?? 0,
    };
  });

  const mergedRateData = (contentProperty.RateData || []).map((rate) => {
    const matched = dayRateMapping?.find((r) => r.RateId == rate?.RateId);
    return {
      ...rate,
      MappingDisplayName: matched?.MappingDisplayName || matched?.MappingName || rate?.MappingDisplayName,
    };
  });

  return {
    property: { ...contentProperty, RoomData: mergedRoomData, RateData: mergedRateData },
    uniqueRatePlans,
  };
}

function nightsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const diff = Math.abs(new Date(endDate) - new Date(startDate));
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) || 1;
}

/**
 * True per-night pricing for one selected room slot, summed from its own
 * `packageRateList` (buildRoomSelection's raw per-date `Rates` object)
 * rather than assuming its single representative `packageRate`/
 * `roomRateWithTax` (always the FIRST night only — see buildRoomSelection)
 * applies uniformly to every night.
 *
 * Real Amritara's StayStep.js computes the actual stay total the exact same
 * way: calculateBasePrice (~227-252) reduces over
 * `Object.values(room.packageRateList)`, reading each date's own
 * `OBP[adults].RateBeforeTax` — nightly OBP rates commonly differ (weekday
 * vs weekend pricing etc), confirmed directly against real production data
 * (a 2-night stay where night 2's rate for both rooms was higher than night
 * 1's). A flat `packageRate * nights` assumption silently mis-totals
 * (usually undercharges) any stay where rates aren't perfectly flat — and
 * since DetailStep.jsx's real payment submission reads its `deposit`/
 * `totalamountaftertax` straight from this function's `grandTotal`, that
 * mis-total was actually being charged, not just mis-displayed.
 *
 * @param {object} selectedRoomEntry - a selectedRoom[] entry with
 *   packageRateList/adults/rateId (all already present via
 *   buildRoomSelection) and, for the no-packageRateList fallback below,
 *   packageRate/roomRateWithTax.
 * @param {number} fallbackNights - nights to assume if packageRateList is
 *   missing (only happens for a selection built without it, which
 *   shouldn't occur via buildRoomSelection today, but is handled rather
 *   than silently reporting a zero total).
 * @returns {{ baseTotal: number, taxTotal: number, nights: Array<{
 *   dateKey: string|null, date: Date|null, amount: number, tax: number }> }}
 */
export function getRoomNightlyBreakdown(selectedRoomEntry, fallbackNights = 1) {
  const dateEntries = Object.entries(selectedRoomEntry?.packageRateList || {});

  if (dateEntries.length === 0) {
    const amount = parseFloat(selectedRoomEntry?.packageRate) || 0;
    const afterTax = Number(selectedRoomEntry?.roomRateWithTax) || 0;
    const tax = Math.max(0, afterTax - amount);
    return {
      baseTotal: amount * fallbackNights,
      taxTotal: tax * fallbackNights,
      nights: Array.from({ length: fallbackNights }, () => ({
        dateKey: null,
        date: null,
        amount,
        tax,
      })),
    };
  }

  let baseTotal = 0;
  let taxTotal = 0;
  const nights = dateEntries
    .map(([dateKey, dateData]) => {
      const guestRate = getGuestRateFromObp(dateData?.OBP, selectedRoomEntry?.adults);
      const amount = parseFloat(guestRate?.RateBeforeTax || "0");
      const afterTax = parseFloat(guestRate?.RateAfterTax || "0");
      const tax = Math.max(0, afterTax - amount);
      baseTotal += amount;
      taxTotal += tax;
      const parsedDate = new Date(dateKey);
      return { dateKey, date: isNaN(parsedDate.getTime()) ? null : parsedDate, amount, tax };
    })
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  return { baseTotal, taxTotal, nights };
}

/**
 * Single source of truth for what the stay actually costs — both the cart
 * sidebar's price breakdown (CartOverview.jsx) and the real payment
 * submission (DetailStep.jsx's grandTotal/totalTaxAmount) read from this,
 * so the number shown to the guest and the amount actually charged can
 * never drift apart.
 *
 * StayContext's own `totalPrice`/`totalRoomPrice`/`baseRoomPrice`/
 * `roomTaxes`/`totalTax` fields are never populated anywhere in this
 * package (confirmed via grep — only ever read, never set), so this
 * derives everything directly from `selectedRoom`, via getRoomNightlyBreakdown
 * (see its doc comment for why a flat per-night-rate-times-nights assumption
 * is wrong and was corrected).
 */
export function computeStayTotals({ selectedRoom, selectedStartDate, selectedEndDate, addonAmountTotal, addonTaxTotal }) {
  const nights = nightsBetween(selectedStartDate, selectedEndDate);
  const rooms = (selectedRoom || []).filter((r) => r?.roomId);

  const roomBreakdowns = rooms.map((r) => ({
    room: r,
    ...getRoomNightlyBreakdown(r, nights),
  }));

  // Aggregate member-rate savings across every room slot — real Amritara's
  // calculateTotalSavings (StayStep.js ~254-260) sums each room's own
  // `savings` (set by buildRoomSelection's `options.savings` when a member
  // rate is chosen) and shows it as a "You Saved ₹X" line in its cart
  // sidebar total (StayStep.js:1483/1488). This package computed the same
  // per-room savings figure (see computeRatePlanTotals's totalSavings) but
  // never rolled it up into the stay total the way the cart display needs.
  const totalSavings = rooms.reduce((sum, r) => sum + (parseFloat(r?.savings) || 0), 0);

  // Extra-child/extra-adult surcharge (computeRoomSurcharge, above) — real
  // Amritara adds this on top of the base-occupancy rate whenever a room's
  // guest count exceeds what the rate plan's applicable occupancy already
  // includes, and buckets it inside `totalTax` (see that function's doc
  // comment for the exact real-source line references and the two
  // non-per-night-multiplied source quirks preserved here). Per-room, so it
  // has to be computed per room and summed, not derived from a per-night
  // average like the base rate above.
  let roomTaxTotal = 0;
  let extraChargeTotal = 0;
  const roomSurcharges = roomBreakdowns.map(({ room: r, taxTotal: standardTax }) => {
    const surcharge = computeRoomSurcharge(r);

    // When there's a qualifying extra child, the recomputed GST REPLACES
    // the room's normal tax rather than adding to it — see
    // computeRoomSurcharge's doc comment.
    roomTaxTotal += surcharge.extraChildren >= 1 ? surcharge.extraChildTax : standardTax;
    extraChargeTotal += surcharge.extraChildRoomCharge + surcharge.extraAdultCharge;

    return { roomId: r.roomId, ...surcharge };
  });

  // Pure room base — extraChargeTotal (extra-child/extra-adult surcharge)
  // used to be folded in here, which is why it never had anywhere of its
  // own to be displayed: CartOverview's "Base Stay Cost" silently absorbed
  // it, and nothing showed a separate "Extra Child Rate" line the way real
  // Amritara's cart does (Taxes & Fees -> GST + Extra Child Rate, both
  // itemized). Moved into the tax/fees bucket below instead — grandTotal is
  // unchanged either way, only which bucket the guest sees it in.
  const roomBaseCost = roomBreakdowns.reduce((sum, rb) => sum + rb.baseTotal, 0);
  const addonAmount = addonAmountTotal || 0;
  // addonAmountTotal is sourced from the addon API's `amountAfterTax` field
  // (AddOnsStep.jsx's getAddonAmount) — already tax-inclusive. addonTaxTotal
  // is tracked purely as an informational breakdown of the tax already
  // baked into addonAmount, not an extra charge on top of it — confirmed
  // against real Amritara's own CartOverview.js: its `amountToatal` effect
  // (~245-247) is `totalPrice + addonAmountTotal` (room base+tax, then
  // addon amount) and never adds addonTaxTotal a second time. gstTotal
  // below is GST only (matches real's separate "GST: X" line); combine with
  // extraChargeTotal for the "Taxes & Fees" umbrella total real shows.
  const gstTotal = roomTaxTotal + (addonTaxTotal || 0);
  const taxesAndFeesTotal = gstTotal + extraChargeTotal;
  const grandTotal = roomBaseCost + roomTaxTotal + extraChargeTotal + addonAmount;
  const gstPercent = roomBaseCost > 0 ? Math.round((roomTaxTotal / roomBaseCost) * 100) : 0;

  // Built from each room's own date keys (real per-date OBP data), not from
  // selectedStartDate + i — this reflects exactly what each room's own rate
  // data says was charged for that specific calendar date, so nights whose
  // rates differ show their real, different amounts instead of a repeated
  // first-night figure.
  const allDateKeys = Array.from(
    new Set(roomBreakdowns.flatMap((rb) => rb.nights.map((n) => n.dateKey).filter(Boolean))),
  ).sort();

  const nightRows =
    allDateKeys.length > 0
      ? allDateKeys
      : Array.from({ length: nights }, (_, i) => i); // fallback-only stays: no real date keys at all

  const perNightBreakdown = nightRows.map((dateKeyOrIndex, i) => {
    const isFallback = allDateKeys.length === 0;
    const date = isFallback
      ? (() => {
          const d = selectedStartDate ? new Date(selectedStartDate) : null;
          if (d) d.setDate(d.getDate() + i);
          return d;
        })()
      : (roomBreakdowns
          .flatMap((rb) => rb.nights)
          .find((n) => n.dateKey === dateKeyOrIndex)?.date ?? null);

    return {
      date,
      rooms: roomBreakdowns.map((rb) => {
        const nightEntry = isFallback ? rb.nights[i] : rb.nights.find((n) => n.dateKey === dateKeyOrIndex);
        return {
          roomId: rb.room.roomId,
          roomName: rb.room.roomName,
          amount: nightEntry?.amount ?? 0,
          tax: nightEntry?.tax ?? 0,
        };
      }),
      // Add-ons are billed once (first night only) — mirrors DetailStep.jsx's
      // reservation payload, which attaches the full add-on list only to the
      // first room's first date to avoid duplicate-billing across nights.
      addonAmount: i === 0 ? addonAmount : 0,
      addonTax: i === 0 ? addonTaxTotal || 0 : 0,
    };
  });

  return {
    nights,
    rooms,
    roomBaseCost,
    roomTaxTotal,
    roomSurcharges,
    extraChargeTotal,
    totalSavings,
    addonAmount,
    addonTax: addonTaxTotal || 0,
    gstTotal,
    taxesAndFeesTotal,
    grandTotal,
    gstPercent,
    perNightBreakdown,
  };
}
