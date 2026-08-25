import { defaultTheme } from "./defaultTheme.js";

export function mergeTheme(theme) {
  return {
    colors: { ...defaultTheme.colors, ...theme.colors },
    fonts: { ...defaultTheme.fonts, ...theme.fonts },
    radius: { ...defaultTheme.radius, ...theme.radius },
    spacing: { ...defaultTheme.spacing, ...theme.spacing },
    transition: theme.transition || defaultTheme.transition,
    transitionFast: theme.transitionFast || defaultTheme.transitionFast,
    transitionSlow: theme.transitionSlow || defaultTheme.transitionSlow,
  };
}

export function themeToCssVariables(theme = {}) {
  const merged = mergeTheme(theme);
  const vars = {
    "--be-transition-smooth": merged.transition,
    "--be-transition-fast": merged.transitionFast,
    "--be-transition-slow": merged.transitionSlow,
  };

  for (const [key, value] of Object.entries(merged.colors)) {
    vars[`--be-color-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(merged.fonts)) {
    vars[`--be-font-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(merged.radius)) {
    vars[`--be-radius-${kebabCase(key)}`] = value;
  }
  for (const [key, value] of Object.entries(merged.spacing)) {
    vars[`--be-space-${kebabCase(key)}`] = value;
  }

  return vars;
}

function kebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
