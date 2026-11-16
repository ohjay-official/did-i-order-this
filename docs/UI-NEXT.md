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
9. Phone checks only Oh-Jay can run, worth a look while styling: X, WhatsApp and Telegram in-app browsers on `/app/`; iPhone Safari safe areas. Grok's headless pass at 390 px in dark mode and with 200% root font size found no sideways scroll on 11 routes, but did not judge looks.
10. **DONE 16 Nov:** README screenshots retaken at 390 px from production `f87d165`; nano-film site run 43968899989 and extension run 43967844787 passed with the selectors unchanged. After any UI change: retake the README screenshots in `docs/images/` at 390 px (Grok can do the capture), and re-run nano-film to confirm selectors.

## New UI items for Claude (found by Grok, 16 Nov 2026, 23:00 to 23:40 Africa/Lagos, production `f87d165`)

Grok did not change any of these. Measured headless at 390 x 844 (Chrome, mobile emulation).

11. **Verdict lands below the fold on a phone.** After **Check this email** (and after **Do not send**), the page does not move: the result headline starts at about y = 830 of an 844 px screen, so only the edge of the verdict card shows. Suggest scrolling the result into view after a check, landing below the sticky header and Sample data bar, with no smooth scroll under `prefers-reduced-motion`. Keep `.result`, `.headline` and `.outcome` as they are.
12. **Sticky header plus Sample data bar cover about 135 px (16%) of the screen while you read a verdict.** Grok's screenshots had to scroll an extra 80 px so the headline was not hidden under the bar. Consider a one-line bar once stuck, or letting it scroll away after the first screen while keeping the playbook's "sample data" label visible somewhere on every screen.
13. **Still unverified:** the styled "Ask me each time" row (needs a real cloud check; Oh-Jay's S25 test will show it).

## Do not break (film and e2e)

`[data-action=check]`, `[data-thread="thread-1-carrier-lure"]`, `[data-action=consent-yes]`, `.source-label`, `.outcome`, `.headline`, `.result h2`, the text "prepared for this sample thread", extension fixture `h2.hP` plus `GM123456789012345`. Also used: `[data-action=consent-no]`, `[data-action=limited]`, `[data-action=save]`, `[data-action=reset]`, `[data-action=check-paste]`, `[data-action=load-shipment-demo]`, `[data-action=forget-cloud-consent]`, `.app-ledger`, `[data-paste]`, `[data-try]`, `form[data-prompt]`.

## CSP

If you add any third-party script, font or image host, add the exact host to `vercel.json` or it is blocked, then re-test a live cloud check in a real browser.
