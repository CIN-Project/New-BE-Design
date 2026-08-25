"use client";

import { createContext, useContext, useMemo } from "react";
import { defaultTheme } from "./defaultTheme.js";
import { themeToCssVariables, mergeTheme } from "./cssVariables.js";
import "./theme.css";

const ThemeContext = createContext(defaultTheme);

export function BookingEngineThemeProvider({
  theme = {},
  children,
  as: Tag = "div",
  ...rest
}) {
  const cssVars = useMemo(() => themeToCssVariables(theme), [theme]);
  const value = useMemo(() => mergeTheme(theme), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      <Tag data-be-root style={cssVars} {...rest}>
        {children}
      </Tag>
    </ThemeContext.Provider>
  );
}

export function useBookingEngineTheme() {
  return useContext(ThemeContext);
}
