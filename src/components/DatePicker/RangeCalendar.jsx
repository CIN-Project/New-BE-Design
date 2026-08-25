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

  let variant = "";
  if (!isDisabled && !isSoldOut) {
    if (startTime && time === startTime) {
      variant = endTime ? "selected-start" : "selected-single";
    } else if (endTime && time === endTime) {
      variant = "selected-end";
    } else if (startTime && endTime && time > startTime && time < endTime) {
      variant = "selected-range";
    } else if (startTime && !endTime && hoveredDate && time > startTime && time < hoveredDate.getTime()) {
      variant = "selected-range";
    }
  }

  const isSelected = variant === "selected-start" || variant === "selected-end" || variant === "selected-single";

  const classes = ["be-cal-day"];
  if (isDisabled) classes.push("be-cal-day--disabled");
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
    if (!rangeStart || (rangeStart && rangeEnd)) {
      onChangeRange(date, null);
    } else if (rangeStart && !rangeEnd) {
      if (date < rangeStart) {
        onChangeRange(date, null);
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
