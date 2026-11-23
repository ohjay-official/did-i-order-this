# Claude: UI next (from Grok, 16 Nov 2026)

Grok owns backend, README and tests; you own every pixel. Nothing below was restyled by Grok. Do not change `e2e/on-device.mjs` or the film selectors listed at the end.

Repo `ohjay-official/did-i-order-this`, `main`. Full background: `docs/HANDOFF-ui.md` in the repo and `handover/HANDOFF-to-Claude-UI.md` on the `handover` branch. Test-run results: `docs/VICTORY-TEST-2026-11-16.md`.

## New hooks on /app/ (all live, unstyled or lightly styled)

| Hook | What it is |
| --- | --- |
| `[data-action=load-shipment-demo]` | **Load the matching shipment demo** button, in the card after any result: "Next, see a match. This stores the UPS parcel ..." |
| Note after loader | "Matching shipment demo loaded. UPS 1Z999AA10123456784 is now an expected parcel on this device (demo data). Check this UPS email next." |
| Prepared-claim note | "On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread." plus one reason line (declined, App Check, quota, timeout, network, cap). No `.source-label` on these results, on purpose. |
| `[data-action=forget-cloud-consent]` | **Ask me each time**, next to "Your yes to cloud checks is remembered for sample emails until you close this tab." |
| Consent dialog `.consent-overlay` | Now: focus starts on **Do not send**, Tab is trapped, Escape = Do not send (`web/src/ui/dialogKeys.ts`). Give the focused button a visible focus ring. |
| New verdict headline | Warning: "This tracking number matches your shipment, but this email is not from the carrier's official domain." (lookalike sender asking to pay, log in or download). Check it wraps well at 390 px. |
| `/extension-demo/` | Hosted extension test page ("Extension test fixture."), five sample emails, Gmail-like `h2.hP` subject. Needs a light style pass; must keep `h2.hP` and the sample text. |
| Homepage Real UPS chip | Now stores the matching shipment first and shows "This chip stored the matching UPS shipment on this device first, as demo data. Reset demo data in the sample inbox removes it." |

## UI items 1 to 10 (16 Nov)

1. **DONE** (`184f42f`, checked live by Grok 16 Nov). Demo bar on every `/app/` screen saying it is sample data (playbook asks for it).
2. **DONE** (`194ea5a`, `b505395`, `2fd34c2`, checked live by Grok 16 Nov). 390 px thread list: shorter, so the open email and **Check this email** are visible sooner on a phone.
3. **DONE** (`2dfa02d`, checked live by Grok 16 Nov). Style the loader card, the reason line, the remembered-consent note and **Ask me each time**.
4. **DONE** (`6ed76af`, checked live by Grok 16 Nov). Link from `/extension/` to `/extension-demo/` (one line in the install steps).
5. **DONE** (`c006713`, checked live by Grok 16 Nov). Real UPS chip copy review.
6. **DONE** (`8455539`; Grok re-run on production: /features/ Accessibility 100). Lighthouse `/features/` accessibility 91 (16 Nov):
   - `a.belt-btn` and `span.belt-pill-num`: white on `#e24a2b` is 4.0:1, needs 4.5:1.
   - `div.belt` has `aria-label` with no role. Add a role (for example `role="region"`) or drop the label.
7. **DONE** (`a6c7d5f`; Grok re-run on production: home Performance 98 to 99, Total Blocking Time 0 to 20 ms). Home Performance 80 on a re-run at `9c6e0cc` (87 earlier the same day), mobile Lighthouse: LCP 2.2 s, CLS 0, Total Blocking Time 780 ms. `main-*.js` takes about 3.7 s of throttled CPU at boot (globe and hero). Lazy-start the globe after first paint or on idle.
8. **DONE** (`f87d165`, checked live by Grok 16 Nov). Consent mock on `/privacy/` (line ~108) and `/features/` (line ~96) still says **Send this email to the cloud?** and **Send this email**. The real dialog says **Check this email in the cloud?**, **Check in the cloud**, **Do not send**, plus the free-tier review sentence. Match the mock to the real dialog (Grok fixed only the policy fine print in PR #6).
9. Phone checks only Oh-Jay can run. **DONE 17 Nov (Africa/Lagos) on a Galaxy S25, production `598cf21`:** Telegram in-app PASS and X in-app PASS (first DHL after the matching shipment demo: **Warning**, **This tracking number is not one of your shipments.**, **Checked in the cloud**, **SAMPLE DATA** tag, **Ask me each time**). WhatsApp on Android is N/A: it has no in-app browser and opens Chrome. **iPad Safari (iPadOS, desktop layout) PASS 17 Nov** for the cloud path (Oh-Jay scrolled the verdict into view by hand; item 14 had not landed yet). **Still open (optional):** iPhone Safari itself was not run, including safe areas. Grok's headless pass at 390 px in dark mode and with 200% root font size found no sideways scroll on 11 routes, but did not judge looks.
10. **DONE 16 Nov, retaken 17 Nov:** README screenshots retaken at 390 px from production `598cf21` after UI-NEXT 11 and 12; nano-film site run 44012648772 (after UI-NEXT 14) and earlier site run 44009266512 plus extension run 44009272463 passed with the selectors unchanged. After any UI change: retake the README screenshots in `docs/images/` at 390 px (Grok can do the capture), and re-run nano-film to confirm selectors.

## New UI items for Claude (found by Grok, 16 Nov 2026, 23:00 to 23:40 Africa/Lagos, production `f87d165`)

Grok did not change any of these. Measured headless at 390 x 844 (Chrome, mobile emulation).

11. **DONE** (`720cdbd`, checked live by Grok 17 Nov on production `598cf21`). Verdict now scrolls into view after **Check this email** / **Do not send** and after **Run a limited check**. At 390 x 844 the headline sits at y=153 (was about 830). Instant scroll under `prefers-reduced-motion` (already at y=153 after 80 ms). `.result`, `.headline` and `.outcome` unchanged.
12. **DONE** (`598cf21`, checked live by Grok 17 Nov). On phones (max-width 700 px) the Sample data bar is no longer sticky, and a **SAMPLE DATA** tag is painted on the verdict card with a CSS `::before`, so `textContent` and `innerText` of `.result`, `.outcome` and `.headline` do not include it. Desktop keeps the sticky one-line bar and has no tag on the card. After this change the phone headline lands at y=153 with `scroll-margin-top: 84px`.
13. **DONE 17 Nov.** The styled **Ask me each time** row was seen on a Galaxy S25 after real cloud checks: Chrome Android (production `db64fcc`), then Telegram in-app and X in-app (production `598cf21`).

14. **DONE** (`352c69e`, checked live by Grok 17 Nov on production `3ad9c8c`, which serves that code). After **Do not send** (the consent path Claude could not test) at 1280 x 800, 1366 x 768 and 390 x 844, the headline and the whole verdict card were on screen for the fake DHL, the real UPS thread (after the shipment demo), Streamhut, and a limited check. At 1280 x 800: DHL y=160 (card 124-557 of 800, was 754), UPS y=310, Streamhut y=286, limited y=194; the same under `prefers-reduced-motion`. At 1366 x 768: DHL y=160, UPS y=278, Streamhut y=254, limited y=162. At 390 x 844: DHL y=153, UPS y=237, Streamhut y=257, limited y=458. At 1920 x 1080 the DHL card already fits so it does not scroll (headline y=414). No sideways scroll at 390, 1280 or 1366 on 11 routes. Do-not-break selectors and the prepared-claim text are intact.

## New UI items for Claude (from the three-judges review, 23 Nov 2026, Africa/Lagos)

Grok changed logic and copy only, with no CSS or layout changes. These need a visual pass.

15. **Home page consent dialog.** With **Allow cloud** on, the home page now opens the same dialog as `/app/` (same markup and classes, `.consent-overlay` and `.consent-card`, inside a `[data-consent-host]` wrapper appended to `<body>`). Check how it looks over the hero at 390 and 1376 px, and the focus ring on **Do not send**.
16. **Home page reason line.** The hero result can now show a second `p.hero-note[data-fallback-detail]` line: the cloud failure reason, or "The email was not sent to the cloud." Check spacing next to the prepared-sample note.
17. **"Not sent" state on `/app/`.** After **Do not send** on a pasted email the card reads **Not sent** / **Not checked with AI** with the limited-check button. It still uses `.result.result-error` (red). Give it a calm, neutral style (`[data-not-sent]` is on the card).
18. **Disabled Check buttons.** `[data-action=check]` and `[data-action=check-paste]` now carry `disabled` while a check or the dialog is open. Check the disabled look.
19. **"Why" tag** (cold judge fix 9). `styles-v7.css` line ~2500 paints `content: "Why"` before `.fallback-detail`, so "The email was not sent to the cloud." reads as a reason. Change the tag to "Cloud" (or drop it for that line).
20. **UPS chip label** (cold judge fix 6, copy only, 23 Nov). The home chip now reads **Genuine-looking UPS update** on wide screens and only **UPS** on phones (the words "Genuine-looking" and "update" sit in `.chip-more`, which phones hide). The full name was tried first and pushed the Streamhut chip off a 390 px screen, so phones keep the short word. Check whether you want a different phone label.
21. **Home hero caption** now ends with "Fictional samples; not affiliated with DHL or UPS." and runs to 3 lines at 1376 px (was 2), which lifts the hero about 20 px. It is hidden on phones as before. The `/app/` Sample data bar carries the same sentence and wraps to 5 lines at 390 px.
22. **Extension page step 03** now names the `did-i-order-this-extension` folder with two `<code>` spans; check the line breaks at 390 px.

## New UI items for Claude (from the cold judge rerun, 23 Nov 2026, Africa/Lagos)

Grok changed logic and copy only, with no CSS or layout changes.

23. **Phone hero hides reasons after the second.** `web/src/styles.css` line 1547, `.hero-verdict .reasons li:nth-child(n+3) { display: none; }` inside `@media (max-width: 900px)`, so at 390 px only the first two reasons show. Grok now orders reasons so the lure note, the risky-ask note and the leaked-number note come first (in the limited check and in the verdict), which keeps the warning reasons visible on phones. Decide whether phones should show all reasons or a "show more" control instead of a hard cut.

24. **Next-step reason line** (23 Nov, logic only, no CSS). After a real AI verdict on the hosted site (`/app/` and the home hero), a further `<li>` may be appended to the existing `.reasons` list: **Next step, chosen in the cloud:** or **Next step, chosen on this device:** plus one sentence. It arrives after the verdict is already on screen, so the card can grow by one line and may need a second look at scroll-into-view at 390 and 1280 px. On the home hero, up to 4 existing reasons plus this line can show (5 items); item 23 still hides reasons after the second on a phone, and the tip is appended last so it does not hide the warning reasons. It is not used in the extension. Do not restyle in a way that breaks `.reasons`, `.result`, `.headline` or `.source-label`.

## New UI items for Claude (from cold judge round 3 and security audit round 2, 23 Nov 2026, Africa/Lagos)

Grok changed logic and copy only, with no CSS or layout changes.

25. **`/extension-demo/` has no `<h1>`** (cold judge round 3). Every other route has one. Add a visible or visually hidden `<h1>` (for example "Extension test fixture") without moving the fixture's Gmail-like markup: the extension reads `h2.hP`, `span.gD[email]` and `div.a3s`, and the nano-film extension run depends on them.
26. **Next-step line wording changed** (logic only). Item 24's line now starts **Next step, chosen in the cloud:** or **Next step, chosen on this device:** and is one of a fixed set of sentences (the longest is about 130 characters plus the official site, for example "the official DHL app or dhl.com"). Check that it still wraps cleanly at 390 px. It now appears after an on-device read only when Chrome has an on-device model, and in the cloud only after a cloud yes or in the home page's cloud mode.
27. **New Neutral headlines for pasted mail** (logic only). A pasted email that matches a stored parcel or order now shows **Neutral** with a long headline: "This number matches your parcel, but a pasted email can't prove who sent it. Open your parcel in the carrier's app." (about 115 characters; the order version is similar). Check the home hero and `/app/` verdict cards at 390 and 1280 px. Mixed-sender Gmail threads in the extension get a similar headline that mentions "more than one sender".
28. **Rename the "Next step" card label** (cold judge round 4, F16). `.demo-next::before` in `web/src/styles-v7.css` (about line 2521) sets `content: "Next step"`, which clashes with the reason line **Next step, chosen in the cloud:**. Suggested: `content: "Next, see a match"` (the card text already starts with those words, so the label could also be dropped). Not changed in round 4 because it is CSS.
29. **Optional "Illustration" captions on the stamped mockups** (claims audit round 2, item 7). Static mockups with a fixed verdict carry the **Checked on this device** stamp on `/`, `/how-it-works/`, `/features/`, `/privacy/`, `/extension/` and `/faq/`. Round 4 changed the `/features/` intro to "Each tile recreates a screen from the sample inbox or the side panel." A small visible "Illustration" caption on each stamped mockup would make the rest unambiguous; it needs styling, so it is listed here.
30. **New long verdict headlines** (logic only, round 4). New **Neutral** headlines can reach about 160 characters, for example "This order number matches your order, but this email comes from a subdomain of the store that other sellers can send through. Open the order on the store's own site." Others: the store-not-authenticated, Gmail-flagged, test-page, too-long, AI-label and image-host caps, and the risky no-history line "You have no history with this sender, and it asks you to pay or call. Check on the company's own site." (now the Streamhut sample's headline). Check the verdict card and the side panel at 390 px.
31. **Side panel: show which email was checked** (security audit round 3, L3). The panel now follows the active tab, but a line with the checked email's subject and sender above the verdict would make it plain which thread a result is about.

## Do not break (film and e2e)

`[data-action=check]`, `[data-thread="thread-1-carrier-lure"]`, `[data-action=consent-yes]`, `.source-label`, `.outcome`, `.headline`, `.result h2`, the text "prepared for this sample thread", extension fixture `h2.hP` plus `GM123456789012345`. Also used: `[data-action=consent-no]`, `[data-action=limited]`, `[data-action=save]`, `[data-action=reset]`, `[data-action=check-paste]`, `[data-action=load-shipment-demo]`, `[data-action=forget-cloud-consent]`, `.app-ledger`, `[data-paste]`, `[data-try]`, `form[data-prompt]`.

## CSP

If you add any third-party script, font or image host, add the exact host to `vercel.json` or it is blocked, then re-test a live cloud check in a real browser.
