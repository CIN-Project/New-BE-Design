"use client";

import { useEffect, useState } from "react";
import { getMonthDays, MONTH_NAMES, getISTNow } from "../../utils/date.js";
import "./RangeCalendar.css";

function DayCell({
  day,
  rangeStart,
  rangeEnd,
  hoveredDate,
  onHover,
  onSelect,
  getDayRate,
  isDateSoldOut,
  isDateDisabled,
  isDateRateLoading,
  isDayUse,
}) {
  if (!day) return <span className="be-cal-day be-cal-day--empty" />;

  // IST "today", not the browser's local midnight — see getISTNow's doc
  // comment. A guest browsing from outside IST could otherwise see a date
  // as bookable (or not) one day off from what the backend actually allows.
  const now = getISTNow();
  now.setHours(0, 0, 0, 0);
  const isDisabled = isDateDisabled ? isDateDisabled(day) : day < now;
  const isSoldOut = !isDisabled && isDateSoldOut ? isDateSoldOut(day) : false;
  const rateText = isSoldOut ? "Sold" : getDayRate ? getDayRate(day) : null;
  // While rate-et is still loading the chunk covering this date, show a
  // skeleton in place of the price pill instead of a blank cell.
  const isRateLoading = !isDisabled && !isSoldOut && !rateText && isDateRateLoading ? isDateRateLoading(day) : false;

  const time = day.getTime();
  const startTime = rangeStart ? rangeStart.getTime() : 0;
  const endTime = rangeEnd ? rangeEnd.getTime() : 0;

  // Computed regardless of isDisabled/isSoldOut — a date the guest already
  // picked as check-in/out must always read as clearly selected, even if
  // it would otherwise be disabled/sold-out for a *new* pick (e.g. it's
  // today and a cutoff-time rule kicks in, or a sold-out flag arrives after
  // the pick was already made). Previously this only ran when neither was
  // true, so an already-selected date could silently lose its selected
  // background/white text to the disabled/sold-out styling instead —
  // exactly the "faded, hard to see it's selected" bug this fixes.
  // Day Use: handleDayClick sets rangeEnd to the very next day internally
  // (the API/rate lookup still needs a 1-night range under the hood), but
  // there's only ever ONE date a guest is actually picking here — without
  // this branch, the general range logic below reads that internal
  // rangeEnd as a real second endpoint and paints both days as a start/end
  // pair (two half-pills), looking like a 2-night stay was selected
  // instead of a single date.
  let variant = "";
  if (isDayUse) {
    if (startTime && time === startTime) variant = "selected-single";
  } else if (startTime && time === startTime) {
    variant = endTime ? "selected-start" : "selected-single";
  } else if (endTime && time === endTime) {
    variant = "selected-end";
  } else if (startTime && endTime && time > startTime && time < endTime) {
    variant = "selected-range";
  } else if (startTime && !endTime && hoveredDate && time > startTime && time < hoveredDate.getTime()) {
    variant = "selected-range";
  }

  const isSelected = variant === "selected-start" || variant === "selected-end" || variant === "selected-single";

  const classes = ["be-cal-day"];
  if (isSelected) classes.push(`be-cal-day--${variant}`);
  else if (isDisabled) classes.push("be-cal-day--disabled");
  else if (isSoldOut) classes.push("be-cal-day--sold-out");
  else if (variant) classes.push(`be-cal-day--${variant}`);

  const handleClick = () => {
    if (isDisabled || isSoldOut) return;
    onSelect(day);
  };

  return (
    <span
      className={classes.join(" ")}
      onClick={handleClick}
      onMouseEnter={() => !isDisabled && !isSoldOut && onHover(day)}
    >
      <span className="be-cal-day-num">{day.getDate()}</span>
      {rateText && <span className="be-cal-day-rate">{rateText}</span>}
      {isRateLoading && <span className="be-cal-day-rate-skeleton" />}
    </span>
  );
}

/**
 * Dual-month range calendar. Visual/UX faithful to bawa-hotels-next's
 * hand-built calendar (not a flatpickr/react-datepicker skin).
 */
export function RangeCalendar({
  rangeStart,
  rangeEnd,
  onChangeRange,
  openUpwards = false,
  getDayRate,
  isDateSoldOut,
  isDateDisabled,
  isDateRateLoading,
  holidays = [],
  modalRef,
  onMonthChange,
  // "embedded" drops the absolute-positioned dropdown chrome (position,
  // shadow, border, background) so this can sit directly inside another
  // container — e.g. CartOverview's "Modify Dates" modal (SearchBar.jsx
  // instead anchors it as a dropdown below the date field trigger).
  embedded = false,
  // Day Use booking: a single click picks the stay date and immediately
  // commits (start, start+1) as the range — mirrors Flatpicker.js switching
  // flatpickr's own `mode` between "range" and "single" for this same
  // feature. The +1-day end date is purely an internal convention so the
  // existing rate/room search (which is date-*range*-shaped end to end)
  // keeps working unchanged; nothing about it is guest-facing here — the
  // date fields above this calendar collapse to a single "Date" display in
  // day-use mode (see DateRangeField.jsx).
  isDayUse = false,
}) {
  const today = getISTNow();
  const [calStartMonth, setCalStartMonth] = useState(today.getMonth());
  const [calStartYear, setCalStartYear] = useState(today.getFullYear());
  const [hoveredDate, setHoveredDate] = useState(null);

  // Reports the currently-visible left-hand month (including the initial
  // mount) so a consumer can lazily extend a fetched date range as the user
  // navigates forward — mirrors Flatpicker.js's onMonthChange (~425-488),
  // which fetches per-day rates in fixed 6-month chunks rather than one
  // large range.
  useEffect(() => {
    onMonthChange?.(calStartMonth, calStartYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calStartMonth, calStartYear]);

  const prevMonths = (e) => {
    e.stopPropagation();
    setCalStartMonth((prev) => {
      let next = prev - 1;
      if (next < 0) {
        next = 11;
        setCalStartYear((y) => y - 1);
      }
      return next;
    });
  };

  const nextMonths = (e) => {
    e.stopPropagation();
    setCalStartMonth((prev) => {
      let next = prev + 1;
      if (next > 11) {
        next = 0;
        setCalStartYear((y) => y + 1);
      }
      return next;
    });
  };

  const handleDayClick = (date) => {
    if (isDayUse) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      onChangeRange(date, nextDay);
      return;
    }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onChangeRange(date, null);
    } else if (rangeStart && !rangeEnd) {
      if (date < rangeStart) {
        onChangeRange(date, null);
      } else if (date.getTime() === rangeStart.getTime()) {
        // Clicking the same day again as checkout would produce a
        // 0-night stay (check-in === check-out) — treat it as "I want to
        // stay starting here" and advance checkout to the next day
        // instead of accepting an invalid same-day range.
        const nextDay = new Date(rangeStart);
        nextDay.setDate(nextDay.getDate() + 1);
        onChangeRange(rangeStart, nextDay);
      } else {
        onChangeRange(rangeStart, date);
      }
    }
  };

  const secondMonth = (calStartMonth + 1) % 12;
  const secondYear = calStartYear + (calStartMonth === 11 ? 1 : 0);

  return (
    <div
      ref={modalRef}
      className={embedded ? "be-calendar-embedded" : `be-calendar-modal be-modal-anim ${openUpwards ? "be-modal--open-up" : ""}`}
    >
      <div className="be-cal-header-nav">
        <button type="button" className="be-cal-nav-btn" aria-label="Previous Month" onClick={prevMonths}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="be-cal-months-titles">
          <span className="be-cal-month-title">
            {MONTH_NAMES[calStartMonth]} {calStartYear}
          </span>
          <span className="be-cal-month-title">
            {MONTH_NAMES[secondMonth]} {secondYear}
          </span>
        </div>
        <button type="button" className="be-cal-nav-btn" aria-label="Next Month" onClick={nextMonths}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="be-cal-grids">
        {[
          { year: calStartYear, month: calStartMonth },
          { year: secondYear, month: secondMonth },
        ].map(({ year, month }, idx) => (
          <div className="be-cal-month-grid" key={idx}>
            <div className="be-cal-weekdays">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="be-cal-days">
              {getMonthDays(year, month).map((day, i) => (
                <DayCell
                  key={day ? day.getTime() : `empty-${idx}-${i}`}
                  day={day}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  hoveredDate={hoveredDate}
                  onHover={setHoveredDate}
                  onSelect={handleDayClick}
                  getDayRate={getDayRate}
                  isDateSoldOut={isDateSoldOut}
                  isDateDisabled={isDateDisabled}
                  isDateRateLoading={isDateRateLoading}
                  isDayUse={isDayUse}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {holidays.length > 0 && (
        <div className="be-cal-holidays">
          {holidays.map((h, i) => (
            <div className="be-cal-holiday-item" key={i}>
              <span className="be-cal-holiday-bullet" />
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
