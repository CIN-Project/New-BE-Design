// STAAH add-ons (POST /api/cin-api/add-ons → [0].ExtrasData), priced as on Amritara. Shared by
// AddOnsStep (selection + cart totals) and DetailStep (booking payload), so both agree.
//
//   Type:       "R" = charged every night; anything else ("O", "S") = charged once for the stay
//               (Pride's STAAH add-ons all come as "S", which Amritara's code doesn't price)
//   Applicable: "G" = per guest (AdultRate / ChildRate × the room's adults / children),
//               "D" / "Q" = per unit (Rate)
//
// A chosen add-on is the STAAH add-on plus `roomIndex` (which search room it's for) and `quantity`.

/** The `.INR` entry of a Rate / AdultRate / ChildRate array. */
function inrRate(rateArray) {
  return (rateArray || []).find((r) => r?.INR)?.INR || null;
}

/** Most a guest can pick of one add-on for one room: per-night add-ons once, one-time ones up to 20. */
export function addonMaxQuantity(addon) {
  return addon?.Type === "R" ? 1 : 20;
}

/** Price shown on an add-on's card: after tax, per guest / unit, per night for "R". */
export function addonDisplayPrice(addon) {
  const rate = inrRate(addon?.Rate) || inrRate(addon?.AdultRate) || inrRate(addon?.ChildRate);
  return Number(rate?.amountAfterTax) || 0;
}

/** "guest / night", "night", "guest" or "" — what the display price is per. */
export function addonPriceUnit(addon) {
  return [addon?.Applicable === "G" ? "guest" : "", addon?.Type === "R" ? "night" : ""]
    .filter(Boolean)
    .join(" / ");
}

/**
 * One charge of a chosen add-on for its room (one night for "R", the stay for "O"), as
 * [section, rate, units] lines: Adult + Children for per-guest add-ons, otherwise Base.
 */
export function addonLines(addon, adults, children) {
  const quantity = Number(addon?.quantity) || 1;
  if (addon?.Applicable === "G") {
    return [
      ["Adult", inrRate(addon?.AdultRate) || inrRate(addon?.Rate), adults * quantity],
      ["Children", inrRate(addon?.ChildRate), children * quantity],
    ].filter(([, rate, units]) => rate && units > 0);
  }
  const rate = inrRate(addon?.Rate) || inrRate(addon?.AdultRate);
  return rate ? [["Base", rate, quantity]] : [];
}

/**
 * Pre-tax amount and tax of a chosen add-on for the whole stay. Kept apart because the cart adds
 * addonAmountTotal and addonTaxTotal together (as it does a room's base and tax).
 */
export function addonStayCharge(addon, { adults, children, nights }) {
  const times = addon?.Type === "R" ? nights : 1;
  return addonLines(addon, adults, children).reduce(
    (acc, [, rate, units]) => {
      const afterTax = Number(rate.amountAfterTax) || 0;
      const tax = Number(rate.tax) || 0;
      return {
        amount: acc.amount + (afterTax - tax) * units * times,
        tax: acc.tax + tax * units * times,
      };
    },
    { amount: 0, tax: 0 },
  );
}

function rateSection(rate, units) {
  return {
    Quantity: String(units),
    AmountAfterTax: ((Number(rate.amountAfterTax) || 0) * units).toFixed(2),
    Tax: ((Number(rate.tax) || 0) * units).toFixed(2),
    Taxes: Array.isArray(rate.taxes)
      ? rate.taxes.map((tx) => ({
          Amount: ((Number(tx?.Amount) || 0) * units).toFixed(2),
          TaxId: tx?.ID || "0",
          taxName: tx?.Name || "",
        }))
      : [],
    PricePerUnit: rate.amount,
  };
}

/**
 * STAAH `Addons` for one room on one night of the payload (matches Amritara's DetailStep): the
 * room's per-night add-ons on every night, its one-time add-ons on the check-in night only.
 */
export function roomNightAddons(selectedAddOns, { roomIndex, nightIndex, adults, children }) {
  return (selectedAddOns || [])
    .filter((addon) => (addon?.roomIndex ?? 0) === roomIndex && (addon?.Type === "R" || nightIndex === 0))
    .map((addon) => {
      const sections = {};
      let amount = 0;
      for (const [name, rate, units] of addonLines(addon, adults, children)) {
        sections[name] = rateSection(rate, units);
        amount += Number(sections[name].AmountAfterTax);
      }
      return {
        AddonId: addon?.AddonId ?? "",
        AddonName: addon?.AddonName ?? "",
        AddonType: addon?.Type ?? "",
        PriceType: addon?.Applicable ?? "",
        AmountAfterTax: amount.toFixed(2),
        ...sections,
      };
    });
}

/** One chosen add-on for the whole stay (booking details JSON / confirmation voucher). */
export function addonSummary(addon, { adults, children, nights }) {
  const { amount, tax } = addonStayCharge(addon, { adults, children, nights });
  return {
    AddonId: addon?.AddonId ?? "",
    AddonName: addon?.AddonName ?? "",
    AddonType: addon?.Type ?? "",
    PriceType: addon?.Applicable ?? "",
    Quantity: String(Number(addon?.quantity) || 1),
    RoomNo: (addon?.roomIndex ?? 0) + 1,
    AmountAfterTax: (amount + tax).toFixed(2),
  };
}
