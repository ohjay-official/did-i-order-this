# On-device proof

These files are copied from the artifacts of two public GitHub Actions runs in [`ohjay-official/nano-film`](https://github.com/ohjay-official/nano-film), so the proof stays readable after the artifacts expire. Both runs used a 4 vCPU / 16 GB GitHub runner with Chrome 157.0.8103.78, which downloaded Gemini Nano before the check (`warmup.result` is `on-device-ok`).

| Run | What it checked | Result | Files |
| --- | --- | --- | --- |
| [45127511017](https://github.com/ohjay-official/nano-film/actions/runs/45127511017) (`on-device-demo`), 23 Nov 2026, 07:57 to 07:59 Africa/Lagos | The live sample inbox at `https://did-i-order-this.vercel.app/app/`, first DHL thread, production `2e40e13` | **Checked on this device**, **Warning**, **You're not expecting any parcel right now.**, no cloud consent dialog | [result.json](site-run-45127511017-result.json), [frame](site-run-45127511017-hosted-inbox.png) |
| [45127515281](https://github.com/ohjay-official/nano-film/actions/runs/45127515281) (`extension-on-device`), 23 Nov 2026, 07:58 to 08:00 Africa/Lagos | The live judge zip, loaded unpacked, side panel on a local Gmail-thread fixture | **Checked on this device**, **Warning**, the same headline, no cloud consent dialog | [result.json](extension-run-45127515281-result.json), [frame](extension-run-45127515281-sidepanel.png) |

How to read `result.json`: `hosted` (site run) or `extension` (extension run) holds what the page showed. `label` is the visible source label, which the app sets to **Checked on this device** only when the Firebase AI Logic SDK reports `inferenceSource` `on_device`. The runner copies that label into `inferenceSource`; it does not read the SDK value a second time. `consentShown: false` means the cloud consent dialog never appeared, so nothing was sent to the cloud. `usedSample: false` means the prepared sample claim was not used.

The extension runner adds `http://127.0.0.1:8123/*` to the installed manifest's content script matches, because it cannot sign in to Gmail; the JavaScript in the zip is unchanged.
