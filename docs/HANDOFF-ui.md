# Handoff to Claude: UI and UX for "Did I Order This?"

From: Grok Bot (built the code through v6.2 and the 15 Nov backend pass). To: Claude, who owns all remaining UI and UX work.
Written 15 Nov 2026, Africa/Lagos (UTC+1). Owner: Oh-Jay (GitHub `ohjay-official`), phone-first, reviews on the live URL.

## 1. The project in one paragraph

"Did I Order This?" is Oh-Jay's solo entry for #BuildHybridAI 2026 (Firebase AI Logic hybrid inference, Devpost, platform Web / Chrome). A person opens a delivery, renewal, invoice or refund email. Firebase AI Logic reads what the email *claims* (party, asked action, cited numbers, email kind) as structured JSON, on device first (Gemini Nano in Chrome) and in the cloud only after consent. Deterministic code then checks that claim against orders and tracking numbers stored on the device and gives Safe, Warning or Neutral, with a label: "Checked on this device", "Checked in the cloud", "Limited check (no AI)" or "Check not completed". The money shot: a fake DHL fee email gets "You're not expecting any parcel right now." There is a hosted site with a sample inbox (the judging path) and a sideloadable Chrome MV3 side-panel extension for Gmail.

## 2. Repo, branch, deploy

- Repo: `ohjay-official/did-i-order-this` (private until about 28 Nov), branch `main`. Local checkout on the box: `/workspace/did-i-order-this`.
- Deploy: every push to `main` auto-deploys to production on Vercel at <https://did-i-order-this.vercel.app>. Vercel team `oh-jay-s-projects`, project `did-i-order-this` (`prj_mdBLMAg4cNtDy1Lv7TpGD9vE65I6`, team `team_mbAY3t3bzOPsb0RyQWblamxG`). The Vercel CLI on the box is logged out; use the Vercel connector to list deployments by commit SHA.
- Build on Vercel (`vercel.json`): web build, extension build, then the judge zip into `web/dist/downloads/`.
- CI: `.github/workflows/ci.yml` runs `npm run verify -- --offline` on every push. Check it with the GitHub connector (`list_check_runs_for_ref`).
- Commits must be authored as `ohjay-official`.

## 3. Stack and file map (UI parts)

Stack: TypeScript, Vite 7 multi-page app (no framework), plain CSS, three 0.160.0 for the globe, firebase 13.2.0, Vercel Analytics and Speed Insights. Monorepo workspaces: `packages/core`, `web`, `extension`.

**Web pages** (each is its own `index.html` entry in `web/`):

| Route | File | Notes |
| --- | --- | --- |
| `/` | `web/index.html`, `web/src/site/landing.ts` | Hero with live check chips, globe, freight scroll, night footer |
| `/app/` | `web/app/index.html`, `web/src/app-main.ts`, `web/src/ui/InboxApp.ts` | The sample inbox (judging path) |
| `/how-it-works/`, `/features/`, `/extension/`, `/pricing/`, `/faq/`, `/about/`, `/privacy/` | `web/<route>/index.html` | Static content plus shared shell |
| 404 | `web/404.html` | Custom 404 |
| OG image source | `web/og.html` | Per-page OG images live in `web/public/og/` |

**Shared site code** (`web/src/site/`): `shell.ts` (header, menu, footer, logo SVG `LOGO_MARK`), `main.ts` (entry for inner pages), `pages.ts`, `flow.ts` (section flow), `stage.ts` (hero stage loop), `globe.ts` + `globe-three.ts` (lazy-loaded globe), `freight.ts` (scroll-driven freight clip), `insights.ts` (analytics, production host only), `emailText.ts`.

**CSS cascade:** `web/src/styles-v6.css` imports `styles-v5.css`, which imports `styles.css`. All three are live. v6 overrides v5 overrides base.

**Assets:** `web/public/` (favicons, `site.webmanifest`, `og.jpg`, `og/`, `brand/` lockups, `fonts/`, `media/` with the globe atlas, hands, and the freight clip as WebP frame sequences in `freight-1280/` and `freight-960/` drawn to a canvas, plus `handling-end.jpg` as the still), `hero-desk.jpg/.webp`.

**Extension UI:** `extension/sidepanel.html` (inline `<style>`), `extension/src/sidepanel.ts` (render and check flow), `extension/icons/`. Non-UI extension files: `background.ts`, `content.ts`, `extract.ts`, `messages.ts`, `ledger.ts`, `manifest.json`, `build.mjs`, `package.mjs`.

## 4. Design system as built

- **Palette (base, `styles.css` :root):** `--bg #f7f3ee`, `--card #fffaf5`, `--raised #efe6dc`, `--ink #1c1410`, `--secondary #5e534b`, `--muted` (overridden to `#685c52` in v6 for contrast), `--accent #c4451c`, `--accent-soft #fde4d4`; verdicts `--safe-bg #e7efe8 / --safe-ink #1c3d22`, `--warning-bg #fde4d4 / --warning-ink #8b2a16`, `--neutral-bg #efe6dc / --neutral-ink #3f3c36`.
- **v6 warm flow (`styles-v6.css` :root):** `--ember #ad3217`, `--dusk #4a1a0f`, `--night #1d100b`, `--night-2 #140b08`, `--on-night #fdf1e6` (plus 0.72 and 0.5 alphas), `--amber #f0b14a`, `--coral #e24a2b`. The page flows daylight cream, then dusk, then night with no hard section lines.
- **Gradient:** `--gradient-warm: linear-gradient(90deg, #8b1e12, #e24a2b 38%, #f08a3c 68%, #f0b14a)`.
- **Type (self-hosted woff2 in `web/public/fonts/`):** Instrument Sans 400/500 (`--font`, body), Syne 400/500 (`--display`, headings), IBM Plex Mono 400 (`--mono`, labels, dates, source labels), Newsreader 400/500 (declared in base, little used now).
- **Shape:** pill buttons (`--radius-btn: 999px`), cards 20px, panels 28px. Soft warm shadows (`--shadow`, `--shadow-sm`).
- **Motion:** `--ease: cubic-bezier(0.22, 1, 0.36, 1)`. Hero stage loop runs at about 15 fps, pauses off-screen (IntersectionObserver) and starts when idle. Globe module is lazy-loaded. Freight clip is scroll-mapped. `prefers-reduced-motion` is handled in CSS (all three sheets) and in JS (`landing.ts`, `pages.ts`, `flow.ts`, `freight.ts`).
- **Logo:** parcel-tape question mark. Sources in `/home/box/hackathons/buildhybridai-2026/logo/final/` (`mark.svg`, `mark-small.svg`, `favicon.svg`, `app-icon.svg`, `app-icon-maskable.svg`, `lockup.svg`, `lockup-night.svg`, `lockup-stacked.svg`, `wordmark.svg`); concept sheet at `logo/concept-sheet.png`. Shipped copies in `web/public/brand/` and inline as `LOGO_MARK` in `shell.ts`.
- **Credit:** the CSS headers credit the unslop checklist (Damir Sokolovsky, CC BY 4.0). Keep that line.

## 5. Oh-Jay's design rules

- Relaxed rules apply now: bold gradients and pill buttons are fine.
- **Never:** purple; emoji used as icons; fake counters, testimonials, user numbers or partner logos; vague hero text; em dashes in copy.
- Only true claims. Anything not built is labelled "planned" (for example the Chrome Web Store listing).
- Feel reference: backline.travel.
- Phone first. No sideways scroll at 375 and 390 px widths.
- Respect reduced motion.
- He wants each landing section to flow into the next with one colour scheme throughout (his words in the v6 brief).
- He wants to approve visual direction. Show him screenshots or the live URL at checkpoints.

## 6. History v1 to v6.2

Screens for every round are in `/home/box/hackathons/buildhybridai-2026/ui-v1/` to `ui-v6-2/`.

- **v1, v2:** he called them AI slop.
- **v3:** he loved the hero (live checker on a warm colour field). Keep its spirit.
- **v4:** "every single page is still blank". Too empty.
- **v5:** product UI in every section (density pass).
- **v6 (15 Nov), brief at `/home/box/hackathons/buildhybridai-2026/brief-v6.txt`:** five pasted prompts mapped to sections.
  - "For Noor" photo globe letter (ostra) for the sample-box section: **adapted.** The photo globe and its constants were matched to the ostra spec; the letter layout, fictional names and copy were not used.
  - KV freight scroll hero for "Try it on the sample inbox": **adapted** with a real handling clip, scroll-mapped. The literal reach-stacker render story, "OUR SERVICES" letters and cyan cards were not copied.
  - Shipcraft CTA and footer: **adapted** as the night footer with the marble hands. The Shipcraft brand, newsletter field and amber sail mark were not used.
  - Vantix "Cobalt Flare" footer for the menu and links: **adapted to the warm palette.** Cobalt and cyan were dropped to keep one colour scheme.
  - "Flow seamlessly, same colours throughout": **done** as the cream to dusk to night flow.
- **v6.1:** real freight clip, Shipcraft-style hands footer, globe constants, try chips on one row.
- **v6.2:** new logo and favicon set, per-page meta titles, descriptions and OG images, JSON-LD, privacy policy, analytics, loading states, contrast fixes, an above-the-fold call to action on every inner page.
- **15 Nov backend pass (no restyling):** only copy changes: the cloud consent dialog now says "The cloud uses Google's free Gemini tier, so Google may keep this text and people at Google may review it." and the home hero caption gained "Google may review text sent to its free cloud tier."
- Then Oh-Jay moved all UI work to Claude.

## 7. Current state per page (15 Nov)

Lighthouse mobile on production after the backend pass: Accessibility, Best Practices and SEO are 100 on all 9 routes. Performance: home 84 on the latest run (74 on the earlier v6.2 run; it varies), 100 on the other routes. Reports: `/home/box/hackathons/buildhybridai-2026/ui-v6-2/lighthouse-post-backend/`, `lighthouse/` and `lighthouse-scores.md`.

- **Home `/`:** v6 flow complete (hero with live chips, globe, freight scroll, night footer). Heaviest page. The hero check works on device or in the cloud after consent.
- **`/app/`:** works end to end; the layout is a two-column inbox plus result card. Functional, not yet the "bigger dashboard" Oh-Jay wants.
- **`/how-it-works/`:** content complete; the pinned "How it works" treatment is still open.
- **`/features/`, `/pricing/`, `/faq/`, `/about/`, `/privacy/`:** complete, v6 shell, CTA above the fold.
- **`/extension/`:** describes sideloading from the repo folder. It has no download button yet, although the zip now exists at `/downloads/did-i-order-this-extension-0.1.0.zip`.
- **Extension side panel:** works (checked on 15 Nov by loading it next to the Gmail fixture). Styled inline in `sidepanel.html`. On-device verdict filmed on a public runner: [nano-film run 43685102643](https://github.com/ohjay-official/nano-film/actions/runs/43685102643), label "Checked on this device", `inferenceSource` `on_device`. The runner used a local Gmail-thread fixture (manifest match added at test time); the zip JavaScript was unchanged.

## 8. Open UI items

1. Home Performance (84 now, 74 earlier). The main costs are the hero stage, the globe and the freight video.
2. README screenshots now live in `docs/images/` (home, sample inbox, consent), captured from the live site at 390-pixel width on 16 Nov 2026. Retake all of them after any UI change. A live AI verdict could not be captured from the box (no Gemini Nano; App Check rejects automated Chrome). A short GIF of the sample-inbox verdict would still help.
3. `/app/` as a bigger dashboard.
4. The pinned "How it works" section.
5. Optional for the demo film: a polished clip of the side panel on a real signed-in Gmail thread. The on-device proof itself is done (nano-film run 43685102643, local Gmail-thread fixture, "Checked on this device").
6. An extension download button on `/extension/` that links to `/downloads/did-i-order-this-extension-0.1.0.zip` and updates the sideload steps (download, unzip, Load unpacked). The README already documents this path.
7. Keep the no-sideways-scroll audit green at 375 and 390 on all 10 routes.

## 9. Selectors the on-device film run needs (do not break)

The public proof workflows in `ohjay-official/nano-film` (`on-device-demo.yml` for the live `/app/` page, `extension-on-device.yml` for the judge zip) share `e2e/on-device.mjs` (also in this repo under `e2e/`). Keep these exactly:

- `[data-action=check]`, `[data-thread="thread-1-carrier-lure"]`, `[data-action=consent-yes]`
- `.source-label`, `.outcome`, `.headline` and `.result h2`
- The text "prepared for this sample thread"
- Failure texts it watches for: "could not run", "not available in this environment", "On-device AI is not configured"
- Extension fixture: `h2.hP` (Gmail subject) and the text `GM123456789012345`
- Also used by the app: `[data-action=consent-no]`, `[data-action=limited]`, `[data-action=save]`, `[data-action=reset]`, `[data-action=check-paste]`

If you must change one, change `e2e/on-device.mjs` in both repos in the same session and re-run the nano-film workflow.

## 10. Things that must not change

- `web/src/ai/` (readClaim, schema, parseClaim, cloudBudget, aiError, sourceLabel), `web/src/firebase/app.ts` (App Check), `web/src/consent.ts`: the AI wiring, consent rule and App Check.
- All inference goes through Firebase AI Logic. Never call Chrome's `LanguageModel` directly (`npm run check:no-languagemodel` and lint enforce this).
- Cloud only after consent; the extension never calls the cloud.
- `vercel.json` security headers and CSP. If you add a third-party script, font or image host, the CSP will block it: self-host instead, or add the exact host to the right directive and test the live cloud check.
- `extension/manifest.json` permissions (`storage`, `sidePanel`, Gmail content script only) and `extension/src/messages.ts` / `background.ts` sender checks.
- `packages/core` verdict logic and the exact headline "You're not expecting any parcel right now."
- No secrets, keys or App Check debug tokens in the repo, film, README or testing notes.

## 11. How to verify

```bash
cd /workspace/did-i-order-this
npm run verify            # all checks plus live-site links, zip, 404 and headers
npm run verify -- --offline
```

Lighthouse (mobile) from the box: `bash /tmp/lh/runlh.sh` (uses `CHROME_PATH=/usr/bin/google-chrome npx lighthouse`), if `/tmp/lh` still exists; otherwise `npx lighthouse <url> --only-categories=performance,accessibility,best-practices,seo`.
Overflow and reduced-motion audit: `/tmp/v6media/audit.mjs` (Playwright at `/tmp/pw`, Chrome at `/usr/bin/google-chrome`), if still present.
A live cloud check needs a headed Chrome (reCAPTCHA Enterprise rejects headless Chrome with "App attestation failed"); the box has a display (`DISPLAY=:4`).

## 12. Timeline (Africa/Lagos)

- 26 to 28 Nov: three real testers.
- About 28 Nov: repo goes public.
- 29 Nov: full Devpost entry.
- 30 Nov 23:00: hard deadline (2:00 P.M. Pacific Time). Target submit 20:00.

## 13. Evidence and references

- `/home/box/hackathons/buildhybridai-2026/`: `spec.md`, `rules.md`, `brief.md`, `brief-v6.txt`, `demo-script.md`, `HANDOFF-to-Grok.md`.
- UI rounds: `ui-v1/` to `ui-v6-2/` (v6.2 has `checklist.md`, `lighthouse-scores.md`, `lighthouse/*.html`).
- Logo: `logo/` (`concept-sheet.png`, `concepts/`, `final/`).
- On-device proof: `evidence/on-device-demo-43219012008/` and `evidence/on-device-demo-43682923396/` (15 Nov site re-run: "Checked on this device"). Extension proof: `evidence/extension-on-device-43685102643/` and <https://github.com/ohjay-official/nano-film/actions/runs/43685102643>. All runs: <https://github.com/ohjay-official/nano-film/actions>.
- README: `README.md` in the repo (rewritten 16 Nov to Oh-Jay's readme-playbook skill and merged to `main`). The film line is `TBD-post-build: film URL`.

## 14. Non-UI items waiting on Oh-Jay (not for Claude to do)

- Add the demo film link in place of `TBD-post-build: film URL` in the README after filming.
- Make the repo public (about 28 Nov) and show Apache-2.0 in the About box. The README repo link only works after that.
- Confirm the rights to the supplied media (hero desk photo, globe texture, hands, freight clip) before the repo goes public.
- Decide whether the downloadable extension zip may carry the Firebase web config. It holds the same public web API key that the live site's JavaScript already serves (key locked to the site's referrer, no reCAPTCHA key). The rules forbid production API keys in the repo, form and testing instructions; the zip is a build output, not in the repo.
- Extension on-device proof is done: [nano-film run 43685102643](https://github.com/ohjay-official/nano-film/actions/runs/43685102643). Caveat: the runner could not sign into Gmail, so it added a local fixture host to the installed manifest's content script matches. The zip JavaScript was unchanged.
