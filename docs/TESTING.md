# Testing Did I Order This?

Do-this, see-this steps for judges and testers. Every quoted string below was read off the screen on 16 Nov 2026 (Africa/Lagos), first in a local build and then again on the live site after the merge (`72f7212`), unless the step says otherwise. Steps 1 (Path C) and 2 were walked again on the live site at `9c6e0cc` the same evening, at 390 pixels, with the same strings, and again after the UI update at `f87d165` (16 Nov, 23:00 to 23:30 Africa/Lagos) and after UI-NEXT 11 and 12 at `598cf21` (17 Nov, 04:18 to 04:25 Africa/Lagos). Section 4 was re-checked at `c94c806`. Path B (a real cloud verdict) was walked on a Galaxy S25 on 17 Nov 2026, first in Chrome Android at production `db64fcc`, then in the Telegram and X in-app browsers after `598cf21`. No keys, tokens or accounts are needed.

Live site: https://did-i-order-this.vercel.app (sample inbox at `/app/`).

## 1. Sample inbox, any browser

Open https://did-i-order-this.vercel.app/app/. The header says **1 order and 0 expected parcels are stored on this device.** If it shows a different count (for example after you tried the homepage chips), click **Reset demo data** first.

1. Click the first thread, **DHL Express Desk**, **Your parcel is held. Pay the release fee.**, then click **Check this email**. On a phone the threads are one row you can swipe sideways, and **Check this email** is on the first screen. After a check, the verdict card scrolls into view under the site header. On phones a **SAMPLE DATA** tag sits on the card itself (the Sample data bar at the top of the page is not sticky).
2. What happens next depends on your browser. Pick the path that matches.

### Path A: Chrome with on-device AI (Gemini Nano)

- No dialog appears. You see **Warning**, **You're not expecting any parcel right now.**, and **Checked on this device**.
- Recorded on the current build on a GitHub runner with Nano: nano-film run 44009266512 (17 Nov 2026, production `598cf21`). The machine used for the other steps has no Gemini Nano.
- To turn on-device AI on in desktop Chrome: the hackathon FAQ says to open `chrome://flags`, search for **Gemma 4 for Built-in AI**, enable it, and relaunch. The runner instead enables `chrome://flags/#optimization-guide-on-device-model` and `chrome://flags/#prompt-api-for-gemini-nano`. `chrome://on-device-internals` shows whether the model is ready. Chrome's hardware requirements apply.

### Path B: no on-device AI, you allow the cloud

- A dialog asks **Check this email in the cloud?** with **Check in the cloud** and **Do not send**. Click **Check in the cloud**.
- You should see **Warning**, **You're not expecting any parcel right now.**, **Checked in the cloud**, then **Your yes to cloud checks is remembered for sample emails until you close this tab.** and a button **Ask me each time**.
- Later sample threads in the same tab go straight to the cloud without the dialog. A pasted email is always asked about.
- Walked on a Galaxy S25 on 17 Nov 2026 (Africa/Lagos). In Chrome Android, against production `db64fcc`: the first DHL thread after **Check in the cloud** showed **Warning**, **You're not expecting any parcel right now.**, **Checked in the cloud**, the remembered-yes note and **Ask me each time**. After **Load the matching shipment demo**, the UPS thread showed **Safe**, **This tracking number matches a shipment you are expecting.**, **Checked in the cloud**, with no second consent dialog, and the header said **1 order and 1 expected parcel**. The same morning, after UI-NEXT 11 and 12 (`598cf21`), the Telegram and X in-app browsers on that phone each checked the first DHL thread with the demo shipment already stored and showed **Warning**, **This tracking number is not one of your shipments.**, **Checked in the cloud**, the **SAMPLE DATA** tag on the verdict card, the remembered-yes note and **Ask me each time**. The model-filled claim text varied (Telegram: **Claims to be: DHL (carrier)**, **Email kind: carrier_update**; X: **Claims to be: DHL Express Desk (carrier)**, **Email kind: delivery_problem**); the verdict was the same, because code decides it. WhatsApp on Android has no in-app browser (it opens Chrome). reCAPTCHA Enterprise still rejects automated Chrome on the build machine, so that box cannot produce a cloud verdict itself.

### Path C: no on-device AI, you click Do not send

- You see **Warning**, **You're not expecting any parcel right now.**, then **On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread.** and **The email was not sent to the cloud.**
- There is no source label on this result, because it is a prepared sample claim, not an AI read.
- The decline is not remembered. The next **Check this email** asks again.
- With a keyboard, focus starts on **Do not send**, and Escape is the same as **Do not send**.

### Path D: you allow the cloud, but the cloud check fails

The verdict and the prepared-sample note are the same as Path C. The second line says why:

| What failed | Second line on screen |
| --- | --- |
| App Check (for example a privacy browser, or automated Chrome) | **The cloud check could not run. This page could not prove it is the real site (App Check). Reload the page and try again.** |
| Project quota | **The cloud check could not run. The cloud limit for this project was reached. Wait a minute and try again, or run a limited check.** |
| Offline, or reCAPTCHA blocked so the cloud never answers (gives up after 20 seconds) | **The cloud check could not run. The cloud did not answer in time. Check your connection and try again.** |
| Network error | **The cloud check could not run. The cloud could not be reached. Check your connection and try again.** |
| Browser courtesy cap (10 cloud reads a minute, 30 a tab session) | **The cloud check could not run. Cloud reads are limited to 10 a minute. Try again in N seconds.** |

The App Check, quota and offline rows were produced on this box by blocking or faking the network in a local build. The network-error and cap rows are covered by unit tests.

### How long before the dialog

Measured on this box (desktop Chrome 156, on-device API present but no model): **under 0.1 seconds** when the page had been open for 13 seconds, and **about 11 seconds** when Check was clicked straight after the page loaded. The page waits only in its first 12 seconds, because Chrome can report the model as missing for a few seconds after it starts. Browsers with no on-device API at all (for example Firefox, Safari, and Chrome on phones) skip that wait; this is unit tested, not measured in those browsers.

## 2. See a match and a mismatch

After any result in step 1, a card says **Next, see a match. This stores the UPS parcel from the Northwind sample email as an expected parcel on this device. It is demo data, and Reset demo data removes it.**

3. Click **Load the matching shipment demo**. The UPS thread opens, the header says **1 order and 1 expected parcel are stored on this device.**, and a note says **Matching shipment demo loaded. UPS 1Z999AA10123456784 is now an expected parcel on this device (demo data). Check this UPS email next.**
4. Click **Check this email**. Expect **Safe** and **This tracking number matches a shipment you are expecting.**
5. Open the last thread, **Duty payment required for your shipment** (on a phone, swipe the thread row to reach it), and check it. Expect **Warning** and **This tracking number is not one of your shipments.**
6. Optional: **Streamhut Billing**, **Your Streamhut invoice is due** gives **Neutral** and **You have no history with this sender.**
7. Click **Reset demo data**. You see **Demo data reset. There are no expected parcels.** and the header is back to **1 order and 0 expected parcels are stored on this device.**

Steps 3 to 7 were walked on this box with Path C (Do not send) on every thread. With AI (Paths A and B) the headlines are the same, because the same deterministic code decides them; the label changes to the AI source.

The older route still works: check **Northwind Outfitters**, **Your order has shipped** with AI, then click **Save this shipment**.

## 3. Paste your own email

Paste an email that is not one of the samples and click **Check pasted email**. With no on-device AI and **Do not send**, you see **Error**, **The check could not finish**, **The AI read could not run. The email was not sent to the cloud.** and **Run a limited check (no AI)**. That button gives **Limited check only. This is not a full verdict.** with **Limited check (no AI)**.

**Import order history** accepts an Amazon ZIP or CSV, a PayPal CSV, or a generic CSV. The file is read in the browser and not uploaded.

## 4. Homepage chips

On https://did-i-order-this.vercel.app, in a browser without on-device AI and with the default "on this device" mode:

- **Fake DHL**: **You're not expecting any parcel right now.** with **On-device AI did not run in this browser. This check used the structured claim prepared for this sample.**
- **Real UPS**: the chip first stores the matching UPS shipment. This works even as the very first tap on a brand-new device (fixed in `c94c806`). Expect **This tracking number matches a shipment you are expecting.** and **Demo data: before this check, the chip saved UPS parcel 1Z999AA10123456784 from the Northwind sample as an expected parcel on this device. Reset demo data in the sample inbox removes it.**
- After **Real UPS**, the **Fake DHL** chip says **This tracking number is not one of your shipments.**, because a parcel is now expected. **Reset demo data** in the sample inbox brings back the first headline.

## 5. Chrome extension (desktop Chrome 138 or later)

1. Download https://did-i-order-this.vercel.app/downloads/did-i-order-this-extension-0.1.0.zip and unzip it. If you downloaded it before 16 Nov 2026, download it again: the test page below needs the new copy.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the inner `did-i-order-this-extension` folder.
3. Open https://did-i-order-this.vercel.app/extension-demo/. It is labelled **Extension test fixture.** and says it is not Gmail. Open the extension's side panel from the toolbar. It shows the open sample email and **Check this email**. The buttons on the page switch between the five sample emails.
4. With Gemini Nano you should see **Checked on this device** and the verdict (recorded on a runner with Nano on 17 Nov 2026 against the live zip, nano-film run 44009272463, using a local copy of this kind of page).
5. Without Nano you see **Error** and **The AI read could not run. On-device AI is not available in this browser. This extension does not send mail to the cloud. Open https://did-i-order-this.vercel.app to check in the cloud after you agree, or run a limited check here.** Then **Run a limited check (no AI)** gives the limited check.

The side panel and fixture were run on this box with the extension loaded unpacked and the fixture served at its live address. The extension is built to read an open Gmail thread at `mail.google.com`; a signed-in Gmail thread was not tested on this machine.

## 6. For maintainers

Needs Node 22.22 or later (`.nvmrc` says 22; `nvm use` picks it up). Verify fails its first check on an older Node.

```bash
npm ci
npm run verify -- --offline   # tests, coverage, typecheck, lint, build, zip, secret scans
npm run verify                # also checks the live site after a deploy
```

Do not put an App Check debug token or any key value in these steps, the README, or the Devpost form.
