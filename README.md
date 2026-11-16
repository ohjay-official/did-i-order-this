# Did I Order This?

**For judges:** open the [sample inbox](https://did-i-order-this.vercel.app/app/), click the first thread (**DHL Express Desk**, **Your parcel is held. Pay the release fee.**), click **Check this email**, and read the verdict: **You're not expecting any parcel right now.** Then click **Load the matching shipment demo** and check the UPS email: **This tracking number matches a shipment you are expecting.** No login.

<p align="center">
  <img src="docs/images/sample-verdict-prepared.png" width="260" alt="The live sample inbox at 390-pixel width after Do not send: Warning, You're not expecting any parcel right now, with the note that on-device AI did not run and the structured claim prepared for this sample thread was used, plus the reasons and the claim that was checked.">
</p>

**Check a delivery or billing email against the orders and tracking numbers on your own device, before you click.**

A parcel or billing email can ask you to pay a fee or open a link, and a fake DHL or UPS message can look like a real one. This app uses Firebase AI Logic to read what the email claims, then plain code checks that claim against the orders and tracking numbers stored on your device.

## Quick links

- [Try the sample inbox](#try-it) on the live site. No account, nothing to install.
- Watch the film: `TBD-post-build: film URL (YouTube, at most 3 minutes, not filmed yet)`
- [Live site](https://did-i-order-this.vercel.app), the [judge extension zip](https://did-i-order-this.vercel.app/downloads/did-i-order-this-extension-0.1.0.zip) and its [test page](https://did-i-order-this.vercel.app/extension-demo/)
- [One-command check](#more-ways-to-test): `npm run verify` (Node 22.22 or later)
- [Step-by-step testing guide](docs/TESTING.md) with every on-screen string
- [Tracks and judging criteria](#tracks)
- [How it was built](#built-during-buildhybridai-2026)

## Try It

This is the live app at [did-i-order-this.vercel.app/app](https://did-i-order-this.vercel.app/app/). No account and nothing to install. It starts with demo data: **1 order and 0 expected parcels are stored on this device.** If the count is different, click **Reset demo data**.

1. Click the first thread, **DHL Express Desk**, **Your parcel is held. Pay the release fee.**, then **Check this email**.
2. In Chrome with on-device AI (Gemini Nano) there is no dialog. Everywhere else (for example phones, Firefox, Safari, or desktop Chrome without Nano) a dialog asks **Check this email in the cloud?** and says the cloud uses Google's free Gemini tier, so Google may keep this text and people at Google may review it. Click **Check in the cloud** or **Do not send**.
3. You see **Warning** and **You're not expecting any parcel right now.** The line under it says how the email was read:
   - **Checked on this device** or **Checked in the cloud** when the AI read it.
   - **On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread.** when you clicked **Do not send**, or the cloud check could not run (a second line then says why, for example App Check or a timeout). This is a prepared claim, not an AI read, so it has no source label.
4. Click **Load the matching shipment demo**. The header now says **1 order and 1 expected parcel are stored on this device.** and the UPS thread opens.
5. Click **Check this email**: **Safe** and **This tracking number matches a shipment you are expecting.** After a cloud yes, sample threads in the same tab do not ask again.

**To see the on-device path yourself** (desktop Chrome on hardware that meets Chrome's requirements for built-in AI): the hackathon FAQ says to open `chrome://flags`, search for **Gemma 4 for Built-in AI**, enable it, and relaunch. The runner proofs below instead turn on `chrome://flags/#optimization-guide-on-device-model` and `chrome://flags/#prompt-api-for-gemini-nano`. `chrome://on-device-internals` shows whether the model is ready; it downloads the first time it is used. This was not tried on the build machine, which cannot run Nano.

You just saw the same kind of carrier email fail or pass only because of what is stored on this device, not because of scary wording.

**With another minute:** the last thread, **Duty payment required for your shipment**, gives **This tracking number is not one of your shipments.** **Streamhut Billing** gives **Neutral** and **You have no history with this sender.** **Reset demo data** puts everything back. Every path, including paste, import, the homepage chips, and the extension test page, is in [docs/TESTING.md](docs/TESTING.md).

To check the code itself: `npm ci`, then `npm run verify`. It prints `PASS` or `FAIL` per check and exits non-zero on any failure.

## Proof It's Real

- **On-device run on the current build, public GitHub runner:** [nano-film run 43950308139](https://github.com/ohjay-official/nano-film/actions/runs/43950308139) (16 Nov 2026, 21:31 Africa/Lagos, production at `9c6e0cc`) loaded the live `/app/` page in Chrome 157.0.8103.50 with Gemini Nano and got **Checked on this device** (`inferenceSource` `on_device`), **Warning**, **You're not expecting any parcel right now.**, and no cloud consent. Earlier runs: [43947306478](https://github.com/ohjay-official/nano-film/actions/runs/43947306478) (16 Nov, `9098021`), [43682923396](https://github.com/ohjay-official/nano-film/actions/runs/43682923396) (15 Nov) and [43219012008](https://github.com/ohjay-official/nano-film/actions/runs/43219012008) (12 Nov). Private 2 vCPU runners cannot run Nano, so the proof runs from the public `ohjay-official/nano-film` repo; this repo keeps a copy of the workflow at `.github/workflows/on-device-demo.yml`.
- **Extension on-device run, public GitHub runner:** [nano-film run 43952581780](https://github.com/ohjay-official/nano-film/actions/runs/43952581780) (16 Nov 2026, 21:44 Africa/Lagos, production at `9c6e0cc`) downloaded the live judge zip, loaded it unpacked into Chrome 157.0.8103.50 with Gemini Nano, opened the side panel on a local Gmail-thread fixture, and got **Checked on this device** (`on_device`), the same headline, and no cloud consent. The runner adds `http://127.0.0.1:8123/*` to the installed manifest's content script matches because it cannot sign into Gmail; the JavaScript in the zip is unchanged. One run in between ([43950314547](https://github.com/ohjay-official/nano-film/actions/runs/43950314547)) failed before the extension loaded, because Chrome on that runner could not start a Nano session; the rerun passed. Earlier passes: [43947314820](https://github.com/ohjay-official/nano-film/actions/runs/43947314820) (16 Nov) and [43685102643](https://github.com/ohjay-official/nano-film/actions/runs/43685102643) (15 Nov).
- **What Nano actually returned** in run 43947306478: the display name **DHL Express Desk** as the domain and the fee **$2.99** as the only cited number, missing the tracking number. The verdict was still right because the claim said carrier and no parcel was expected. Since then, `reconcileClaim()` in `packages/core/src/reconcile.ts` fills both gaps from the email text in code (sender domain from the From line, tracking-shaped numbers from the body), so the UPS match no longer depends on the model spotting the number. In run 43950308139, on the build with `reconcileClaim()`, the checked claim showed the domain `dhl-parcel-desk.example` and the tracking number GM123456789012345.
- **Cloud check on the current build:** not recorded yet. The build machine's automated Chrome is rejected by App Check (reCAPTCHA Enterprise), and the page then shows the prepared-claim note with **The cloud check could not run. This page could not prove it is the real site (App Check). Reload the page and try again.** A real-phone cloud test is pending.
- **Tests:** 153 unit tests (core 66, web 74, extension 13), re-run 16 Nov 2026 (Africa/Lagos). `npm test` runs them. Core coverage the same day: 96.95% statements (446/460) and 89.61% branches (345/385), gated at 95% statements and 85% branches in `packages/core/vitest.config.ts`.
- **CI:** `.github/workflows/ci.yml` runs `npm run verify -- --offline` on every push to `main` and on pull requests.
- **Lighthouse** (mobile, production `9c6e0cc`, 16 Nov 2026, run from the build machine): Best Practices and SEO 100 on all 9 routes; Accessibility 100 on 8 routes and 91 on `/features/` (a colour-contrast and an ARIA-label issue, handed to the UI owner); Performance 80 on the home page (87 in an earlier run the same day; the home page script blocks the main thread for about 0.8 seconds), 99 or 100 on the other 8.
- **No real users yet.** Three testers are scheduled for 26 to 28 Nov 2026.

## What's New Here

**The AI does not judge the email.** Firebase AI Logic reads what the email claims (who it says it is from, what it wants you to do, which number it cites). Plain code then checks that claim against the orders and tracking numbers stored on your device.

This is for people who get a delivery or billing email that asks them to pay or click, and who want to check that claim without sending their inbox to a server. No usage numbers yet.

- **A fake parcel-fee email fails because you are not expecting a parcel.** The headline is exactly **You're not expecting any parcel right now.** when the email claims to be a carrier and no expected shipment is stored.
- **On-device first, cloud only after consent.** The hosted site tries `InferenceMode.ONLY_ON_DEVICE`, then asks before any `ONLY_IN_CLOUD` call. The extension never calls the cloud.
- **The source is labelled, not guessed.** Every result shows **Checked on this device**, **Checked in the cloud**, **Limited check (no AI)**, or **Check not completed**. The first two come from `result.response.inferenceSource`.

## Tracks

Platform and prize category names are taken from the [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) rules. The official rules do not use Q-style requirement ids.

| Track or criterion | What qualifies | Where to check |
| --- | --- | --- |
| Platform: Web (Chrome) | Hosted web app plus a Chrome MV3 side-panel extension | [Live site](https://did-i-order-this.vercel.app), `extension/` |
| Prize category: Best Web/Chrome | Same as the platform above | Live site, judge zip, this README |
| Technological Implementation | Firebase AI Logic hybrid inference, structured output, App Check | [How Firebase AI Logic Is Used](#how-firebase-ai-logic-is-used), `web/src/ai/readClaim.ts` |
| Design | A complete sample-inbox product, not only a probe | [Try It](#try-it), live `/app/` |
| Potential Impact | Check a delivery or billing claim against *your* on-device orders before you click | [What's New Here](#whats-new-here), [What It Does](#what-it-does) |
| Quality of the Idea | The model reads the claim; code issues the verdict | [What's New Here](#whats-new-here), `packages/core/src/verdict.ts` |

## What Works Today

| Feature | Status |
| --- | --- |
| Sample inbox with 5 threads and the full verdict flow | Works on the live site |
| Prepared-claim fallback on sample threads when on-device AI and the cloud are not used or fail | Works on the live site (walked on 16 Nov 2026 in desktop Chrome at 1280 and 390 pixels) |
| **Load the matching shipment demo** after the first check | Works on the live site |
| On-device check through Firebase AI Logic (Gemini Nano in Chrome) | Works where Chrome's on-device model is available; proven on a public runner (links above) |
| Cloud check after consent | Built and called on the live site. A cloud verdict on the current build is not recorded yet (see Proof) |
| Remember a cloud yes for sample threads until the tab closes | Works; **Ask me each time** clears it. Pasted emails are always asked about |
| Limited check with no AI | Works |
| Paste your own email and check it | Works |
| Import order history (Amazon ZIP or CSV, PayPal CSV, generic CSV), parsed in the browser | Works |
| Save a shipment from a "your order has shipped" email | Works |
| Chrome extension side panel on an open Gmail thread | Works when sideloaded; on-device only, never calls the cloud. Proven on a public runner (link above). The runner uses a local Gmail-thread fixture, not a signed-in mail.google.com session. A hosted test page is at [/extension-demo/](https://did-i-order-this.vercel.app/extension-demo/) |
| Chrome Web Store listing | Not done. Planned |
| Screenshots, `.eml` files, SMS or phone texts | Not supported |
| Outlook, Yahoo or other webmail in the extension | Not supported (Gmail only) |
| Account login emails | Out of scope by design |
| Real user numbers | None yet |

## More Ways to Test

None of these needs a Google or Firebase account. The live sample inbox does not need one either.

<details>
<summary><strong>1. One command (Node 22.22 or later)</strong></summary>

```bash
npm ci
npm run verify
npm run verify -- --offline
```

`npm run verify` checks the Node version, then runs the unit tests, the core coverage gate, typecheck, lint, a guard that product code must not call Chrome's Prompt API directly, the web and extension builds, the extension zip, a secrets scan of tracked files and git history, a bundle scan for App Check debug tokens, a dependency audit, and live-site checks (routes, the zip, and security headers). Each line prints `PASS` or `FAIL`. On 16 Nov 2026 (Africa/Lagos), a fresh clone of `main` at `9c6e0cc` ran `npm ci` plus `npm run verify` in 31 seconds on Node 24.22.1 and printed PASS on all 19 checks (Node 22.22.0 gave the same 19 PASS on `9098021`).


</details>

<details>
<summary><strong>2. Run it locally (Node 22.22 or later)</strong></summary>

```bash
npm ci
cp .env.example web/.env.local
npm run dev --workspace=web
```

Environment variables, as names only (fill in `web/.env.local`, never commit values):

```
VITE_FIREBASE_API_KEY=<your Firebase web API key>
VITE_FIREBASE_AUTH_DOMAIN=<your-project.firebaseapp.com>
VITE_FIREBASE_PROJECT_ID=<your-project-id>
VITE_FIREBASE_STORAGE_BUCKET=<your-project.appspot.com>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-sender-id>
VITE_FIREBASE_APP_ID=<your-app-id>
VITE_FIREBASE_RECAPTCHA_SITE_KEY=<your reCAPTCHA Enterprise site key>
VITE_FIREBASE_RECAPTCHA_PROVIDER=enterprise
```

Do not put an App Check debug token in this file, in the repo, or in a shipped bundle.

Without the Firebase web config, the sample inbox still works: each sample thread falls back to the claim prepared for that thread, and the page says **On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread.** Pasted emails fall back to the limited check. Without `VITE_FIREBASE_RECAPTCHA_SITE_KEY`, cloud AI is not offered.

</details>

<details>
<summary><strong>3. Sideload the Chrome extension (desktop Chrome 138 or later)</strong></summary>

1. Download [did-i-order-this-extension-0.1.0.zip](https://did-i-order-this.vercel.app/downloads/did-i-order-this-extension-0.1.0.zip) and unzip it. Or build it yourself: `npm run package:extension` writes the zip to `extension/release/`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the inner `did-i-order-this-extension` folder.
3. Open the [extension test page](https://did-i-order-this.vercel.app/extension-demo/) (labelled **Extension test fixture.**, not Gmail) or a Gmail thread at `mail.google.com`, open the side panel from the toolbar, then click **Check this email**.

Without Nano the panel shows **Error** and says this extension does not send mail to the cloud, then offers **Run a limited check (no AI)**. A signed-in Gmail thread was not tested on the build machine; the runner proof above used a local Gmail-thread fixture.

Permissions: `storage` and `sidePanel` only, plus a content script on `https://mail.google.com/*`. The side panel runs `only_on_device`. If on-device AI is not available it offers **Run a limited check (no AI)** and points to the hosted site.

</details>

## Screenshots

<p align="center">
  <img src="docs/images/home.png" width="160" alt="The live home page at 390-pixel width, with the headline Got a parcel email? See if it's yours, and a Check field.">
  <img src="docs/images/sample-inbox.png" width="160" alt="The sample inbox list on the live site at 390-pixel width, showing five demo threads and the line 1 order and 0 expected parcels are stored on this device.">
  <img src="docs/images/cloud-consent.png" width="160" alt="The cloud consent dialog on the live sample inbox at 390-pixel width, titled Check this email in the cloud, with Check in the cloud and Do not send buttons.">
  <img src="docs/images/ups-match-prepared.png" width="160" alt="The UPS sample email after Load the matching shipment demo, at 390-pixel width: Safe, This tracking number matches a shipment you are expecting, using the structured claim prepared for this sample thread.">
</p>

<p align="center"><em>Captures of the live site on 16 Nov 2026 (Africa/Lagos), at 390-pixel width, with sample data. The two verdicts use the prepared sample claim (Do not send), not an AI read.</em></p>

A live AI verdict could not be captured from the machine that wrote this README: its Chrome has no Gemini Nano, and App Check rejects the automated browser. The on-device verdict is in the runner proof linked above.

## What It Does

1. **Read the claim.** `readClaim()` in `web/src/ai/readClaim.ts` sends the email text to Firebase AI Logic and asks for four fields only: `claimed_party` (name, role, domain), `asked_action`, `cited_numbers`, and `email_kind`.
2. **Pick where it runs.** The first try is `only_on_device`. If that fails on the hosted site, the app asks for consent before any cloud call. If you click **Do not send**, the email is not sent. A sample thread then uses the claim prepared for it and says so; a pasted email offers a limited check with no AI.
3. **Fill gaps in code.** `reconcileClaim()` uses the From line's domain as the claimed domain and adds tracking-shaped numbers the model missed. It never removes what the model cited.
4. **Decide in code.** `decideVerdict()` in `packages/core/src/verdict.ts` is deterministic. Carrier emails are judged by the cited tracking number against expected parcels on the device. A stored tracking number in an email from a domain that is not the carrier's, asking you to pay, log in, or download, gets **Warning** and **This tracking number matches your shipment, but this email is not from the carrier's official domain.** Store and billing emails are judged by order numbers and sender history.
5. **Label the source.** The label comes from the SDK. If the SDK does not report a source, the read is treated as failed instead of guessed.

It cannot promise that an email is safe or is a scam. It can only say whether the claim matches the orders and tracking numbers stored on that device.

## How Firebase AI Logic Is Used

All of this is in code, imported from `firebase/ai` and `firebase/app-check`, and called at runtime. It is not only named here.

- **Calls:** `getAI` with `new GoogleAIBackend()`, `getGenerativeModel`, `initializeDeviceModel`, and `generateContent` in `web/src/ai/readClaim.ts`. The hosted site and the extension both call this same `readClaim()`.
- **Hybrid modes:** the app tries `InferenceMode.ONLY_ON_DEVICE` first. After consent, the hosted site calls `InferenceMode.ONLY_IN_CLOUD`. The visible label comes from `result.response.inferenceSource` (`InferenceSource.ON_DEVICE` or `InferenceSource.IN_CLOUD`).
- **In code, but not chosen by the app:** `InferenceMode.PREFER_ON_DEVICE` is mapped in `readClaim.ts` and covered by tests (it spends the client cloud budget, because it may reach the cloud). The hosted site and the extension never select it.
- **Models:** cloud model `gemini-3.5-flash-lite`. On device, Chrome's Gemini Nano is requested as text-only (`expectedInputs` and `expectedOutputs` of type `text`, English).
- **Structured output:** `Schema.object` from `firebase/ai` (`web/src/ai/schema.ts`) is sent as `responseConstraint` on device and as `responseSchema` with `responseMimeType: "application/json"` in the cloud. One retry if the reply does not parse.
- **App Check:** `initializeAppCheck` with `ReCaptchaEnterpriseProvider` and `isTokenAutoRefreshEnabled: true` in `web/src/firebase/app.ts`. The AI Logic API rejects calls without a valid token (HTTP 401).
- **Not used:** this app does not import Firestore, Remote Config, or Authentication.

## Privacy

- Email stays on the device by default. Cloud is used only on the hosted site, only after the consent dialog, and only for the one email being checked. The dialog says: "The cloud uses Google's free Gemini tier, so Google may keep this text and people at Google may review it."
- Orders and tracking numbers are stored in IndexedDB (site) or `chrome.storage.local` (extension). There is no project server or database.
- Vercel Web Analytics and Speed Insights run on the production host only, cookie-free, with query strings stripped. See the [privacy policy](https://did-i-order-this.vercel.app/privacy/#policy).

## Security

- **App Check** (reCAPTCHA Enterprise) is enforced on the Firebase AI Logic API.
- **Spend and abuse limits:** the browser API key is restricted to `https://did-i-order-this.vercel.app/*`; the Firebase AI Logic quota is 10 requests per minute per user; billing is not linked, so nothing can bill; a client throttle allows 10 cloud reads a minute and 30 per tab session (`web/src/ai/cloudBudget.ts`), and a cloud read that does not answer in 20 seconds is stopped. The client throttle is a courtesy limit. It cannot stop a determined caller.
- **Headers:** a Content Security Policy that allows scripts only from this site and reCAPTCHA, plus HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, and a locked-down permissions policy (`vercel.json`). These headers were present on the live site when checked on 16 Nov 2026.
- **Input cap:** `readClaim()` sends at most the first 20,000 characters of an email to the model, on the site and in the extension.
- **Consent dialog keyboard:** focus starts on **Do not send**, Tab stays inside the dialog, and Escape means **Do not send**.
- **Extension:** the background worker accepts email text only from this extension's own content script on Gmail, caps it at 20,000 characters, and answers requests from inside the extension only. No Gmail API, no mailbox scan.
- **No secrets in the repo.** `.env.example` has empty values only. `npm run verify` scans tracked files and the full git history for API keys, tokens, private keys, and App Check debug tokens, and checks the built bundles for a debug token.
- **Dependencies:** `npm audit` reports 4 high advisories, all from `@grpc/grpc-js` inside the Firestore part of the `firebase` package. This app never imports Firestore, and the verify script checks that no grpc code is in the web bundle. There has been no third-party security audit.

**What it doesn't promise:** a passed check is not a guarantee the email is safe. A cloud check sends that one email to Google's free Gemini tier, which may keep it and may review it. On-device AI needs desktop Chrome with Gemini Nano available (Chrome's own hardware requirements apply). The extension reads Gmail on the web only, and is sideloaded; there is no Chrome Web Store listing yet. SMS, phone texts, screenshots, and `.eml` files are not covered. Account login emails are out of scope.

## Sustainability

There is no product server to run. Orders stay on the device. The site is hosted on Vercel. Cloud AI uses Google's free Gemini tier, and the Firebase project's billing is not linked. If work on the code stops, the live site stays up as long as the Vercel and Firebase projects remain.

## Run Your Own

Follow [Run it locally](#more-ways-to-test) above. The variable names and the fallbacks without each key are listed there.

## Repository

| Path | What it holds |
| --- | --- |
| `packages/core` | Verdict engine, ingest, order-history import, limited check |
| `web` | Vite multi-page site, the sample inbox, and the `/extension-demo/` test page |
| `extension` | Chrome MV3 side panel, content script, background worker |
| `e2e` | On-device filming run used by `nano-film` |
| `scripts` | `npm run verify` and the no-Prompt-API guard |
| `docs/TESTING.md` | Do-this, see-this steps for judges and testers |
| `docs/VICTORY-TEST-2026-11-16.md` | The pre-submit test run: what passed, what was fixed, what is still open |
| `docs/images` | README screenshots of the live site |
| `docs/HANDOFF-ui.md` | Internal UI handoff for remaining design work, not a user guide |
| `.github/workflows` | CI and the on-device demo workflow |

## Built During #BuildHybridAI 2026

**This is a new project. Every commit in this repository was written during the #BuildHybridAI 2026 submission period.**

- **The first commit:** `d6b4d68`, 12 Nov 2026, 12:16:52 Africa/Lagos (UTC+1), which is 11:16:52 UTC. Message: "Scaffold the app and the core scam check." Check with:

```bash
git log --reverse --format='%h %ad %s' --date=iso | head -3
```

- **Official requirements this answers** (names from the [official rules](https://firebasehybridaihackathon.devpost.com/rules) and [What to Submit](https://firebasehybridaihackathon.devpost.com/); there are no Q-style rule ids):
  - **What to Create / Web (Chrome):** a web app and a Chrome extension using Gemini Nano through Firebase AI Logic.
  - **Firebase AI Logic imported and called at runtime:** see [How Firebase AI Logic Is Used](#how-firebase-ai-logic-is-used).
  - **App Check:** required by the rules; reCAPTCHA Enterprise is enforced. Debug tokens are accepted in submissions; this project does not ship one.
  - **New project:** all commits are inside the submission period. Earlier work reused, and disclosed below: the on-device warm-up approach, supplied media, and parts of a CSS checklist.
  - **Value proposition, features, and instructions:** this README, plus a hosted project URL (encouraged by the rules).
  - **Open source license:** Apache-2.0, the rules' preferred license, in the `LICENSE` file. The rules also want that license visible in the GitHub About box once the repo is public.
  - **Demonstration video:** required on the Devpost form, at most 3 minutes, on YouTube. `TBD-post-build: film URL`
  - **No production secrets in the repo, form, or testing instructions:** `.env.example` uses placeholders only; `npm run verify` scans for secrets.

- **AI code:** Grok Bot wrote the product code, the tests, the docs, and the verify pipeline, directed by Oh-Jay. Claude did the planning on 11 and 12 Nov 2026, and Claude Opus 5.5 landed the v7 UI commits on `main` on 15 Nov 2026 (`16fc66e`, `b1f076d`, `8bb5936`, each with a Co-Authored-By line); further UI and UX work is Claude's. Oh-Jay chose the idea, wrote the product and design briefs, made the product decisions, and reviewed every build on his phone.
- **Earlier work reused:** the on-device warm-up approach in `e2e/` follows Oh-Jay's own `nano-probe` test from 12 Nov 2026. Photos, the globe texture, the hands, and the freight clip are media files Oh-Jay supplied. The CSS follows parts of the unslop design checklist by Damir Sokolovsky (CC BY 4.0), credited in `web/src/styles-v6.css`.
- **The live site will stay up through judging and after.**

### Libraries and services, at lockfile versions

Runtime: firebase 13.2.0 (`firebase/ai`, `firebase/app-check`); three 0.160.0 (home-page globe); @vercel/analytics 2.0.1; @vercel/speed-insights 2.1.0; fflate 0.8.3 (order-history ZIPs, and packaging the extension zip).

Development only: vite 7.3.8; typescript 5.9.3; vitest 4.1.12; @vitest/coverage-v8 4.1.12; jsdom 31.0.0 (extension DOM tests); eslint 9.39.5; typescript-eslint 8.72.2; playwright-core 1.65.0 (pinned in `e2e/package-lock.json`, used by the on-device filming run).

Services: Firebase AI Logic with the Gemini Developer API (model `gemini-3.5-flash-lite` in the cloud, Gemini Nano on device); Firebase App Check with reCAPTCHA Enterprise; Vercel (hosting, production deploys from `main`, Web Analytics, Speed Insights); GitHub Actions (CI and the on-device runs).

<details>
<summary><strong>Build log (from git history)</strong></summary>

- **12 Nov 2026 (12 commits):** core verdict engine and tests; order-history import, limited check, Chrome extension, and App Check providers; the on-device workflow and Nano warm-up; first multi-page site, rebuilt toward a live checker.
- **13 and 14 Nov 2026:** no commits.
- **15 Nov 2026 (15 commits, 3 of them Claude's UI):** v6 landing (globe, freight scroll, night footer) and VP9 video fallback; v6.1 real media and footer; v6.2 logo, favicons, per-page meta and OG images, JSON-LD, privacy policy, Vercel Analytics and Speed Insights, client cloud budget, contrast fixes, faster hero; backend pass: extension messaging checks and fewer permissions, judge zip, plain-language AI errors, the free-tier review notice on the consent dialog, CSP and security headers, lint, more tests with a coverage gate, `npm run verify`; README and the extension on-device proof citation; Claude's v7 UI commits.
- **16 Nov 2026:** judge-demo fixes (fail fast without an on-device model, client cloud cap raised to 10 a minute, tab-session memory for a cloud yes, the matching shipment demo loader, the prepared-claim fallback on sample threads, a 20-second cloud timeout, the `/extension-demo/` test page, `docs/TESTING.md`); Node 22.22 as the minimum; this README; the pre-submit test run and its fixes (lookalike-domain warning, claim gap filling, 20,000-character model input cap, consent dialog keyboard).

</details>

## License

[Apache-2.0](LICENSE). Built by Oh-Jay ([@ohjay-official](https://github.com/ohjay-official)).
