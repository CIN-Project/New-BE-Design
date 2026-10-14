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

  // Per-element font override via config, for a single specific piece of
  // text/class rather than the whole package (fontFamily/fontSerif/fontSans
  // above cover that broader case). `fontOverrides` maps a class name this
  // package already renders (e.g. "be-room-row-desc", "be-rate-card-title")
  // to a font-family string; each entry becomes its own CSS rule scoped
  // under [data-be-root], which is strictly more specific than every plain
  // single-class selector this package's own CSS files use for the same
  // class — so it wins the cascade without needing `!important`, and without
  // needing to know or match this package's internal CSS load order. Empty/
  // absent by default, same as every other font key here — nothing renders
  // unless a consumer actually sets it.
  const fontOverrideEntries = Object.entries(value.fontOverrides || {});

  return (
    <ConfigContext.Provider value={value}>
      {fontOverrideEntries.length > 0 && (
        <style>
          {fontOverrideEntries
            .map(
              ([className, fontFamily]) =>
                `[data-be-root] .${className} { font-family: ${fontFamily}; }`,
            )
            .join("\n")}
        </style>
      )}
      {/* display:contents keeps this invisible to layout (no extra flex/grid
          item) while still letting the CSS custom properties above cascade
          down to every descendant, overriding ThemeProvider's defaults for
          just these variables. */}
      <div style={{ display: "contents", ...fontVars, ...colorVars }}>{children}</div>
    </ConfigContext.Provider>
  );
}

export { useConfig } from "./configContext.js";
