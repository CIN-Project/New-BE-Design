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
  // When true (with enableAddOns), on phones (≤768px) the add-ons open as a drawer sliding in from
  // the right when the guest details step loads, with Skip / Continue, instead of the carousel under
  // the form; the cart's summary gets an "Add-ons … Modify" row that opens the drawer again.
  mobileAddOnsDrawer: false,
  // When false, the "Pay & Confirm Booking" / "Confirm & Pay" buttons are hidden and Pay Later is the
  // only (primary-styled) way to book.
  enablePayNow: true,
  // Text for the search bar's submit button (e.g. "Find Hotels"). Empty keeps the round magnifier
  // icon; the compact recap bar always keeps the icon.
  searchButtonLabel: "",
  // When true, the full search bar is a slimmer rounded rectangle (not a pill): narrower, less
  // padding, smaller labels/values/icons, and a rounded-rectangle text button. Compact bar unchanged.
  slimSearchBar: false,
  // When true, the full search bar's Location / dates / Travelers dropdowns open on the side with
  // room: below the bar when they fit there, otherwise above it only if there is more room above
  // than below. False keeps the old rule (flip up whenever short of room below, even with no room
  // above).
  dropdownsFitToScreen: false,
  // Height covered at the top of the screen (e.g. a fixed site header), in px, not counted as room
  // above the bar by dropdownsFitToScreen. A number, or a function returning one (measured on open).
  dropdownTopOffset: 0,
  properties: [],
  debug: false,
};
