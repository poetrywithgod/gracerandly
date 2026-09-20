// Gracerandly font system
// - Sagace: display/headings, brand moments (logo lockups, splash, big titles)
//   NOTE: currently a TRIAL license file (BuroFonts) — confirm/purchase a commercial
//   license before shipping to production.
// - Poppins: primary UI font (buttons, labels, body copy in the apps)
// - Merriweather: longer-form reading (admin dashboard reports, ToS/help content)
export const fonts = {
  display: "Sagace-Bold",
  displayMedium: "Sagace-Medium",
  displayRegular: "Sagace-Regular",
  ui: "Poppins_400Regular",
  uiMedium: "Poppins_500Medium",
  uiSemibold: "Poppins_600SemiBold",
  uiBold: "Poppins_700Bold",
  serif: "Merriweather_400Regular",
  serifBold: "Merriweather_700Bold",
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export type FontToken = keyof typeof fonts;
