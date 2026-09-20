# Gracerandly Brand Assets

Generated from the uploaded logo banner. Background removed; light-mode and dark-mode
colorways built from the Violet Dusk palette already in `packages/theme`.

Suggested placement in the monorepo: `packages/brand-assets/`
(shared across `apps/requester`, `apps/runner`, `apps/admin`, and the API's email/docs use).

## /icon — the app-icon badge (original artwork, own background)
Use this for actual app icons (iOS/Android/Expo `app.json`) and anywhere you need
the fixed, always-on-brand square badge — like WhatsApp or Slack's icon, it does not
change with light/dark mode.
- `app-icon-{64,128,180,256,512,1024}.png` — full-bleed square, various sizes
- `app-icon-rounded-1024.png` — same art, corners masked transparent (for web/README use where the OS won't auto-round it)
- `app-icon.svg` — vector trace of the badge art

## /favicon
- `favicon.ico` — multi-resolution (16/32/48/64/128/256), ready for `apps/admin/public/`

## /mark — the pin+checkmark symbol alone, transparent background
Recolored two ways using the Violet Dusk theme tokens, for inline use (headers, loading
states, empty states, in-app iconography) where the app already controls the surface color:
- `mark-dark-mode-*.png` / `.svg` — cream pin + peach circle → use on dark surfaces
- `mark-light-mode-*.png` / `.svg` — deep violet pin + rose circle → use on light surfaces
The checkmark and the pin's center dot are transparent "holes" by design — they'll pick up
whatever is behind them, which is what makes one shape work on both light and dark.

## /wordmark — "Gracerandly" + tagline, transparent background
- `wordmark-dark-mode.png` (+ sized variants) / `.svg` — as in the original design, for dark surfaces
- `wordmark-light-mode.png` (+ sized variants) / `.svg` — recolored for light surfaces

## /lockup — mark + wordmark combined, transparent background
- `lockup-dark-mode.png` — for dark headers/splash screens
- `lockup-light-mode.png` — for light headers, the admin dashboard top bar, printed docs

## Notes
- SVGs are auto-traced from the raster art (vtracer), not hand-drawn vectors — they'll
  scale cleanly but re-tracing from a true vector source later (Figma/Illustrator export)
  would give smaller, cleaner path data if you ever have one.
- Colors used: cream `#F8F4E9`, peach `#F6DBC0`, violetRose `#935073`, violetDeep `#502D55`
  — matching `packages/theme/src/colors.ts`.
