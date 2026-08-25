"use client";

import { useMemo } from "react";
import { defaultConfig } from "./defaultConfig.js";
import { ConfigContext } from "./configContext.js";

export function BookingEngineProvider({ config = {}, children }) {
  const value = useMemo(() => ({ ...defaultConfig, ...config }), [config]);

  // Font override via config, as an alternative to BookingEngineThemeProvider's
  // `theme.fonts` (that path still works — this is additive, not a
  // replacement). `fontFamily` sets both roles at once for a consumer with
  // just one brand font; `fontSerif`/`fontSans` override either individually
  // and win over `fontFamily` for that slot. Nothing set here (the default)
  // means the package's built-in fonts render untouched — this package never
  // picks a font on its own from config.
  const fontVars = {};
  if (value.fontFamily) {
    fontVars["--be-font-serif"] = value.fontFamily;
    fontVars["--be-font-sans"] = value.fontFamily;
  }
  if (value.fontSerif) fontVars["--be-font-serif"] = value.fontSerif;
  if (value.fontSans) fontVars["--be-font-sans"] = value.fontSans;

  // Same idea for color, via config instead of BookingEngineThemeProvider's
  // `theme.colors` (that path still works too). These three map onto every
  // --be-color-primary/-hover/-light usage across the whole package (every
  // button background, price, link, active state, form-field icon/label —
  // see StayStep.css/SearchBar.css/Button.css etc., all of which read from
  // these same three tokens). Nothing set here means the package's built-in
  // gold palette renders untouched.
  const colorVars = {};
  if (value.primaryColor) colorVars["--be-color-primary"] = value.primaryColor;
  if (value.primaryHoverColor) colorVars["--be-color-primary-hover"] = value.primaryHoverColor;
  if (value.primaryLightColor) colorVars["--be-color-primary-light"] = value.primaryLightColor;

  return (
    <ConfigContext.Provider value={value}>
      {/* display:contents keeps this invisible to layout (no extra flex/grid
          item) while still letting the CSS custom properties above cascade
          down to every descendant, overriding ThemeProvider's defaults for
          just these variables. */}
      <div style={{ display: "contents", ...fontVars, ...colorVars }}>{children}</div>
    </ConfigContext.Provider>
  );
}

export { useConfig } from "./configContext.js";
