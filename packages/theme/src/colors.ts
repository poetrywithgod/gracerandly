// Gracerandly - "Violet Dusk" palette, light + dark variants

const palette = {
  violetDeep: "#502D55",
  violetRose: "#935073",
  peach: "#F6DBC0",
  cream: "#F8F4E9",
  white: "#FFFFFF",
  black: "#1A1013",

  success: "#3A9D5D",
  warning: "#E0A93E",
  danger: "#C0392B",
  info: "#3A7CA5",
} as const;

export const lightColors = {
  background: palette.cream,
  surface: palette.white,
  border: palette.peach,

  text: palette.violetDeep,
  textMuted: palette.violetRose,
  textOnPrimary: palette.white,

  primary: palette.violetRose,
  primaryDark: palette.violetDeep,
  accent: palette.peach,

  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  info: palette.info,
} as const;

export const darkColors = {
  background: palette.black,
  surface: "#2A1B2D",
  border: palette.violetDeep,

  text: palette.cream,
  textMuted: palette.peach,
  textOnPrimary: palette.white,

  primary: palette.violetRose,
  primaryDark: palette.peach,
  accent: palette.violetRose,

  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  info: palette.info,
} as const;

export const colors = { light: lightColors, dark: darkColors } as const;

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof typeof lightColors;
