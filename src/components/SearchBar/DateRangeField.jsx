"use client";

import { RangeCalendar } from "../DatePicker/RangeCalendar.js";
import { formatDisplayDate } from "../../utils/date.js";

export function DateRangeField({
  selectedStartDate,
  selectedEndDate,
  onChangeRange,
  isOpen,
  onOpen,
  modalRef,
  openUpwards,
  getDayRate,
  isDateSoldOut,
  isDateRateLoading,
  holidays,
  onMonthChange,
}) {
  return (
    // position:relative here is what the calendar below actually anchors
    // to — matches bawa-hotels-next's real structure exactly (globals.css's
    // .calendar-dropdown-modal is a sibling AFTER both date fields,
    // centered under the check-in+check-out pair, not the whole form and
    // not just one narrow field — see that file's own comment: "Center-
    // aligned under check-in and check-out columns"). Anchoring to just the
    // check-in field alone (an earlier attempt at this fix) made the much-
    // wider calendar overhang far past the field's own narrow bounds,
    // looking shifted way too far left. This wrapper is a single grid item
    // in the outer .be-booking-form (see SearchBar.css's grid-template-
    // columns), laying its two children out 50/50 itself so the visual
    // proportions are unchanged from when they were two separate columns.
    <div className="be-date-group-pair" style={{ position: "relative" }}>
      <div className="be-form-group be-date-group" id="be-checkin-trigger" onClick={onOpen}>
        <svg className="be-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <div className="be-form-field-inputs">
          <label>Check-in</label>
          <div className="be-custom-date-display">{formatDisplayDate(selectedStartDate) || "Select date"}</div>
        </div>
      </div>

      <div className="be-form-group be-date-group" id="be-checkout-trigger" onClick={onOpen}>
        <svg className="be-field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <div className="be-form-field-inputs">
          <label>Check-out</label>
          <div className="be-custom-date-display">{formatDisplayDate(selectedEndDate) || "Select date"}</div>
        </div>
      </div>

      {isOpen && (
        <RangeCalendar
          modalRef={modalRef}
          rangeStart={selectedStartDate}
          rangeEnd={selectedEndDate}
          onChangeRange={onChangeRange}
          openUpwards={openUpwards}
          getDayRate={getDayRate}
          isDateSoldOut={isDateSoldOut}
          isDateRateLoading={isDateRateLoading}
          holidays={holidays}
          onMonthChange={onMonthChange}
        />
      )}
    </div>
  );
}
