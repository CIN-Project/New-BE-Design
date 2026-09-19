
export function normalizeRateName(rateName = "") {
  return rateName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getMemberRateName(standardRateName = "") {
  return normalizeRateName(`Member ${standardRateName}`);
}

export function getRateObpEntry(obp, rateId) {
  const obpEntries = Array.isArray(obp) ? obp : Object.values(obp || {});

  return (
    obpEntries.find((entry) => String(entry?.rateId) === String(rateId)) ||
    obpEntries[0] ||
    null
  );
}

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


export function buildRoomSelection(room, mapping, rate, adults, options = {}) {
  const { isMemberRate = false, savings } = options;

  const ratePlan = room?.RatePlans?.find((el) => el?.RateId === mapping?.RateId);
  const firstDateKey = Object.keys(ratePlan?.Rates || {})[0];
  const firstDateEntry = ratePlan?.Rates?.[firstDateKey];
  const rates = firstDateEntry?.OBP;

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
    childRate: parseFloat(firstDateEntry?.ExtraChildRate?.RateBeforeTax) || 0,
    minInventory: room?.MinInventory,
    packageRateList: ratePlan?.Rates ?? null,
    savings,
  };
}

export function computeRoomSurcharge(selectedRoomEntry) {
  const empty = {
    extraChildren: 0,
    extraAdultCharge: 0,
    extraChildRoomCharge: 0,
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
  }
  // Tax itself is NOT computed here (any more) — getRoomNightlyBreakdown is
  // the single source of truth for per-room tax now, since it needs the
  // exact same extraChildren-gated branch (real STAAH Tax array vs the
  // extra-child GST-slab formula, ported from Amritara's StayStep.js
  // taxesFromRates/extraChildTaxes split, ~275-609) to compute `amount`
  // and `tax` together per night anyway — having it duplicated here too
  // risked the two copies silently drifting apart (they did: this one
  // never picked up Amritara's non-GST ExtraChildRate.Tax passthrough).

  let extraAdultCharge = 0;
  if (adults > maxAdult && dateEntries.length > 0) {
    const extraAdultRate = dateEntries[0]?.ExtraAdultRate;
    if (parseFloat(extraAdultRate?.RateAfterTax) > 1.0) {
      extraAdultCharge = parseFloat(extraAdultRate?.RateBeforeTax || 0);
    }
  }

  return { extraChildren, extraAdultCharge, extraChildRoomCharge, extraChildSaving };
}

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

export function mergeRoomContentWithRates(contentProperty, inventoryRooms, selectedRoom) {
  if (!contentProperty || !Array.isArray(inventoryRooms) || inventoryRooms.length === 0) {
    return { property: null, uniqueRatePlans: [] };
  }
  console.log("Prem inventoryRooms",inventoryRooms);
  console.log("Prem contentProperty",contentProperty);
  console.log("Prem selectedRoom",selectedRoom);

  const dayRateMapping = contentProperty?.Mapping;

  const dayRate = inventoryRooms.map((room) => {
    const updatedRatePlans = (room?.RatePlans || []).map((plan) => {
      const updatedRates = {};

      for (const [dateKey, rateValue] of Object.entries(plan.Rates || {})) {
        const updatedOBP = [];

        for (const sel of selectedRoom || []) {
          console.log("Prem sel.roomId === room.RoomId",sel.roomId === room.RoomId)
          if (sel.roomId === room.RoomId) continue;

          const mapping = dayRateMapping?.find((m) => m?.RateId === plan?.RateId);
          console.log("Prem mapping",mapping);
          const adults = sel.adults || 0;
          const children = sel.children || 0;
          const applicableAdult = mapping?.ApplicableAdult || 0;
          const applicableChild = mapping?.ApplicableChild || 0;
          const applicableGuest = mapping?.ApplicableGuest || 0;
          const maxAdult = mapping?.MaxAdult || 0;
          console.log("Prem adults",adults);
          console.log("Prem children",children);
          console.log("Prem applicableAdult",applicableAdult);
          console.log("Prem applicableChild",applicableChild);
          console.log("Prem applicableGuest",applicableGuest);

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
              console.log("Prem extraChildren",extraChildren)

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
          console.log("Prem baseRate",baseRate);
          console.log("Prem perChildRate",perChildRate)
          console.log("Prem guestRate",guestRate)

          const guestTaxTotal = Array.isArray(guestRate?.Tax)
            ? guestRate.Tax.reduce((s, t) => s + parseFloat(t?.Amount || 0), 0)
            : 0;
            console.log("Prem guestTaxTotal",guestTaxTotal)
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
            console.log("Prem totalRate",totalRate)

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
 * Per-night base rate + tax for one selected room. `extraChildren` must be
 * passed in (from computeRoomSurcharge's own, correctly-cased calculation —
 * see its own doc comment) rather than re-derived here: an earlier version
 * of this function re-derived it independently using WRONG field casing
 * (`selectedRoomEntry.ApplicableAdult` etc. — buildRoomSelection actually
 * sets lowercase `applicableAdult`/`applicableChild`/`applicableGuest`/
 * `maxAdult`), so it silently always read 0 for every applicable-guest
 * limit and could disagree with computeRoomSurcharge's own (correct)
 * extraChildren for the exact same room — e.g. the "Extra Child Rate" line
 * (sourced from computeRoomSurcharge) could show/hide independently of
 * whether the GST here used the extra-child tax formula. Taking it as a
 * parameter makes both agree by construction, and removes the duplicated
 * (and buggy) copy of the same calculation.
 *
 * Tax branch matches Amritara's real StayStep.js rule exactly
 * (taxesFromRates vs extraChildTaxes, ~275-609): with NO extra children,
 * the real per-night STAAH `Tax` array (guestRate.Tax) is used verbatim,
 * summed by name — NOT a guessed slab rate. Only when extraChildren >= 1
 * does STAAH's real Tax get replaced by the 5%/18% slab-rate formula
 * (computed off that night's own base+extra-child rate), same as
 * Amritara's own extraChildTaxes block — and even then, any of
 * ExtraChildRate.Tax's own NON-gst entries are preserved alongside it
 * rather than dropped, also matching Amritara's filter
 * (`!tax.Name.toLowerCase().includes("gst")`).
 */
export function getRoomNightlyBreakdown(selectedRoomEntry, fallbackNights = 1, extraChildren = 0) {
  const dateEntries = Object.entries(selectedRoomEntry?.packageRateList || {});

  if (dateEntries.length === 0) {
    const amount = parseFloat(selectedRoomEntry?.packageRate) || 0;
    const afterTax = Number(selectedRoomEntry?.roomRateWithTax) || 0;
    const tax = Math.max(0, afterTax - amount);
    return {
      baseTotal: amount * fallbackNights,
      taxTotal: tax * fallbackNights,
      taxByName: tax > 0 ? { GST: tax * fallbackNights } : {},
      nights: Array.from({ length: fallbackNights }, () => ({
        dateKey: null,
        date: null,
        amount,
        tax,
        totalTaxes: tax,
        taxLines: tax > 0 ? [{ name: "GST", amount: tax }] : [],
      })),
    };
  }

  let baseTotal = 0;
  let taxTotal = 0;
  const taxByName = {};
  const addTaxLines = (lines) => {
    for (const line of lines) {
      if (!line?.name || !(line.amount > 0)) continue;
      taxByName[line.name] = (taxByName[line.name] || 0) + line.amount;
    }
  };

  const nights = dateEntries
    .map(([dateKey, dateData]) => {
      const guestRate = getGuestRateFromObp(dateData?.OBP, selectedRoomEntry?.adults);
      const amount = parseFloat(guestRate?.RateBeforeTax || "0");

      let taxLines;
      if (extraChildren >= 1) {
        const amountChild = parseFloat(dateData?.ExtraChildRate?.RateBeforeTax) || 0;
        const price = amount + amountChild * extraChildren;
        const gstAmount = price >= 7500 ? Math.round(price * 0.18) : Math.round(price * 0.05);
        const nonGstExtraChildLines = Array.isArray(dateData?.ExtraChildRate?.Tax)
          ? dateData.ExtraChildRate.Tax
              .filter((t) => !String(t?.Name || "").toLowerCase().includes("gst"))
              .map((t) => ({ name: t.Name, amount: parseFloat(t.Amount) || 0 }))
          : [];
        taxLines = [{ name: "GST", amount: gstAmount }, ...nonGstExtraChildLines];
      } else {
        taxLines = Array.isArray(guestRate?.Tax)
          ? guestRate.Tax.map((t) => ({ name: t.Name, amount: parseFloat(t.Amount) || 0 }))
          : [];
      }

      const tax = taxLines.reduce((sum, t) => sum + t.amount, 0);
      baseTotal += amount;
      taxTotal += tax;
      addTaxLines(taxLines);
      const parsedDate = new Date(dateKey);
      return {
        dateKey,
        date: isNaN(parsedDate.getTime()) ? null : parsedDate,
        amount,
        tax,
        totalTaxes: tax,
        taxLines,
      };
    })
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  return { baseTotal, taxTotal, taxByName, nights };
}

export function computeStayTotals({ selectedRoom, selectedStartDate, selectedEndDate, addonAmountTotal, addonTaxTotal }) {
  const nights = nightsBetween(selectedStartDate, selectedEndDate);
  const rooms = (selectedRoom || []).filter((r) => r?.roomId);

  // computeRoomSurcharge runs first per room so its (correctly-cased)
  // extraChildren can be handed to getRoomNightlyBreakdown — see that
  // function's own doc comment for why these must share one value instead
  // of each re-deriving it independently.
  const roomSurchargesByRoom = rooms.map((r) => computeRoomSurcharge(r));
  const roomBreakdowns = rooms.map((r, i) => ({
    room: r,
    ...getRoomNightlyBreakdown(r, nights, roomSurchargesByRoom[i].extraChildren),
  }));

  const totalSavings = rooms.reduce((sum, r) => sum + (parseFloat(r?.savings) || 0), 0);

  let roomTaxTotal = 0;
  let extraChargeTotal = 0;
  const taxByName = {};
  const roomSurcharges = roomBreakdowns.map(({ room: r, taxTotal: roomTax, taxByName: roomTaxByName }, i) => {
    const surcharge = roomSurchargesByRoom[i];

    roomTaxTotal += roomTax;
    extraChargeTotal += surcharge.extraChildRoomCharge + surcharge.extraAdultCharge;
    for (const [name, amount] of Object.entries(roomTaxByName || {})) {
      taxByName[name] = (taxByName[name] || 0) + amount;
    }

    return { roomId: r.roomId, ...surcharge };
  });

  if (addonTaxTotal > 0) {
    // Addon GST isn't itemized by name anywhere upstream (StayContext only
    // ever tracks one flat addonTaxTotal) — folded into the same "GST" key
    // the room-level real tax lines use, rather than inventing a separate
    // "Add-on GST" name with no real source.
    taxByName.GST = (taxByName.GST || 0) + addonTaxTotal;
  }

  const roomBaseCost = roomBreakdowns.reduce((sum, rb) => sum + rb.baseTotal, 0);
  const addonAmount = addonAmountTotal || 0;
  const gstTotal = roomTaxTotal + (addonTaxTotal || 0);
  const taxesAndFeesTotal = gstTotal + extraChargeTotal;
  const grandTotal = roomBaseCost + gstTotal + extraChargeTotal + addonAmount;
  const gstPercent = roomBaseCost > 0 ? Math.round((roomTaxTotal / roomBaseCost) * 100) : 0;

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
          taxLines: nightEntry?.taxLines ?? [],
        };
      }),
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
    // Real tax lines by STAAH's own Name (or the extra-child GST-slab
    // formula's name, "GST"), summed across every room/night — e.g.
    // { GST: 4200, "Service Charge": 300 }. Lets the UI/payload show the
    // actual tax component names instead of a single hardcoded "GST".
    taxByName,
    taxesAndFeesTotal,
    grandTotal,
    gstPercent,
    perNightBreakdown,
  };
}
