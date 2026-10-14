export const defaultTheme = {
  colors: {
    // These three are the package's actual brand-gold palette everywhere
    // (buttons, prices, active states, links) — not primary/primaryHover's
    // previous #C7A36A/#A88650 defaults, which only ever showed up in a
    // couple of accent spots (the calendar's selected-day background). Kept
    // as the same values every component already renders by default, so
    // this rename is a pure config-surface change — zero visual diff
    // unless a consumer's theme prop overrides them.
    primary: "#c7a36a",
    primaryHover: "#bfa15f",
    primaryLight: "#c7a36a",
    onPrimary: "#FFFFFF",
    surface: "#F8F5EF",
    surfaceAlt: "#E8E6E2",
    text: "#1D1D1D",
    textMuted: "rgba(29, 29, 29, 0.65)",
    accent: "#30453A",
    border: "#E8E6E2",
    success: "#2E7D32",
    error: "#C62828",
  },
  fonts: {
    serif: "'Cormorant Garamond', Georgia, serif",
    sans: "'Inter', system-ui, -apple-system, sans-serif",
  },
  radius: {
    sm: "2px",
    md: "4px",
    pill: "999px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "32px",
    xl: "64px",
  },
  transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
  transitionFast: "all 0.3s ease",
  transitionSlow: "all 1.8s cubic-bezier(0.16, 1, 0.3, 1)",
};
