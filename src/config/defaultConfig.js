// Deliberately no fontFamily/fontSerif/fontSans keys here — the package
// picks no font on its own by default; it renders with its built-in fonts
// (Cormorant Garamond / Inter) unless a consumer sets one of these three
// (see ConfigProvider.jsx for how they map onto --be-font-serif/--be-font-sans).
export const defaultConfig = {
  otpLength: 6,
  // Adults pre-filled for the first search room and every room the guest adds (1–4).
  defaultAdults: 1,
  // When true, the search starts on tonight → tomorrow instead of empty dates.
  prefillDefaultDates: false,
  // When true, each booking step (room selection → guest details → …) gets its own browser history
  // entry, so the browser's Back button returns to the previous step instead of leaving the page.
  syncWizardStepToUrl: false,
  // When true, the hotel's STAAH add-ons are offered under the guest details form, per room, and
  // sent with the booking.
  enableAddOns: false,
  // When false, the "Pay & Confirm Booking" / "Confirm & Pay" buttons are hidden and Pay Later is the
  // only (primary-styled) way to book.
  enablePayNow: true,
  // Text for the search bar's submit button (e.g. "Find Hotels"). Empty keeps the round magnifier
  // icon; the compact recap bar always keeps the icon.
  searchButtonLabel: "",
  // When true, the full search bar is a slimmer rounded rectangle (not a pill): narrower, less
  // padding, smaller labels/values/icons, and a rounded-rectangle text button. Compact bar unchanged.
  slimSearchBar: false,
  properties: [],
  debug: false,
};
