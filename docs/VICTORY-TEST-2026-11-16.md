# Victory test run, 16 Nov 2026

Severe pre-submit test plan, run from the build machine on the evening of 16 Nov 2026 and finished by 21:25 Africa/Lagos (UTC+1), against production `9098021` unless a row says otherwise. The machine has desktop Chrome 156 with no Gemini Nano; reCAPTCHA Enterprise rejects its automated Chrome, so App Check fails there by design. On-device rows ran on public GitHub runners with Nano.

PASS means the row's pass rule held. OPEN means only the owner can run it, or it waits on something else.

## A. Judge walkthrough

| ID | Result | Evidence |
| --- | --- | --- |
| A1 | PARTIAL. No login; first DHL check shows **Check this email in the cloud?** with the free-tier review sentence. **Check in the cloud** on this machine fails App Check (automation), and the page falls back to the prepared claim: **Warning**, **You're not expecting any parcel right now.**, **The cloud check could not run. This page could not prove it is the real site (App Check). Reload the page and try again.** A real cloud verdict needs a human browser. | Scripted walk at 1280 px, headed Chrome |
| A2 | PASS. **Checked on this device**, `on_device`, same headline, no consent. | [nano-film 43947306478](https://github.com/ohjay-official/nano-film/actions/runs/43947306478) |
| A3 | PASS. Loader, UPS **Safe**, second DHL **This tracking number is not one of your shipments.**, Streamhut **Neutral**, **Reset demo data** back to **1 order and 0 expected parcels**. After a cloud yes, later sample threads skip the dialog. | Scripted walk, 1280 and 390 px |
| A4, A5 | OPEN: Oh-Jay's S25 (Chrome Android) and iPhone Safari. | |
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
