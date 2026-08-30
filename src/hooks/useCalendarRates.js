"use client";

import { useEffect, useRef, useState } from "react";
import { useConfig } from "../config/configContext.js";
import { getDayRateCalendar } from "../api/rates.js";
import { buildCalendarRateLookup } from "../utils/calendarRates.js";
import { formatIsoDate, getISTNow } from "../utils/date.js";

// Fixed 6-month chunks, loaded lazily as the calendar is navigated forward —
// matches Flatpicker.js exactly: an initial "0-6" fetch on property select,
// then "6-12"/"12-18" fetched on demand via onMonthChange. Never one large
// multi-month call. Extracted from SearchBar.jsx so any consumer that needs
// a live-priced calendar (the search bar, the cart sidebar's "Modify Dates"
// modal) shares this exact fetch/caching behavior instead of duplicating it.
const CALENDAR_RANGES = [
  { key: "0-6", from: 0, to: 6 },
  { key: "6-12", from: 6, to: 12 },
  { key: "12-18", from: 12, to: 18 },
];

/**
 * Self-fetches real per-day rates/sold-out markers for `propertyId` in fixed
 * 6-month chunks. Pass `getDayRate`/`isDateSoldOut` to override with a
 * caller-supplied source instead (self-fetch is then skipped entirely).
 */
export function useCalendarRates(
  propertyId,
  { getDayRate, isDateSoldOut } = {},
) {
  const config = useConfig();
  const dayRateMapRef = useRef({});
  const loadedRangesRef = useRef(new Set());
  const currentPropertyIdRef = useRef(null);
  const [, setDayRateVersion] = useState(0);
  const [loadingRanges, setLoadingRanges] = useState(() => new Set());

  const selfFetchDisabled = Boolean(getDayRate && isDateSoldOut);

  const fetchCalendarChunk = (key, fromMonths, toMonths, pid) => {
    if (loadedRangesRef.current.has(key)) return;
    loadedRangesRef.current.add(key);
    setLoadingRanges((prev) => new Set(prev).add(key));

    // IST, not the browser's local time — see getISTNow's doc comment.
    // Real Amritara's fetch-range boundaries are computed against IST
    // "today"; using local time here could put a guest outside IST off by
    // a day on which 6-month chunk actually covers "now".
    const today = getISTNow();
    const from = new Date(today);
    from.setMonth(from.getMonth() + fromMonths);
    const to = new Date(today);
    to.setMonth(to.getMonth() + toMonths);

    getDayRateCalendar(config, {
      propertyId: pid,
      fromDate: formatIsoDate(from),
      toDate: formatIsoDate(to),
    })
      .then((data) => {
        if (pid !== currentPropertyIdRef.current) return;
        dayRateMapRef.current = { ...dayRateMapRef.current, ...data };
        setDayRateVersion((v) => v + 1);
      })
      .catch(() => {
        loadedRangesRef.current.delete(key);
      })
      .finally(() => {
        setLoadingRanges((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  };

  // Property changed: reset everything and fetch the initial 0-6 month chunk.
  useEffect(() => {
    currentPropertyIdRef.current = propertyId;
    dayRateMapRef.current = {};
    loadedRangesRef.current = new Set();
    setDayRateVersion((v) => v + 1);
    setLoadingRanges(new Set());

    if (!propertyId || selfFetchDisabled) return;
    fetchCalendarChunk("0-6", 0, 6, propertyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, propertyId, selfFetchDisabled]);

  // Calendar navigated forward: lazily load the 6-12 / 12-18 chunk the
  // newly-visible month falls into, if not already loaded.
  const handleCalendarMonthChange = (month, year) => {
    if (!propertyId || selfFetchDisabled) return;

    const today = getISTNow();
    const visible = new Date(year, month, 1);
    const diffMonths =
      (visible.getFullYear() - today.getFullYear()) * 12 +
      (visible.getMonth() - today.getMonth());

    for (const range of CALENDAR_RANGES) {
      if (range.key === "0-6") continue;
      if (diffMonths >= range.from && diffMonths < range.to) {
        fetchCalendarChunk(range.key, range.from, range.to, propertyId);
      }
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calendarLookup = buildCalendarRateLookup(dayRateMapRef.current);
  const resolvedGetDayRate = getDayRate || calendarLookup.getDayRate;
  const resolvedIsDateSoldOut = isDateSoldOut || calendarLookup.isDateSoldOut;

  const isDateRateLoading = (date) => {
    if (selfFetchDisabled || loadingRanges.size === 0) return false;
    const today = getISTNow();
    const diffMonths =
      (date.getFullYear() - today.getFullYear()) * 12 +
      (date.getMonth() - today.getMonth());
    return CALENDAR_RANGES.some(
      (range) =>
        loadingRanges.has(range.key) &&
        diffMonths >= range.from &&
        diffMonths < range.to,
    );
  };

  return {
    getDayRate: resolvedGetDayRate,
    isDateSoldOut: resolvedIsDateSoldOut,
    isDateRateLoading,
    handleCalendarMonthChange,
  };
}
