const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDisplayDate(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const monthStr = MONTHS_SHORT[d.getMonth()];
  const yearStr = d.getFullYear().toString().slice(2);
  return `${day} ${monthStr} ${yearStr}`;
}

export function formatIsoDate(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDDMMYYYY(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${m}-${d.getFullYear()}`;
}

export function getMonthDays(year, month) {
  const startDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
  return days;
}

export function isSameDay(a, b) {
  return !!a && !!b && a.getTime() === b.getTime();
}

const IST_OFFSET_MINUTES = 330;

/**
 * "Now", shifted to India Standard Time regardless of the browser's own
 * timezone — ported from Flatpicker.js's getShiftedDateForFlatpickr
 * (~38-42). STAAH's inventory/rate-et backend determines "today" (which
 * dates are bookable, where a 6-month rate-fetch window starts) in IST; a
 * guest browsing from a timezone ahead of or behind India could otherwise
 * see the calendar's "today" boundary and fetch-range boundaries land on
 * the wrong side of midnight IST versus what the backend actually
 * considers today. Use this (not `new Date()`) anywhere "today" needs to
 * match what the backend means by it — not for formatting a date the
 * guest actually picked, which should stay in their own local calendar.
 */
export function getISTNow() {
  const date = new Date();
  const diffMinutes = IST_OFFSET_MINUTES + date.getTimezoneOffset();
  return new Date(date.getTime() + diffMinutes * 60 * 1000);
}
