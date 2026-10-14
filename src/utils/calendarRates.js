import { formatIsoDate } from "./date.js";

/**
 * Convert a getDayRateCalendar `DayRate` map (date -> { Rate, ... }, keyed
 * in "YYYY-MM-DD" — confirmed against Flatpicker.js's formatISTDate, which
 * uses `Intl.DateTimeFormat("en-CA", ...)`, the same shape formatIsoDate
 * produces) into the `getDayRate`/`isDateSoldOut` closures RangeCalendar/
 * DateRangeField already accept.
 *
 * Ported from Flatpicker.js's mergeRatesIntoMaps/onDayCreate (~189-208,
 * ~536-551): a day is sold out when its Rate is 0 or "N/A". Amritara's own
 * UI renders the raw number with no currency formatting; this formats it as
 * bawa-hotels-next's calendar does (e.g. "₹7,500"), since design fidelity to
 * bawa is a requirement for this package independent of what Amritara's own
 * (unstyled) calendar happens to do.
 */
export function buildCalendarRateLookup(dayRateMap) {
  const byIsoDate = dayRateMap || {};

  function rawRate(date) {
    return byIsoDate[formatIsoDate(date)]?.Rate;
  }

  function isSoldOutRate(rate) {
    return rate === 0 || rate === "0" || rate === "N/A";
  }

  function isDateSoldOut(date) {
    const rate = rawRate(date);
    return rate === undefined ? false : isSoldOutRate(rate);
  }

  function getDayRate(date) {
    const rate = rawRate(date);
    if (rate === undefined || isSoldOutRate(rate)) return null;
    const numeric = Number(rate);
    if (Number.isNaN(numeric)) return null;
    return `₹${Math.round(numeric).toLocaleString("en-IN")}`;
  }

  return { getDayRate, isDateSoldOut };
}
