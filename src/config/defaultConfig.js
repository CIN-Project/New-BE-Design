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
  properties: [],
  debug: false,
};
