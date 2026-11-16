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

## Pending UI items, in priority order

1. Demo bar on every `/app/` screen saying it is sample data (playbook asks for it).
2. 390 px thread list: shorter, so the open email and **Check this email** are visible sooner on a phone.
3. Style the loader card, the reason line, the remembered-consent note and **Ask me each time**.
4. Link from `/extension/` to `/extension-demo/` (one line in the install steps).
5. Real UPS chip copy review.
6. Lighthouse `/features/` accessibility 91 (16 Nov):
   - `a.belt-btn` and `span.belt-pill-num`: white on `#e24a2b` is 4.0:1, needs 4.5:1.
   - `div.belt` has `aria-label` with no role. Add a role (for example `role="region"`) or drop the label.
7. Home Performance 80 on a re-run at `9c6e0cc` (87 earlier the same day), mobile Lighthouse: LCP 2.2 s, CLS 0, Total Blocking Time 780 ms. `main-*.js` takes about 3.7 s of throttled CPU at boot (globe and hero). Lazy-start the globe after first paint or on idle.
8. Consent mock on `/privacy/` (line ~108) and `/features/` (line ~96) still says **Send this email to the cloud?** and **Send this email**. The real dialog says **Check this email in the cloud?**, **Check in the cloud**, **Do not send**, plus the free-tier review sentence. Match the mock to the real dialog (Grok fixed only the policy fine print in PR #6).
9. Phone checks only Oh-Jay can run, worth a look while styling: X, WhatsApp and Telegram in-app browsers on `/app/`; iPhone Safari safe areas. Grok's headless pass at 390 px in dark mode and with 200% root font size found no sideways scroll on 11 routes, but did not judge looks.
10. After any UI change: retake the README screenshots in `docs/images/` at 390 px (Grok can do the capture), and re-run nano-film to confirm selectors.

## Do not break (film and e2e)

`[data-action=check]`, `[data-thread="thread-1-carrier-lure"]`, `[data-action=consent-yes]`, `.source-label`, `.outcome`, `.headline`, `.result h2`, the text "prepared for this sample thread", extension fixture `h2.hP` plus `GM123456789012345`. Also used: `[data-action=consent-no]`, `[data-action=limited]`, `[data-action=save]`, `[data-action=reset]`, `[data-action=check-paste]`, `[data-action=load-shipment-demo]`, `[data-action=forget-cloud-consent]`, `.app-ledger`, `[data-paste]`, `[data-try]`, `form[data-prompt]`.

## CSP

If you add any third-party script, font or image host, add the exact host to `vercel.json` or it is blocked, then re-test a live cloud check in a real browser.
