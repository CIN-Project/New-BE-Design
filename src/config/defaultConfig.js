// Deliberately no fontFamily/fontSerif/fontSans keys here — the package
// picks no font on its own by default; it renders with its built-in fonts
// (Cormorant Garamond / Inter) unless a consumer sets one of these three
// (see ConfigProvider.jsx for how they map onto --be-font-serif/--be-font-sans).
export const defaultConfig = {
  otpLength: 6,
  properties: [],
  debug: false,
};
