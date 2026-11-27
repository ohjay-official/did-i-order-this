# Devpost draft: Did I Order This? (DRAFT, not submitted)

Refreshed 27 Nov 2026 against the README on `main` at `5985f4d` (production at the start of this refresh; the last code change is `e528bd3` round 7 security fixes). Nothing here has been pasted into Devpost. The only placeholder is the film URL, marked `FILM_URL`.

Deadline: Mon 30 Nov 2026, 2:00 PM PT = **23:00 Africa/Lagos**. Target: submit by **20:00 Africa/Lagos**. After the deadline the entry locks and later commits are not evaluated.

## Fields only Oh-Jay can fill or confirm on the form

1. **Video demo link:** `FILM_URL` (public YouTube, under 2:30, English or English subtitles; the event allows 3:00).
2. **Submitter details:** individual entrant, your country of residence, and the eligibility tick boxes (age of majority, not in an excluded country, not a Google or Devpost employee or family member).
3. **Team members:** only you, unless you add someone.
4. **Image gallery and thumbnail:** upload from the repo's `docs/images/` (all are real captures of the live site with sample data; none show your phone). Suggested thumbnail: `docs/images/sample-verdict-prepared.png`.
5. **Any custom question on the form** that is not listed below: the form is only visible when signed in, so check it and use the closest section here.

---

## Project name

Did I Order This?

## Elevator pitch

(176 characters. Devpost caps this field at 200.)

Check a delivery or billing email against the orders and tracking numbers on your own device, before you click. Firebase AI Logic reads the claim; plain code gives the verdict.

## Platform (required: pick at least one)

Web (Chrome). Prize category: Best Web/Chrome. It is a hosted web app plus a Chrome MV3 side-panel extension.

## Existing app?

No. This is a new project. The first commit reachable from `main` is `72f7212`, 16 Nov 2026, 19:52:56 Africa/Lagos (18:52:56 UTC), "Merge judge demo fixes (#1)". Earlier scaffolding from 12 Nov (`d6b4d68`) sat on a working branch that was squashed into this import; every main-reachable commit sits inside the submission period, which opened 11 Nov 2026, 1:30 PM PT. Earlier work reused, disclosed in the README: the on-device warm-up approach from Oh-Jay's own `nano-probe` test (12 Nov), supplied photos and media, and parts of a CC BY 4.0 CSS checklist.

## Try it out (links)

- Live sample inbox, no login: https://did-i-order-this.vercel.app/app/
- Live site: https://did-i-order-this.vercel.app
- Code repository (Apache-2.0): https://github.com/ohjay-official/did-i-order-this
- Judge extension zip: https://did-i-order-this.vercel.app/downloads/did-i-order-this-extension-0.1.0.zip
- Extension test page: https://did-i-order-this.vercel.app/extension-demo/

## Video demo link

FILM_URL

## About the project

### Inspiration

Fake parcel-fee and billing emails work because they look like real ones. A "your DHL parcel is held, pay 2.99" email is easy to spot only if you remember that you are not expecting a parcel. That fact lives with you, not in the email, so the check should be against your own orders and tracking numbers, on your own device.

### What it does

**User story:** someone who just got a delivery or billing email opens it in this app, or in Gmail with the extension, checks it against the orders and tracking numbers on their device, and leaves knowing whether the claim matches a shipment they are expecting, without the email leaving the device unless they say yes.

- You open an email (the sample inbox on the site, or an open Gmail thread with the extension) and click **Check this email**.
- Firebase AI Logic reads what the email claims: who it says it is from, what it asks you to do, which numbers it cites, and what kind of email it is, as structured JSON.
- Deterministic code then checks that claim against the orders and tracking numbers stored in the browser (IndexedDB on the site, `chrome.storage.local` in the extension). The model never gives the verdict.
- The fake DHL fee email gets **Warning** and **You're not expecting any parcel right now.** After **Load the matching shipment demo**, the genuine-looking UPS email gets **Safe** and **This tracking number matches a shipment you are expecting.** A pasted email never gets Safe, because pasted text can't prove who sent it: a match there stops at **Neutral**. Safe comes only from a sender the app reads itself (a built-in sample, or Gmail's sender in the extension).
- Every email-read result is labelled **Checked on this device** or **Checked in the cloud**. After a verdict, the hosted site may also append **Next step, chosen in the cloud** (or **on this device**): one sentence from a fixed, vetted set that the model only picks by id. Other results say **Limited check (no AI)**, **Check not completed**, or, on sample threads when no AI ran, that the claim prepared for that sample thread was used.
- It also imports order history (Amazon ZIP or CSV, PayPal CSV, generic CSV) in the browser, and saves a shipment from a "your order has shipped" email that cites an order already stored on the device, sent from that store's exact domain, only for stores on a vetted list that publish DMARC `p=reject`.

It cannot promise that an email is safe or is a scam. It can only say whether the claim matches what is stored on that device. Scope of this entry: delivery and billing emails in the hosted app or in Gmail on the web; wording checks are scoped to English (a mostly non-English email stops at Neutral by design); on-device AI is desktop Chrome with Gemini Nano; SMS, phone texts, screenshots, `.eml` files, other webmail, and account login emails are out of scope.

### How we built it (how Firebase AI Logic is used)

**Why only Firebase AI Logic:** this check only makes sense on Firebase AI Logic because one SDK runs the email read on Gemini Nano first, falls back to Gemini in the cloud only after a yes, and labels each result from the SDK's own `inferenceSource`, with App Check on the cloud path.

- `getAI` with `GoogleAIBackend`, `getGenerativeModel`, `initializeDeviceModel` and `generateContent` from `firebase/ai`, in `readClaim()` (`web/src/ai/readClaim.ts`, used by the site and the extension) and in `suggestNextStep()` (`web/src/ai/nextStep.ts`, hosted site only).
- Hybrid inference is split by feature. The email read tries `InferenceMode.ONLY_ON_DEVICE` (Gemini Nano in Chrome) first. Only on the hosted site, and only after a consent dialog that says Google's free Gemini tier may keep and review the text, that fallback uses `InferenceMode.PREFER_ON_DEVICE`. If App Check rejects the browser, the email is not sent. We did not use `PREFER_ON_DEVICE` for the first email read, because it falls back to the cloud without asking, and an email is personal. A separate next-step tip on the hosted site asks the model only to pick a template id (`Schema.enumString`) from vetted sentences for that verdict and action; code writes the text. It uses `InferenceMode.ONLY_IN_CLOUD` (`gemini-3.5-flash-lite`) only after the user agreed to the cloud for that check (a **Check in the cloud** yes; the home page's Allow cloud switch alone is not enough), with its own budget and App Check gate, and sends only the verdict category, the action type (read in code from the email) and a brand name only for a built-in sample whose sender domain is on the official list (never from a pasted From line). Otherwise it uses `InferenceMode.ONLY_ON_DEVICE` with no App Check, or does not run. It never sends the email body, tracking or order numbers, or the sender address. The extension never calls the cloud.
- The visible labels come from the SDK's `inferenceSource`; if the SDK does not report one, the email read counts as failed, not guessed, and a next-step tip is dropped.
- Structured output: a `Schema.object` sent as `responseConstraint` on device and as `responseSchema` in the cloud; the tip's schema allows only template ids.
- After the model answers, code fills gaps (the sender domain always from the email's own From header, never the model's guess, and no domain at all when the header hides a second address in a comment or display name; tracking numbers the model missed), then `decideVerdict()` decides. It also reads fee, payment, amount-due, login and download wording, links, carrier names and tracking numbers from the text itself, after folding lookalike letters, spaced-out letters and hidden characters, so a mislabelled claim cannot turn a fake parcel-fee email Neutral or Safe. A domain with any non-ASCII or hidden character is never official, and a From header with more than one From line, a byte-order mark or group syntax gives no domain.
- Firebase App Check with reCAPTCHA Enterprise, enforced. App Check enforcement is on for the Firebase AI Logic API (a console setting, not publicly checkable); the app gets a token before any cloud read and sends nothing when that fails. The on-device-only read runs only when `LanguageModel` is a function and the SDK built a real on-device adapter, with cloud requests blocked during that read. The on-device email read uses a separate Firebase app without App Check, so that read does not send the email or load reCAPTCHA. A cloud next-step tip loads App Check and reCAPTCHA only after the user agreed to the cloud for that check; an on-device tip uses the app without App Check, so the on-device path loads nothing from Google.
- Stack: TypeScript, Vite 7, firebase 13.2.0, Chrome MV3, Vercel hosting, GitHub Actions.

### Challenges we ran into

- On-device AI is scoped to desktop Chrome with Gemini Nano, and private CI runners cannot load it. On-device proof runs on public GitHub runners in a separate public repo.
- reCAPTCHA Enterprise rejects automated Chrome, so cloud checks cannot be tested by a bot. The page says why (App Check), does not send the email, and on sample threads falls back to the prepared claim. Real cloud verdicts were recorded by hand on a Galaxy S25 in Chrome Android, in the Telegram and X in-app browsers, and in iPad Safari (WebKit, desktop layout). iPhone Safari was run on 27 Nov 2026 at https://didiorder.vercel.app/app/ on production `e16a54e`: Warning then Safe, no cloud (**Do not send**); on-device AI did not run, so both checks used the prepared sample-thread claim ([docs/proof/ios-safari-27nov.mp4](../proof/ios-safari-27nov.mp4)).
- Small on-device models sometimes return a display name as the domain or miss the tracking number. We moved those facts out of the model's hands and read them from the email in code.
- Making the demo work for a judge with no Nano and no cloud call, without ever labelling a canned result as an AI read in the sample inbox.

### Accomplishments that we're proud of

- The model reads; code decides. A model label alone can't grant Safe: Safe needs a verified sender, a stored match, no request, contact detail, payment app or outside link found by code (English wording only; a mostly non-English email stops at Neutral), and the AI read labelling no request. Safe needs a sender the app verified itself (a built-in sample, or Gmail's sender in the extension); a pasted match stops at **Neutral**. Then Safe has two paths only: a tracking number you are expecting, from the official domain of that same carrier (each listed domain publishes DMARC `p=reject`), with no request to pay, call, log in or download and no link, form or image off the official list; or an order number stored on the device, from that store's exact domain (never a subdomain relay or a free email domain), only when that domain is on a vetted list of 14 stores that publish DMARC `p=reject` and do not relay other sellers' messages (amazon.com publishes `p=quarantine`, so it stops at Neutral; ebay.com, etsy.com and similar marketplaces, plus target.com and bestbuy.com, were removed because members or third-party sellers can write mail from the platform's own domain), with no such request and no link to another site. Both paths also need the AI read to label no request, and an email short enough to read whole; links, forms and images count (Gmail redirects unwrapped), any hidden text in the extension stops Safe, and Gmail's Spam, warning-banner and "via" flags, or a Gmail interface not in English, cap the result at Neutral. Any way to pay or reach someone off the official site (phone numbers, @handles, messaging apps, Zelle, Venmo, Cash App and other payment rails, gift cards, money with a send verb, links written as "[.]" or " dot ", card or bank asks, reply-with-details, QR codes) also stops Safe, or gives Warning for a clear ask. Your real tracking number from any other sender, even another carrier's official domain, gets **Warning**, because the number has likely leaked. A Gmail thread with more than one sender never gets Safe.
- Real on-device runs on public GitHub runners on production `a166eac` (23 Nov, round 5): nano-film run 45162692620 (site) showed **Checked on this device** for DHL **Warning**, the UPS sample **Safe**, a leaked-number fee email **Warning**, and a pasted UPS email **Neutral** (a pasted email can't prove who sent it); run 45162700037 (extension, live judge zip built from `a166eac`) showed **Checked on this device** and **Warning** in the side panel. Each result.json records the deployed commit, read from the site's `/build-info.json` and the zip's `build-info.json`. The result.json files and frames are kept in the repo's `docs/proof/`. One earlier round 5 run, 45161337542, failed: Nano labelled the clean pasted UPS email as a download request (Warning, not Neutral); a prompt fix followed. The extension's Safe path is covered by unit tests only, not recorded on a runner or on signed-in Gmail.
- Real cloud verdicts recorded by hand on a Galaxy S25 (17 Nov 2026; no public capture): Chrome Android showed **Checked in the cloud** for the first DHL thread (**Warning**, **You're not expecting any parcel right now.**) and, after **Load the matching shipment demo**, for the UPS thread (**Safe**), with no second consent dialog. The Telegram and X in-app browsers on the same phone and iPad Safari also returned **Checked in the cloud**.
- One command, `npm run verify`, prints PASS or FAIL for 19 checks: 645 unit tests, a coverage gate, typecheck, lint, a guard against direct Prompt API calls, builds, the extension zip, secret scans of files, history and bundles, a dependency audit, and live-site checks.
- Lighthouse 13.6.0 (mobile), re-run 26 Nov 2026 on production `44584dd`: Accessibility, Best Practices and SEO 100 on all 9 indexed routes; Performance 96 to 100 (home 96, every other route 99 or 100). The `/extension-demo/` test fixture is marked noindex by design, so its SEO drops to 63 and it is not counted among the 9. Reports in `docs/proof/lh-26nov/`.

### What we learned

- Hybrid inference is most useful when the product is honest about where the model ran, and when the model's job is small and checkable.
- Structured output is a contract, but code still has to check it against the source text.

### What's next

- Chrome Web Store listing for the extension (sideloaded today; a listing is not part of this entry).
- Outside testers: none recorded yet. A one-page card is in `docs/proof/tester-card.md`; results will be logged in `docs/proof/testers.md`.
- More carriers and stores in the official-domain pack.

### Built during the submission period, and AI tools used

New project; every commit reachable from `main` is inside the submission period (first commit on main is `72f7212`, 16 Nov 2026; earlier scaffolding was squashed in). Grok Bot wrote the product code, tests, docs and the verify pipeline, and built the earlier site and v6 UI, directed by Oh-Jay. Claude helped plan the idea on 11 and 12 Nov (no code before the first commit), and Claude Opus 5.5 landed the UI-NEXT UI commits (13 commits on main, each with a Co-Authored-By line; three earlier v7 commits were squashed into the 16 Nov import) on 15 to 17 Nov. Oh-Jay chose the idea, wrote the product and design briefs, made the product decisions, supplied the media, and reviewed the builds on his own phone and iPad. All of the app's AI inference runs through Firebase AI Logic.

## Built with

firebase, firebase-ai-logic, gemini-nano, gemini, app-check, recaptcha-enterprise, typescript, vite, chrome-extension, indexeddb, three.js, vercel, github-actions

## Testing instructions for judges

No login, no keys. Open https://did-i-order-this.vercel.app/app/ in any browser. Click the first thread (**DHL Express Desk**, **Your parcel is held. Pay the release fee.**; on a phone the threads are one row you can swipe), then **Check this email**. In Chrome with Gemini Nano it runs on the device with no dialog; elsewhere a dialog asks **Check this email in the cloud?** (the first time, the dialog can take up to about 12 seconds to appear). Either choice ends on **You're not expecting any parcel right now.** Then click **Load the matching shipment demo** and check the UPS email: **This tracking number matches a shipment you are expecting.** If the header does not say 1 order and 0 expected parcels at the start, click **Reset demo data**.

To see the on-device path in desktop Chrome, follow the hackathon FAQ: enable **Gemma 4 for Built-in AI** in `chrome://flags` and relaunch (Chrome's hardware requirements apply).

Chrome extension: download the judge zip above, unzip it, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `did-i-order-this-extension` folder inside the unzipped folder (the one that holds `manifest.json`). Then open the extension test page above (or a Gmail thread), open the side panel and click **Check this email**. The extension is on-device only and never calls the cloud; without Nano it offers **Run a limited check (no AI)**.

Full steps with every on-screen string: `docs/TESTING.md` in the repo. One-command code check: `npm ci` then `npm run verify` (Node 22.22 or later).

---

## Before you press Submit

1. `FILM_URL` replaced here and in the README (Grok does the README); the video is public, under 2:30, captions on.
2. Grok's final pre-submit check has passed (live site, zip, numbers here match the README).

(Repo is public, checked 23 Nov.)
