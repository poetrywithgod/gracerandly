/**
 * The picture side of the admin sign-in screen: a slideshow that changes every
 * 4 seconds. Built-in on-brand illustrations are used unless photos have been
 * dropped into apps/api/public/admin-login (see the README there), in which case
 * those are shown instead. The list is read once at start-up.
 */
import fs from "node:fs";
import path from "node:path";

export const LOGIN_ART_DIR = path.resolve(__dirname, "../../public/admin-login");

export interface LoginSlide {
  title: string;
  text: string;
  /** Inline SVG markup, or null when `img` is used. */
  svg: string | null;
  img: string | null;
}

const COPY: Array<[string, string]> = [
  ["Every errand, tracked live", "Follow each errand from pickup to doorstep, on one map."],
  ["Money held safely", "Payments stay in escrow until the delivery is confirmed."],
  ["Runners you can trust", "Every runner is identity-checked before they take a job."],
  ["Help when it matters", "SOS alerts, reports and disputes land here first."],
];

const DEFS = (id: string, a: string, b: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="900" fill="url(#${id})"/>`;

const SVGS: string[] = [
  // 1. map with a route and a pin
  `<svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS("g1", "#502D55", "#935073")}
<g stroke="#fff" stroke-opacity=".08" stroke-width="2"><path d="M0 180H800M0 360H800M0 540H800M0 720H800M160 0V900M360 0V900M560 0V900M720 0V900"/></g>
<g fill="#fff" fill-opacity=".07"><rect x="190" y="210" width="140" height="120" rx="14"/><rect x="390" y="390" width="140" height="120" rx="14"/><rect x="590" y="570" width="100" height="120" rx="14"/><rect x="40" y="570" width="100" height="120" rx="14"/></g>
<path d="M130 760C130 560 330 600 340 450S560 400 600 250" fill="none" stroke="#F8DCC4" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 26"/>
<circle cx="130" cy="760" r="22" fill="#F8DCC4"/><circle cx="130" cy="760" r="9" fill="#502D55"/>
<g transform="translate(600 250)"><path d="M0 -112C-62 -112 -104 -66 -104 -10C-104 52 -40 100 0 150C40 100 104 52 104 -10C104 -66 62 -112 0 -112Z" fill="#fff"/><circle cx="0" cy="-12" r="38" fill="#502D55"/><circle cx="62" cy="-86" r="34" fill="#F8DCC4"/><path d="M46 -86L58 -74L80 -100" fill="none" stroke="#502D55" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></g>
<circle cx="340" cy="450" r="14" fill="#fff"/><circle cx="340" cy="450" r="34" fill="#fff" fill-opacity=".18"/></svg>`,
  // 2. shield + coins
  `<svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS("g2", "#3D2142", "#7A4468")}
<g fill="#fff" fill-opacity=".06"><circle cx="120" cy="140" r="170"/><circle cx="720" cy="760" r="230"/></g>
<path d="M400 190L600 270V450C600 580 510 670 400 720C290 670 200 580 200 450V270Z" fill="#fff"/>
<path d="M400 190L600 270V450C600 580 510 670 400 720Z" fill="#F8DCC4"/>
<path d="M318 450L378 510L494 380" fill="none" stroke="#502D55" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
<g font-family="system-ui,sans-serif" font-weight="700" font-size="40" text-anchor="middle"><circle cx="160" cy="720" r="52" fill="#F8DCC4"/><text x="160" y="735" fill="#502D55">₦</text><circle cx="650" cy="190" r="42" fill="#F8DCC4"/><text x="650" y="204" fill="#502D55" font-size="32">₦</text><circle cx="690" cy="640" r="34" fill="#fff" fill-opacity=".85"/><text x="690" y="652" fill="#502D55" font-size="28">₦</text></g></svg>`,
  // 3. ID card with badge
  `<svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS("g3", "#502D55", "#A15A7F")}
<g fill="#fff" fill-opacity=".07"><circle cx="680" cy="150" r="190"/><circle cx="90" cy="800" r="200"/></g>
<g transform="rotate(-6 400 450)"><rect x="140" y="270" width="520" height="340" rx="34" fill="#fff"/><rect x="140" y="270" width="520" height="86" rx="34" fill="#F8DCC4"/><rect x="140" y="320" width="520" height="36" fill="#F8DCC4"/>
<circle cx="260" cy="470" r="62" fill="#935073"/><circle cx="260" cy="452" r="24" fill="#fff"/><path d="M212 520C222 488 298 488 308 520" fill="#fff"/>
<rect x="360" y="430" width="230" height="22" rx="11" fill="#E7D8E2"/><rect x="360" y="472" width="170" height="22" rx="11" fill="#E7D8E2"/><rect x="360" y="514" width="200" height="22" rx="11" fill="#E7D8E2"/></g>
<g transform="translate(590 620)"><circle r="82" fill="#502D55"/><circle r="64" fill="#F8DCC4"/><path d="M-30 4L-8 28L34 -22" fill="none" stroke="#502D55" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
  // 4. SOS rings
  `<svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${DEFS("g4", "#2F1A34", "#935073")}
<g fill="none" stroke="#fff"><circle cx="400" cy="450" r="330" stroke-opacity=".07" stroke-width="2"/><circle cx="400" cy="450" r="260" stroke-opacity=".1" stroke-width="2"/><circle cx="400" cy="450" r="190" stroke-opacity=".16" stroke-width="2"/></g>
<circle cx="400" cy="450" r="150" fill="#F8DCC4"/><circle cx="400" cy="450" r="118" fill="#fff"/>
<text x="400" y="486" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="96" fill="#502D55" letter-spacing="2">SOS</text>
<g transform="translate(610 230)"><path d="M0 -62C-44 -62 -66 -28 -66 12V48L-84 70H84L66 48V12C66 -28 44 -62 0 -62Z" fill="#fff"/><path d="M-22 84C-20 106 20 106 22 84Z" fill="#F8DCC4"/></g>
<circle cx="170" cy="700" r="14" fill="#F8DCC4"/><circle cx="220" cy="190" r="9" fill="#fff" fill-opacity=".6"/><circle cx="660" cy="720" r="9" fill="#fff" fill-opacity=".6"/></svg>`,
];

export function loginSlides(): LoginSlide[] {
  let photos: string[] = [];
  try {
    photos = fs
      .readdirSync(LOGIN_ART_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    photos = [];
  }
  if (photos.length) {
    return photos.slice(0, 8).map((f, i) => ({
      title: COPY[i % COPY.length][0],
      text: COPY[i % COPY.length][1],
      svg: null,
      img: `/admin/login-art/${encodeURIComponent(f)}`,
    }));
  }
  return SVGS.map((svg, i) => ({ title: COPY[i][0], text: COPY[i][1], svg, img: null }));
}
