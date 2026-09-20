import { colors, ColorScheme } from "./colors";
import { fonts, fontWeights } from "./fonts";
import { spacing, radius } from "./spacing";

export function getTheme(scheme: ColorScheme = "light") {
  return {
    colors: colors[scheme],
    fonts,
    fontWeights,
    spacing,
    radius,
    scheme,
  };
}

export type Theme = ReturnType<typeof getTheme>;
