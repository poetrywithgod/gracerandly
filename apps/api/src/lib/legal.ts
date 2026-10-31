/**
 * The Privacy Policy and Terms and Conditions, served as public web pages by
 * the API (GET /legal/privacy and /legal/terms). The apps link to them from
 * the signup screen, and the same addresses can be used for the Play Store /
 * App Store listings.
 *
 * Who "we" are is configurable, so nothing is hard-coded to one company:
 *   LEGAL_COMPANY_NAME   default "Gracerandly"
 *   LEGAL_CONTACT_EMAIL  default: the first address in SUPPORT_EMAILS
 *   LEGAL_ADDRESS        optional postal address, shown when set
 *
 * When the text changes in a way people should agree to again, bump
 * LEGAL_VERSION and LEGAL_UPDATED. Each signup stores the version it agreed to.
 */

export const LEGAL_VERSION = "2026-11-01";
const LEGAL_UPDATED = "1 November 2026";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function who() {
  const company = process.env.LEGAL_COMPANY_NAME?.trim() || "Gracerandly";
  const email =
    process.env.LEGAL_CONTACT_EMAIL?.trim() ||
    (process.env.SUPPORT_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean)[0] ||
    "";
  const address = process.env.LEGAL_ADDRESS?.trim() || "";
  return { company: esc(company), email: esc(email), address: esc(address) };
}

function contactLine(): string {
  const w = who();
  const parts = [w.email ? `by email at <a href="mailto:${w.email}">${w.email}</a>` : "", "through <b>Support</b> inside the app"].filter(Boolean);
  return `${parts.join(" or ")}${w.address ? `, or by post at ${w.address}` : ""}`;
}

type Section = [string, string];

function privacySections(): Section[] {
  const w = who();
  return [
    [
      "Who we are and what this policy covers",
      `<p>${w.company} ("<b>Gracerandly</b>", "<b>we</b>", "<b>us</b>") runs the Gracerandly Requester app, the Gracerandly Runner app and the services behind them. They connect people who need an errand done ("<b>Requesters</b>") with people who do errands for payment ("<b>Runners</b>").</p>
<p>This policy explains what personal information we collect, why, who sees it, how long we keep it and what choices you have. We handle personal data in line with the Nigeria Data Protection Act 2023 (NDPA) and other Nigerian law that applies. We are the "data controller" for the information described here.</p>
<p>By ticking the box when you create an account and using the apps, you confirm you have read this policy. If you do not agree with it, please do not create an account.</p>`,
    ],
    [
      "Information we collect",
      `<h3>From everyone</h3>
<ul>
<li><b>Account details:</b> full name, phone number, email address (if you add one), gender (Requesters), and your password. Passwords are stored only in scrambled (hashed) form, never in plain text.</li>
<li><b>Profile:</b> your profile photo and short bio if you add them, and the ratings and reviews you give and receive.</li>
<li><b>Verification codes</b> sent to your phone or email, and password-reset codes.</li>
<li><b>Phone and app details:</b> a push-notification token so we can send you alerts, and basic technical logs (such as IP address and time) used for security and to fix problems.</li>
<li><b>Messages and calls:</b> chat messages, voice notes and call signals between a Requester and a Runner on the same errand. Chats are relayed through our servers to reach the other person and are then kept on your own phone. Audio and video calls run through our calling provider (Agora) and are not recorded by us.</li>
<li><b>Support:</b> what you write when you contact Support or report a problem with an errand.</li>
<li><b>Referrals:</b> the referral code you use or share, and rewards earned.</li>
</ul>
<h3>From Requesters</h3>
<ul>
<li><b>Errand details:</b> what you want done, pickup and drop-off places and locations, extra stops, instructions, items and budget, schedule, and the delivery PIN for the errand.</li>
<li><b>Your location</b> while an errand is active, so your Runner can find you and you can follow your errand on the map. You can also type or pick addresses without sharing live location.</li>
<li><b>Payment information:</b> the amount paid and the status of payments and refunds. Card and bank details are entered on our payment provider's (Paystack) secure page and are never stored by us.</li>
<li><b>Text you type</b> into the "describe your errand" assistant, which is sent to an AI service to fill in the errand form (see "Who we share information with").</li>
</ul>
<h3>From Runners</h3>
<ul>
<li><b>Identity verification:</b> one government-issued ID number of your choice (NIN, BVN, international passport or driver's licence), and a guarantor's name, phone number and relationship to you. This is used only to check that you are who you say you are.</li>
<li><b>Payout details:</b> your bank name, account number and account name, so we can pay you. We check them with Paystack.</li>
<li><b>Your location</b> while you are online and while you have an active errand, including when the app is in the background and the "sharing your location" notification is showing. Requesters on your errand can see where you are. We do not collect your location when you are offline.</li>
<li><b>Errand activity:</b> errands accepted and completed, earnings, receipts or photos you upload for purchases, trust level, payout history, and any safety reports or disputes about you.</li>
</ul>`,
    ],
    [
      "Why we use your information",
      `<ul>
<li>To create and run your account, and to sign you in securely.</li>
<li>To match Requesters and Runners, show errands on the map, track progress, and let the two of you talk to each other.</li>
<li>To take payment, hold it safely until an errand is done, pay Runners, and process refunds and cancellation fees.</li>
<li>To verify Runners and keep the community safe, including reviewing identity details, handling SOS alerts, safety reports, disputes and suspected fraud.</li>
<li>To send service messages: codes, errand updates, receipts, and security alerts by SMS, email and push notification.</li>
<li>To give support, fix problems, and improve the apps (for example by looking at overall errand and usage numbers).</li>
<li>To meet our legal duties and to establish, exercise or defend legal claims.</li>
</ul>
<p>The legal grounds we rely on under the NDPA are: that we need your information to provide the service you asked for (contract); that you have agreed (consent), for example to share your location; that we must follow the law; and our legitimate interests in keeping the service safe and working, where these are not outweighed by your rights.</p>`,
    ],
    [
      "Who we share information with",
      `<p>We do not sell your personal information. We share it only as needed:</p>
<ul>
<li><b>With the other person on your errand.</b> A Runner sees the Requester's name, the errand details, the pickup and drop-off places and the delivery PIN once they accept. A Requester sees the Runner's name, photo, rating, trust level and live location during the errand. Phone numbers are not shown to the other person unless you share them in chat or on a call.</li>
<li><b>Service providers that work for us,</b> under agreements that limit how they may use your data: Paystack (payments, refunds and bank transfers and account checks); our hosting and database providers (Render and Supabase); an SMS provider and an email provider (to deliver codes and messages); Google Firebase / Expo (push notifications); Agora (audio and video calls); and Google (Gemini) to turn a typed errand description into an errand form. We send the AI service only the text you type for that purpose, and you should not put private details such as phone numbers or home addresses in it.</li>
<li><b>Our safety team.</b> If you press SOS, we alert our safety team and the emergency contacts we have configured, with your last known location and errand details so they can reach you.</li>
<li><b>Authorities and advisers.</b> We may disclose information when the law or a court order requires it, to protect people's safety or our rights, or to our professional advisers.</li>
<li><b>A new owner.</b> If the business is sold or merged, your information may move to the new owner, who must follow this policy.</li>
</ul>`,
    ],
    [
      "Where your information is stored",
      `<p>Our providers may store and process data on servers outside Nigeria. When your information leaves Nigeria we take steps to make sure it stays protected, as the NDPA requires, for example by using providers with appropriate security and contractual protections.</p>`,
    ],
    [
      "How long we keep it",
      `<ul>
<li>Account and profile information: for as long as your account is open, and afterwards only as needed for the reasons below.</li>
<li>Errand, payment, refund, payout, dispute and safety records: for as long as financial and legal rules require, and as needed to deal with disputes and fraud.</li>
<li>Runner identity details: while you are a Runner, and for a limited period after you leave, to handle fraud and safety concerns.</li>
<li>Verification and password-reset codes: for minutes only; they expire and are deleted.</li>
<li>Chat messages: kept on your phone, not permanently on our servers. Deleting the app or logging out of a phone removes them from that phone.</li>
<li>Live location: shared between the two people on an errand while it is active. It is held only in the server's memory for those minutes and is not saved to our database or kept afterwards. For Runners we also keep the last position they reported while online, so nearby errands can be shown; it is replaced each time it updates.</li>
</ul>
<p>When we no longer need information, we delete it or make it anonymous.</p>`,
    ],
    [
      "Your rights",
      `<p>Under the NDPA you have the right to:</p>
<ul>
<li>ask what personal information we hold about you and get a copy;</li>
<li>have wrong or incomplete information corrected (you can fix most of it in the app's profile screen);</li>
<li>ask us to delete your information, or restrict how we use it, where the law allows (we may have to keep some records, as explained above);</li>
<li>object to certain uses, including direct marketing;</li>
<li>withdraw your consent at any time, for example by switching off location permission in your phone's settings (some features, like going online as a Runner, will not work without it);</li>
<li>receive your information in a common format (data portability); and</li>
<li>complain to the Nigeria Data Protection Commission (NDPC) if you think we have mishandled your data.</li>
</ul>
<p>To use any of these rights, contact us ${contactLine()}. We may need to confirm who you are first, and we will answer within the time the law requires.</p>`,
    ],
    [
      "Security",
      `<p>We protect your information with measures such as encrypted connections (HTTPS), hashed passwords, access limited to the staff who need it, role-based accounts with an audit trail for our admin tools, and limits on repeated login attempts. No system is perfectly secure. Please choose a strong password, keep it private, and tell us straight away if you think your account has been used by someone else. If a breach is likely to put your rights at risk we will notify you and the NDPC as the law requires.</p>`,
    ],
    [
      "Children",
      `<p>Gracerandly is for people aged 18 and over. We do not knowingly collect information from anyone under 18. If you believe a child has created an account, please contact us and we will remove it.</p>`,
    ],
    [
      "Permissions the apps ask for",
      `<ul>
<li><b>Location:</b> to find errands near you, show positions on the map and confirm pickup and delivery. Runners' location sharing during an errand continues in the background and is shown by a notification.</li>
<li><b>Camera, photos and microphone:</b> for profile pictures, receipts, voice notes and calls. Each is asked only when you use that feature.</li>
<li><b>Notifications:</b> for errand updates, messages and incoming calls.</li>
</ul>
<p>You can change these any time in your phone's settings.</p>`,
    ],
    [
      "Changes to this policy",
      `<p>We may update this policy. When we make an important change we will tell you in the app or by message, and show the new date below. Using the apps after a change means you accept the updated policy, and where the law requires it we will ask for your consent again.</p>`,
    ],
    [
      "Contact us",
      `<p>Questions or requests about your personal information: ${contactLine()}.</p>`,
    ],
  ];
}

function termsSections(): Section[] {
  const w = who();
  return [
    [
      "About these terms",
      `<p>These Terms and Conditions ("<b>Terms</b>") are the agreement between you and ${w.company} ("<b>Gracerandly</b>", "<b>we</b>", "<b>us</b>") for using the Gracerandly Requester app, the Gracerandly Runner app and related services (the "<b>Service</b>"). By ticking the box when you create an account, or by using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not create an account or use the Service.</p>`,
    ],
    [
      "What Gracerandly is",
      `<p>Gracerandly is a platform that connects Requesters, who need an errand done (shopping, pickups, deliveries and similar tasks), with Runners, who choose to do those errands for payment. We provide the technology, payment handling and support. <b>We do not do errands ourselves.</b> Runners are independent people, not our employees, agents or partners, and they decide when and whether to work. Each errand is an arrangement between the Requester and the Runner, which we help to manage.</p>`,
    ],
    [
      "Who can use it",
      `<ul>
<li>You must be at least 18 and able to enter a binding contract in Nigeria.</li>
<li>You must give true, current information, and keep it up to date. One person may hold one account of each type.</li>
<li>You are responsible for keeping your password secret and for everything done through your account. Tell us at once if you think someone else has used it.</li>
<li>Runners must complete identity verification, which we review before you can go online or accept errands. We may approve, refuse or remove verification at our discretion.</li>
</ul>`,
    ],
    [
      "Rules for everyone",
      `<p>You agree not to:</p>
<ul>
<li>break the law, or use the Service for anything illegal, fraudulent or harmful;</li>
<li>request, carry, buy or deliver anything illegal or dangerous, including drugs, weapons, stolen goods, explosives or anything else prohibited by Nigerian law, or anything we list as not allowed in the app;</li>
<li>harass, threaten, discriminate against, or endanger anyone, or share another person's private information;</li>
<li>pretend to be someone else, create fake or duplicate accounts, or give false identity or guarantor details;</li>
<li>take an errand or payment outside the app to avoid our fees, or misuse referral, refund, dispute or SOS features;</li>
<li>try to hack, copy, overload or reverse-engineer the Service, or use bots or scrapers.</li>
</ul>
<p>We may remove content, suspend or close accounts, and report unlawful activity to the authorities where we think these rules have been broken.</p>`,
    ],
    [
      "Requesters: posting errands and paying",
      `<ul>
<li>You must describe your errand accurately, give correct addresses and contact details, and be reachable. You must not ask a Runner to do anything unsafe or unlawful.</li>
<li>The price shown is an estimate before a Runner accepts. For errands that involve buying items, the items budget you set is held for the purchase. The Runner buys items and uploads proof, and any unspent budget is returned to you.</li>
<li>When you pay, the money is held by us (in "escrow") and released to the Runner only after delivery is confirmed, for example with the delivery PIN. Give the PIN only to the person receiving the errand, and only once it is handed over.</li>
<li>Payments are processed by Paystack. By paying you also agree to Paystack's terms. We do not store your card details.</li>
<li>Our service fee (commission) and any cancellation fee are shown in the app before you confirm, and may change from time to time. Changes apply to errands paid for after the change.</li>
</ul>`,
    ],
    [
      "Runners: doing errands and getting paid",
      `<ul>
<li>You are an independent contractor. You choose when to go online and which errands to accept, you use your own phone and transport, and you are responsible for your own tax, insurance, licences (for example a driver's licence if you drive) and safety.</li>
<li>Do the errand carefully and honestly, treat people with respect, and follow the errand's instructions and the law. Do not open or tamper with sealed parcels, and never ask for payment outside the app.</li>
<li>If you buy items, spend only within the budget, keep and upload proof such as receipts, and return any change as the app instructs.</li>
<li>Your earnings are the errand price less our commission, which is shown in the app. Earnings become available after the errand is delivered, and can be paid out to your verified bank account. Money may be held back while a dispute is open, and a refund to a Requester may be taken from your earnings where a dispute is decided against you.</li>
<li>You must keep your payout details correct. We are not responsible for payments sent to account details you gave us in error.</li>
<li>Your location is shared with the Requester while an errand is active (see the Privacy Policy). Going offline stops this when you have no active errand.</li>
<li>If you cancel an accepted errand repeatedly, behave unsafely, or fail errands, we may lower your trust level or suspend your account.</li>
</ul>`,
    ],
    [
      "Cancellations, refunds and disputes",
      `<ul>
<li>A Requester can cancel an errand before a Runner accepts it for a full refund. After a Runner has accepted but before pickup, a cancellation fee, shown in the app, is paid to the Runner for their time and the rest is refunded. Once the Runner has picked the errand up, contact Support, because real money has been spent.</li>
<li>If no Runner accepts an errand within the time shown in the app, it is cancelled and refunded automatically.</li>
<li>If something goes wrong with a delivered errand, the Requester may report a problem within the dispute window shown in the app. Payment to the Runner is held while we look into it. We may ask both sides for information and we decide in good faith whether to refund the Requester in full or in part, or to reject the report. Our decision is final within the app, but does not affect your legal rights.</li>
<li>Refunds go back through the original payment method and can take several days to appear, depending on the bank.</li>
</ul>`,
    ],
    [
      "Safety and the SOS button",
      `<p>The SOS button alerts our safety team, which then tries to contact you or help. <b>It is not a replacement for the emergency services.</b> In an emergency call 112 (or your local emergency number) first. We cannot guarantee a response time, or that an alert will always reach us, for example if your phone has no signal or data. Use good judgement when meeting people, and report anyone who makes you feel unsafe.</p>`,
    ],
    [
      "Ratings, reviews and messages",
      `<p>You may rate and review the other person after an errand. Reviews must be honest and respectful. We may remove content that breaks these Terms. You keep ownership of what you post, and you give us permission to display and use it to run and improve the Service. Messages and calls between a Requester and a Runner are for the errand only.</p>`,
    ],
    [
      "Suspension and ending your account",
      `<p>You can stop using the Service at any time and ask us to close your account. We may suspend or close an account, with or without notice, if we think you have broken these Terms or the law, put anyone at risk, or abused the Service. Suspended or closed accounts can lose access to pending earnings only where those earnings are connected to the breach, and any money properly owed to you will otherwise still be paid. Some records must be kept as explained in the Privacy Policy.</p>`,
    ],
    [
      "Our responsibility, and its limits",
      `<ul>
<li>We work to keep the Service available and accurate, but it is provided "as is". It may be interrupted, and map, estimate and time information may not be exact.</li>
<li>We are not responsible for what a Requester or Runner does or fails to do, for the quality, legality or safety of items bought or delivered, or for loss or damage to goods in a Runner's care, except where the law says we must be. Requesters and Runners deal with each other at their own risk, and we encourage you to keep valuables out of errands.</li>
<li>To the extent the law allows, we are not liable for indirect or consequential loss (such as lost profit or opportunity), and our total liability to you for any claim about the Service will not be more than the amount you paid us (or, for a Runner, were paid through us) for the errand the claim is about.</li>
<li>Nothing in these Terms limits liability that cannot be limited by law, including for fraud, or for death or personal injury caused by our negligence, or your consumer rights under Nigerian law.</li>
<li>You agree to cover us for loss we suffer because you broke these Terms or the law, or because of something you asked a Runner to do or a Runner did on an errand in breach of these Terms, to the extent the law allows.</li>
</ul>`,
    ],
    [
      "Changes to the Service and these Terms",
      `<p>We may change or stop parts of the Service, and may update these Terms. If a change is important we will tell you in the app or by message before it takes effect. If you keep using the Service after the change, you accept the new Terms. If you do not accept them, you should stop using the Service and close your account.</p>`,
    ],
    [
      "Governing law and disputes",
      `<p>These Terms are governed by the laws of the Federal Republic of Nigeria. We hope to resolve any problem quickly through Support. If we cannot, the courts of Nigeria will have jurisdiction, unless the law gives you the right to go elsewhere.</p>`,
    ],
    [
      "Contact",
      `<p>Questions about these Terms: ${contactLine()}.</p>`,
    ],
  ];
}

const STYLE = `
:root{--bg:#f4ede2;--card:#fff;--ink:#2a1730;--muted:#6f5a74;--brand:#502d55;--rose:#935073;--line:#e8dccb}
@media (prefers-color-scheme: dark){:root{--bg:#1c1220;--card:#27192c;--ink:#f3e9f5;--muted:#c0a9c6;--brand:#d9b3e0;--rose:#e19bc0;--line:#3b2a41}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 56px}
header{display:flex;align-items:center;gap:12px;padding:8px 0 18px}
header b{font-size:20px;letter-spacing:-.01em;color:var(--brand)}
main{background:var(--card);border-radius:20px;padding:26px 22px;box-shadow:0 6px 30px rgba(80,45,85,.08)}
h1{margin:0 0 4px;font-size:28px;line-height:1.2;color:var(--brand)}
.meta{color:var(--muted);margin:0 0 20px;font-size:14px}
.toc{margin:0 0 24px;padding:14px 18px;border:1px solid var(--line);border-radius:14px;font-size:14px}
.toc ol{margin:6px 0 0;padding-left:20px;columns:1}
h2{margin:30px 0 8px;font-size:19px;color:var(--brand)}
h3{margin:16px 0 4px;font-size:15px;color:var(--rose)}
ul{padding-left:22px}li{margin:6px 0}
a{color:var(--rose)}
footer{margin-top:22px;color:var(--muted);font-size:13px;text-align:center}
footer a{margin:0 8px}
@media (min-width:700px){.toc ol{columns:2}main{padding:34px 36px}}
`;

function page(title: string, intro: string, sections: Section[], other: { href: string; label: string }): string {
  const w = who();
  const toc = sections.map(([h], i) => `<li><a href="#s${i + 1}">${esc(h)}</a></li>`).join("");
  const body = sections
    .map(([h, html], i) => `<h2 id="s${i + 1}">${i + 1}. ${esc(h)}</h2>\n${html}`)
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Gracerandly</title><meta name="description" content="${esc(intro)}"><style>${STYLE}</style></head>
<body><div class="wrap"><header><b>Gracerandly</b></header>
<main><h1>${esc(title)}</h1>
<p class="meta">Last updated ${LEGAL_UPDATED} · Version ${LEGAL_VERSION}</p>
<nav class="toc" aria-label="Contents"><b>Contents</b><ol>${toc}</ol></nav>
${body}</main>
<footer><a href="${other.href}">${esc(other.label)}</a> · ${w.company}</footer></div></body></html>`;
}

export function privacyPage(): string {
  return page("Privacy Policy", "How Gracerandly collects, uses and protects your personal information.", privacySections(), {
    href: "/legal/terms",
    label: "Terms and Conditions",
  });
}

export function termsPage(): string {
  return page("Terms and Conditions", "The rules for using the Gracerandly Requester and Runner apps.", termsSections(), {
    href: "/legal/privacy",
    label: "Privacy Policy",
  });
}

/** CSP for these pages: inline style only, nothing else loads. */
export const LEGAL_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
