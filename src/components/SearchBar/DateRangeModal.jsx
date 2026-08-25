"use client";

import { Modal } from "../shared/Modal.js";
import { RangeCalendar } from "../DatePicker/RangeCalendar.js";
import { useSearchContext } from "../../context/SearchContext.js";
import { useCalendarRates } from "../../hooks/useCalendarRates.js";
import { formatDisplayDate } from "../../utils/date.js";
import "./DateRangeModal.css";

function nightsBetween(start, end) {
  if (!start || !end) return 0;
  return Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
}

/**
 * "Modify Dates" — reached from the cart sidebar's "Modify Dates" link.
 * Reads and writes SearchContext's selectedStartDate/selectedEndDate
 * directly (the same state the search bar's own date field uses), so a
 * change made here is visible everywhere else in the app immediately —
 * there's no separate local copy of the dates to keep in sync.
 */
export function DateRangeModal({ isOpen, onClose }) {
  const search = useSearchContext();
  const { getDayRate, isDateSoldOut, isDateRateLoading, handleCalendarMonthChange } = useCalendarRates(
    search.selectedPropertyId
  );
  const nights = nightsBetween(search.selectedStartDate, search.selectedEndDate);

  const handleChangeRange = (start, end) => {
    if (end) {
      search.setSelectedDates(start, end);
      onClose?.();
    } else {
      search.setSelectedStartDate(start);
      search.setSelectedEndDate(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Modify Booking Dates"
      subtitle="Select check-in and check-out dates to view real-time rates"
      maxWidth={740}
    >
      <div className="be-date-modal-summary">
        <div className="be-date-modal-col">
          <span className="be-date-modal-label">Check-in</span>
          <div className="be-date-modal-value">{formatDisplayDate(search.selectedStartDate) || "Select date"}</div>
        </div>
        <div className="be-date-modal-nights">
          {nights > 0 && <span>{nights} Night{nights === 1 ? "" : "s"}</span>}
          <span className="be-date-modal-arrow" aria-hidden="true">&rarr;</span>
        </div>
        <div className="be-date-modal-col be-date-modal-col-right">
          <span className="be-date-modal-label">Check-out</span>
          <div className="be-date-modal-value">{formatDisplayDate(search.selectedEndDate) || "Select date"}</div>
        </div>
      </div>

      <RangeCalendar
        embedded
        rangeStart={search.selectedStartDate}
        rangeEnd={search.selectedEndDate}
        onChangeRange={handleChangeRange}
        getDayRate={getDayRate}
        isDateSoldOut={isDateSoldOut}
        isDateRateLoading={isDateRateLoading}
        onMonthChange={handleCalendarMonthChange}
      />
    </Modal>
  );
}
