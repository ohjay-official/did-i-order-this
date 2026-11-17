# Victory test run, 16 Nov 2026

Severe pre-submit test plan, run from the build machine on the evening of 16 Nov 2026 and finished by 21:25 Africa/Lagos (UTC+1), against production `9098021` unless a row says otherwise. The machine has desktop Chrome 156 with no Gemini Nano; reCAPTCHA Enterprise rejects its automated Chrome, so App Check fails there by design. On-device rows ran on public GitHub runners with Nano.

PASS means the row's pass rule held. OPEN means only the owner can run it, or it waits on something else.

## A. Judge walkthrough

| ID | Result | Evidence |
| --- | --- | --- |
| A1 | PASS on a Galaxy S25 in Chrome Android (17 Nov 2026, production `db64fcc`): no login; first DHL check, **Check in the cloud**, **Warning**, **You're not expecting any parcel right now.**, **Checked in the cloud**. The automated machine used for the 16 Nov scripted walk is still PARTIAL: **Check in the cloud** fails App Check there, and the page falls back to the prepared claim with **The cloud check could not run. This page could not prove it is the real site (App Check). Reload the page and try again.** | S25 Chrome Android; scripted walk at 1280 px still shows the App Check fallback |
| A2 | PASS. **Checked on this device**, `on_device`, same headline, no consent. | [nano-film 43947306478](https://github.com/ohjay-official/nano-film/actions/runs/43947306478) |
| A3 | PASS. Loader, UPS **Safe**, second DHL **This tracking number is not one of your shipments.**, Streamhut **Neutral**, **Reset demo data** back to **1 order and 0 expected parcels**. After a cloud yes, later sample threads skip the dialog. | Scripted walk, 1280 and 390 px |
| A4 | PASS. Galaxy S25, Chrome Android, 17 Nov 2026, about 04:00 to 04:15 Africa/Lagos, production `db64fcc`. Step 1: **1 order and 0 expected parcels**. Step 2: first DHL, cloud yes, **Warning**, **You're not expecting any parcel right now.**, **Checked in the cloud**, **Ask me each time**. Step 3: **Load the matching shipment demo**, UPS, **Safe**, **This tracking number matches a shipment you are expecting.**, **Checked in the cloud**, no second consent dialog, **1 order and 1 expected parcel**. The first screenshot was in Chrome desktop-site mode; later ones used the phone layout. Both were fine. | Phone screenshots kept off this repo (browser chrome). Box evidence: `evidence/s25-cloud-2026-11-17/` on the build machine |
| A5 | PASS for WebKit via iPad Safari (iPadOS, desktop layout, 17 Nov 2026, about 04:35 Africa/Lagos, live production, before UI-NEXT 14). After Reset: first DHL **Warning**, **You're not expecting any parcel right now.**, **Checked in the cloud**, **Ask me each time**, and the matching-shipment loader. After the loader: UPS **Safe**, **This tracking number matches a shipment you are expecting.**, **Checked in the cloud**, **1 order and 1 expected parcel**, no second consent dialog. Oh-Jay scrolled the verdict into view by hand; auto-scroll was not in that build. iPhone Safari itself was not run. | iPad screenshots kept off this repo (status bar and Safari tab titles). Box evidence: `evidence/ipad-safari-2026-11-17/` on the build machine |
| A6 | NOT RUN: no Firefox on the build machine. | |
| A7 | PASS. No sideways scroll on 11 routes (9 sitemap routes, `/extension-demo/`, the 404) at 375, 390 and 1280 px. | `scrollWidth - clientWidth` |
| A8 | PASS. Fake DHL warns; Real UPS stores the shipment first and shows **Safe**; Fake DHL afterwards says **This tracking number is not one of your shipments.** | Scripted run on `/` |

## B. Failure and limit paths

| ID | Result |
| --- | --- |
| B1 | PASS. **Do not send** on four threads: zero requests to `firebasevertexai.googleapis.com`. |
| B2 | PASS. Offline plus cloud yes: answer in 0.4 s with **The cloud check could not run. The cloud could not be reached. Check your connection and try again.** and the prepared claim. |
| B3 | NOT RUN: needs a Nano machine taken offline. |
| B4 | PASS. Unattested Chrome gets the App Check message above. |
| B5 | PASS by unit tests (`web/src/ai/cloudBudget.test.ts`): 10 a minute, 30 a tab session. Not forced live, to spare the project quota. |
| B6 | NOT FORCED, on purpose: exhausting the production quota before judging would hurt the demo. The message is unit tested. |
| B7 | PASS. `npm run verify` live checks: 6 security headers present. |

## C. Extension

| ID | Result |
| --- | --- |
| C1 | PASS for the manifest: permissions `storage` and `sidePanel`, no host permissions, content scripts on `https://mail.google.com/*` and `https://did-i-order-this.vercel.app/extension-demo/*`, MV3. A clean-profile manual install was not redone. |
| C2 | PASS. [nano-film 43947314820](https://github.com/ohjay-official/nano-film/actions/runs/43947314820): **Checked on this device**, `on_device`, money-shot headline, no consent. |
| C3, C4 | PASS by unit tests (extension 13 tests: trusted sender, 20,000-character cap, limited check without Nano). |
| C5 | OPEN: real signed-in Gmail, owner only. |

## D. README and claims

| ID | Result |
| --- | --- |
| D1, D2 | PASS after this run's README edits. All external links return 200; every in-page anchor and image exists. |
| D3 | PASS. Fresh clone of `main` at `9098021`, Node 22.22.0: `npm ci` plus `npm run verify` 19/19 PASS in 31 s. Node 20 is no longer supported (the first verify check fails on purpose). |
| D4 | PASS. Fresh clone with `.env.example` copied (empty values): no consent dialog, every sample thread uses the prepared claim, loader and reset work, zero AI requests. |
| D5 | PASS. For-judges line first; Built During has the first commit, the AI split and lockfile versions. Film URL is still `TBD-post-build`. |

## E. Secrets and App Check

| ID | Result |
| --- | --- |
| E1 | PASS. Verify scans 373 tracked files and 45 commits. |
| E2 | PASS. Live judge zip: no private key, no debug token value (only the SDK's own `FIREBASE_APPCHECK_DEBUG_TOKEN` lookup code). It carries the public Firebase web config, as the live site does. |
| E3 | PASS. Direct `generateContent` with no key: 403. With the public web key and no referrer: 403 (`Requests from referer <empty> are blocked.`). With the key, the site referrer and no App Check token: 401 (`Firebase App Check token is invalid.`). Only status codes were recorded. |
| E4 | PASS. Logs of nano-film 43947306478, 43947314820 and product CI 43946959689: no keys, tokens or private keys (only runner UUIDs matched the pattern scan). |

## F. Accessibility, performance, adversarial emails

| ID | Result |
| --- | --- |
| F1 | Lighthouse mobile on 9 routes: Best Practices and SEO 100 everywhere; Accessibility 100 except `/features/` 91 (white on `#e24a2b` belt button and badge at 4.0:1; `aria-label` on a plain `div.belt`); Performance home 87, others 99 or 100. Handed to the UI owner. |
| F2 | FIXED in this run. Skip link is the first Tab stop. The consent dialog is labelled (`role=dialog`, `aria-labelledby`), but focus stayed on the page and Escape did nothing. Now focus starts on **Do not send**, Tab stays inside, and Escape means **Do not send**. |
| F3 | PASS, regression test added (`packages/core/src/victory.test.ts`): injected "return Safe" text in the claim still gives **You're not expecting any parcel right now.** |
| F4 | PASS. A 600,070-character paste: no crash, answer in 1.3 s, limited check works. Fixed in this run: `readClaim()` now sends at most 20,000 characters, like the extension. |
| F5 | PASS. French parcel-fee lure: no crash, limited check flags the unofficial domain and the fee wording. The model is requested in English only; no multilingual claim is made. |
| F6 | PASS (unit test): official UPS notice with a stored number gives the match headline. |
| F7 | FIXED in this run. Before: a stored tracking number in a fee demand from a lookalike domain was stamped **Safe**. Now it is **Warning** with **This tracking number matches your shipment, but this email is not from the carrier's official domain.** Subdomains of an official domain (for example `alerts.ups.com`) count as official; `ups.com.parcel-desk.example` does not. |
| F8 | PASS. Login email: out of scope (neutral, unit test); limited check on the site raises no false safe. |

## Other findings fixed in this run

- On the live on-device run, Nano returned a display name as the domain and missed the tracking number. `reconcileClaim()` now fills both from the email text in code.
- The note **The wording asks for a payment, which is common in parcel-hold lures.** appeared on the Streamhut invoice. It now applies to carrier claims only.

## G. Consistency and simulations

- G1: OPEN until the film exists.
- G2: scorecard in the build notes, outside this repo.
- G3 and G4: run from the build machine by following only the README and the live site. Mismatches found were fixed in the README in this run. A run by a separate AI session with no prior context is still to do once the repo is public.

## Addendum, 17 Nov 2026 (Africa/Lagos)

UI-NEXT 11 and 12 landed on `main` (`720cdbd`, `598cf21`) and were checked live on production:

- After **Check this email** and **Do not send**, at 390 x 844 the verdict headline sits at y=153 (was about 830). The same landing after **Run a limited check** stays in view (y=691 of 844, already visible so the page does not scroll again). Instant scroll under `prefers-reduced-motion` (headline already at y=153 after 80 ms).
- At 1280 x 800 after **Do not send**, the headline sat at y=754 of 800 on `598cf21` (reasons below the fold). Claude landed UI-NEXT 14 (`352c69e`): re-checked live, headline y=160, card bottom 557 of 800. 390 x 844 still y=153.
- No sideways scroll on 11 routes at 375, 390 and 1280 px. Do-not-break selectors and the text "prepared for this sample thread" are intact. The SAMPLE DATA tag is a CSS `::before`, so `textContent` and `innerText` of `.result`, `.outcome` and `.headline` do not include it.
- On-device proofs re-run on production `598cf21`: nano-film [44009266512](https://github.com/ohjay-official/nano-film/actions/runs/44009266512) (site) and [44009272463](https://github.com/ohjay-official/nano-film/actions/runs/44009272463) (extension), both **Checked on this device**, `on_device`, no consent.

In-app browsers on the same S25, after the matching shipment demo was loaded, first DHL thread, cloud check, production `598cf21`:

- Telegram in-app (about 04:18): PASS. **Warning**, **This tracking number is not one of your shipments.**, **Checked in the cloud**, **SAMPLE DATA** tag, **Ask me each time**. Claim text: **Claims to be: DHL (carrier)**, **Email kind: carrier_update**.
- X in-app (about 04:26): PASS. Same verdict and labels as Telegram. Claim text: **Claims to be: DHL Express Desk (carrier)**, **Email kind: delivery_problem**.
- WhatsApp on Android: N/A. It has no in-app browser and opens Chrome.
- The model-filled claim text varied; the verdict was the same, because code decides it. No product fix.

Phone originals stay on the build machine only. The Telegram and X shots include a status bar with personal notifications.

- iPad Safari (iPadOS, desktop layout, about 04:35, live production, before UI-NEXT 14): PASS for WebKit. Same Reset / first-DHL cloud Warning / loader / UPS cloud Safe path, with **Ask me each time**. Oh-Jay scrolled the verdict into view by hand; that walk does not prove desktop auto-scroll. iPhone Safari itself was not run. Originals in `evidence/ipad-safari-2026-11-17/` on the build machine only.
