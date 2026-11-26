# HANDOVER to Grok, 26 Nov 2026

Everything Claude Opus 4.7 did in this chat, from the Grok→Claude handover
of 23 Nov to today (26 Nov 15:00 Africa/Lagos), and what is still open
before the Mon 30 Nov 20:00 Africa/Lagos submit target.

## Project snapshot

- **Project:** Did I Order This? Solo entry, Oh-Jay (Faithful Adejoh).
- **Event:** #BuildHybridAI 2026, Google Firebase on Devpost. Deadline Mon 30 Nov 2026 2:00 PM PT = **23:00 Africa/Lagos**. Target submit **20:00 Africa/Lagos**.
- **Prize:** Best Web/Chrome (Grand Prize eligible).
- **Repo:** `ohjay-official/did-i-order-this`, Apache-2.0, main branch.
- **Live site:** https://did-i-order-this.vercel.app (Vercel auto-deploys on push to main).
- **Deployed sha:** check `/build-info.json`. As of this doc: **8dc59d3**.
- **Nano-film proofs:** separate public repo `ohjay-official/nano-film` on GitHub Actions. Oh-Jay is the only one who can trigger those runs.

## Oh-Jay's standing rules (don't break these)

- Talk blunt, short, mobile-friendly. Make strategic calls; don't hand him menus.
- Only tell him what he must do himself (film, submission, open questions).
- 10-80-10 rule: he gives context, Claude or Grok does 80%, he reviews the last 10%.
- Never present an unverified claim as fact.
- If Claude lacks context, ask before producing work.
- Commits authored as `ohjay-official <ohjay-official@users.noreply.github.com>`, never `jayejone0`.
- No em dashes.
- No secrets in chat, logs, repo, client code or Vercel env. `.env.example` has names only.
- Don't change verdict logic or wording in `packages/core` without a review-driven reason.
- Keep `npm run verify` at 19/19 (`npm run verify -- --offline` shows 13 passed + 1 skipped; CI runs offline).
- Don't change `e2e/on-device.mjs`.
- Keep every "Do not break" selector (see list at the bottom).
- Any new outside host added to the site must also be added to `vercel.json` CSP.

## Standing decisions from rounds 3-5 that still apply

- A pasted email never gets Safe. Pasted = `senderCheck: "pasted"`, caps at Neutral.
- Safe needs: a verified sender (Gmail's own record in the extension, or a built-in sample), a stored match, no risky ask found by code, and the model label "none".
- Carrier Safe path: tracking number from the carrier's official domain. Store Safe path: order number from a vetted store on the DMARC `p=reject` list (now 14 after round 6).
- Nothing leaves the device before a real consent yes.
- Reviewers are read-only: they don't touch Firebase or Vercel consoles, repo settings, or the nano-film workflows, and don't spam cloud checks.

## What Claude did in this chat

### Day 1, 23 Nov 2026

Received `HANDOVER-to-Claude-2026-11-23.md` from Grok. Shipped UI-NEXT
items 15-35 under the handover's priority order:

| Commit | Content |
|---|---|
| **1e7c505** | UI-NEXT 32: "Add a tracking number you are waiting for" field on `/app/` and in the side panel. New `addExpectedTracking` ledger API, `ManualTrackingError`, shape validation, 30-day expiry, header expected count updates live. |
| **7f7fa0e** | UI-NEXT 33, 29, 28: globe atlas redrawn with real strings; illustration captions above each stamped mockup; renamed demo card label. |
| **ec707ce** | UI-NEXT 15-27, 30, 31, 34, 35: visible-hidden `<h1>` on test fixture, side panel "Checked: <subject> from <sender>" line above each result, long-text wrapping fixes, not-sent neutral state, disabled-button visual, hero-note pair, phones show all hero reasons, demo bar static on phones, SAMPLE DATA tag on verdict card on phones. |
| **0a3f7f3** | Docs: marked UI-NEXT 15-35 done; wrote `docs/reviews/judges/PROJECT.md` and `docs/submission/devpost-draft.md`. |

Then launched three review subagents. The cold judge and claims
audit lost to a rate limit; the strict security audit finished.

### Round 6 security fixes (23 Nov, commit `bfe5e25`)

Five holes closed from the strict audit:

1. **Link scanner**: plain-text site names with odd dots (ideographic, full-width, spaced, `%2e`) or IPv4 addresses no longer slip past `signals.ts`; `readLinkHosts` also reads the browser-normalised host of a full URL.
2. **Expected window**: a parcel saved from a shipment notice gets `expectedUntil`; `isExpectedShipment` counts a row with no end date for 30 days from `confirmedAt`, never forever.
3. **Limited check**: adds lure lines for a phone or handle, an amount to pay, outside sites and hidden text.
4. **Extension extractor**: reads image `alt` and `title` text; attachments (`.aQH`, `[download_url]`, `.aZo`) and embedded frames set `unreadContent`, which caps Safe at Neutral.
5. **Store list**: `target.com` and `bestbuy.com` dropped (both run third-party marketplaces that can send from the exact domain). List is now **14 stores**.

Plus: `hasDemand` scan bounded to a 300-char lookback per match (not quadratic); `GET_EMAIL` refuses content-script callers.

Regressions: `packages/core/src/round6.test.ts` (20), `extension/src/round6.test.ts` (5).

### Round 6 docs (`68b5011`)

- README decide-rules now say 14 stores, not 16.
- README changelog: added round 6 paragraph.
- `docs/TESTING.md` and `docs/submission/devpost-draft.md`: 14 stores.
- Fixed the stale line that said one tracking number could only be added through the ledger API (now wired to the site and side panel).

### Day 2, 26 Nov 2026

Re-launched all three reviews on `68b5011`. All three finished.

### Round 7 security fixes (`e528bd3`)

Four holes closed:

1. **Link scanner**: last label can hold digits and hyphens (so `evi1.c0m`, `evil.c-om` and `ups-fee.co7` no longer slip past), with a "must contain at least one letter" guard so a price like `1.99` or a version like `2.0.1` is not a link.
2. **`reconcileClaim`**: drops cited numbers the model named but the email text does not mention (match on alphanumeric-only normalisation, so a number with spaces or hyphens still matches). A hallucinated tracking number can no longer produce a false Safe.
3. **Paste caps**: hero and sample-inbox paste boxes capped at 200 000 chars, same cap as the extension sanitizer.
4. **`isMostlyNonEnglish`**: script-ratio check runs on 8+ letters, not 20+, so short non-Latin lures are caught.

Regressions: `packages/core/src/round7.test.ts` (10).

### Round 7 docs refresh (`44584dd`)

Twenty stale claims fixed (all docs drift from rounds 5 and 6):

- Test counts 620 → **645** (core 413 / web 164 / extension 68), in five places: README front door, Quick Links, verify fold, commands box, Devpost draft.
- Coverage 96.02 / 91.26 → **95.78 / 91.13** (recomputed with `npx vitest run --coverage` in `packages/core`).
- Round 6 core test count 19 → **20**.
- **First-commit SHA fixed**: `d6b4d68` was orphan (force-pushed off main). Real first commit on main is **`72f7212`**, 16 Nov 2026 19:52:56 +0100, "Merge judge demo fixes (#1)". Earlier 12 Nov scaffold was squashed into this import. Both README and Devpost draft fixed.
- Three v7 SHAs (`16fc66e`, `b1f076d`, `8bb5936`) were unreachable from main; README now calls them out as squashed in. Claude's UI commits reachable from main: 13, not 16.
- `npm ci` and verify timings now cover warm AND cold cache (5-20 s for `npm ci`, 30-65 s for verify).
- "Node 24.22.1" (which doesn't exist) → Node 22.23.4.
- Dependency audit wording: "one CVE counted 4 times by `npm audit` because it affects 4 Firebase packages" instead of "one high advisory" (which read wrong next to `npm ci`'s raw "4 high vulnerabilities").
- Hero line "the check asks one question" → "the check asks whether the number matches, and whether anything else contradicts a Safe reading (payment request, outside link, unknown sender)".
- `/features/` line "Firebase AI Logic is asked **only** to structure" → "asked to structure... (A separate FAL call picks a next-step template id from a fixed list; see the FAQ)".
- H1 spacing on `/features/`, `/pricing/`, `/extension/`, `/privacy/`: single space before `<br />` so `innerText` reads correctly ("Written to look official. Read by code." not "Written to look official.Read by code.").
- Code comment in `web/src/packs/official.ts`: `target.com` and `bestbuy.com` removed; round 6 removal noted.
- Devpost draft preamble: now against `68b5011`, last code change `bfe5e25`.

### Lighthouse re-run (`8dc59d3`)

Ran Lighthouse 13.6.0 (mobile preset) on all 10 routes against the live site on `44584dd`. Results:

- 9 indexed routes: **100 on Accessibility, Best Practices, SEO**.
- Performance: home **96**, every other indexed route **99 or 100**.
- `/extension-demo/` is noindex by design, so its SEO drops to 63. Not counted among the 9 indexed routes.
- Per-route JSON reports in `docs/proof/lh-26nov/`.

README front door and the proof section both updated.

### Reviews on file

All raw reports are in `docs/reviews/judges/`:

- `2026-11-23-r6-2-security.md` — the round 6 strict security audit (5 holes found and fixed).
- `2026-11-26-r7-1-cold-judge.md` — "Best Web/Chrome HOLDS." Scores 9 / 8 / 7 / 8 (tech, design, impact, idea). Tried hard to land a scam on Safe, couldn't.
- `2026-11-26-r7-2-security.md` — 4 holes found and fixed. All test paths pass.
- `2026-11-26-r7-3-claims.md` — ~130 claims checked, 20 stale (all fixed), ~110 accurate.

Each review file ends with a "Triage" note saying what was fixed and where.

## State of the project right now

- Head of main: **`8dc59d3`**.
- Tests: **413 core + 164 web + 68 extension = 645**, all pass.
- Core coverage: **95.78% statements / 91.13% branches** (gate 95 / 85).
- `npm run verify --offline`: 13 passed, 0 failed, 1 skipped.
- Lighthouse: 9 indexed routes at 100 a11y/bp/seo; home perf 96, every other 99-100.
- **No Safe-for-scam path.** Security audit and cold judge both confirmed.
- Nothing leaves the device before a real consent yes.
- No secrets in tracked files or 95-commit history; no App Check debug token in bundles; secrets scan passes.
- Vetted store list: 14 (DMARC p=reject, no third-party relay).
- Official carrier list: 9 (DMARC p=reject).
- Live site is on `8dc59d3`; `/build-info.json` reports it.

## Roadmap, from now to submit

Order roughly by when each step blocks the others.

### Only Oh-Jay can do these

1. **Film the demo.**
    - Under 2:30.
    - His own voice, on camera or voice.
    - Product on screen within 10 seconds.
    - No carrier logos (no DHL, UPS, Royal Mail brand imagery).
    - Public YouTube, English or English captions.
    - When he says "film time", Claude writes the script (the first 30 seconds has to show the DHL Warning → Load matching shipment → UPS Safe flow, because judges may only watch that).
2. **Upload the film to YouTube**. Keep the link.
3. **Send Claude the film URL** to replace `FILM_URL` in the README (Quick Links row) and in `docs/submission/devpost-draft.md`.
4. **iPhone Safari screen recording** (Claude already gave him the exact steps):
    - Open Safari, `did-i-order-this.vercel.app/app/`.
    - First thread → Check → Do not send → Warning.
    - Load matching shipment demo → UPS → Check → Safe.
    - Screen-record both; send the clip. Claude files it as proof in `docs/proof/`.
5. **Trigger a nano-film workflow run** on the extension Safe path on `ohjay-official/nano-film`. Closes the "extension Safe path is unit-tested only" admitted gap. Only he has access.
6. **Testers 26-28 Nov**. If anyone tests on their own Gmail, a two-line note in `docs/proof/testers.md` with the date, browser, and what they saw is the whole record.
7. **Open questions from the Grok handover** still open:
    - Set up 2FA on the GitHub account used to submit, if not already.
    - Firebase billing check: confirm the project is on Spark (no bill at the end of the month).
    - MIT vs Apache-2.0: current license is Apache-2.0. Oh-Jay to confirm he's happy with that, or switch.
    - Media rights: confirm all images on the live site and in the repo are his own, generated, or properly licensed.
8. **Submit on Devpost** by Mon 30 Nov 20:00 Africa/Lagos. Follow `docs/submission/devpost-draft.md` field by field.
9. **Keep the site up through judging**, 10-16 Dec.

### Grok (or Claude) handles these

A. **When Oh-Jay says "film time":** write a 2:30 script and a 60-second cut. Use the Try It flow as the backbone. End with the on-device label.

B. **When Oh-Jay sends the film URL:**
    - Replace `FILM_URL` in `docs/submission/devpost-draft.md` (two places: the submission field and the description).
    - Replace the `TBD-post-build: film URL ...` line in the README Quick Links row.
    - Ship under a `docs(film)` commit.

C. **When Oh-Jay sends the iPhone screen recording:**
    - Save the clip in `docs/proof/ios-safari-26nov.mp4` (or whatever date).
    - Add a two-line note in README "Proof It's Real" with the production sha and what it showed.
    - Ship under `proof(ios)`.

D. **When Oh-Jay triggers the nano-film extension Safe run:**
    - Grab the run URL.
    - Save `result.json` and frames in `docs/proof/`.
    - Add the run to README "Proof It's Real".
    - Ship under `proof(ext)`.

E. **Remaining README polish** (nice to have, not blocking):
    - Add a small "Safe is narrow by design" callout at the top (cold judge #7). One paragraph: Safe needs verified sender + stored match + no risky ask + no outside link + model label "none"; everything else caps at Neutral or Warning. Turns the paste box's "can't go Safe" into a feature a judge sees before trying to break it.
    - Shorten the "Proof It's Real" fold (cold judge #10). Keep the top five runs + Lighthouse open; move earlier runs and the build log into `docs/proof/README.md`.

F. **Final pre-submit gate (should be a separate chat session, around Mon 30 Nov 10:00 Africa/Lagos):**
    - `npm run verify -- --offline` must be 13 passed + 1 skipped.
    - `npm run verify` (not offline) must be 19 of 19, so the live-site routes, the zip and the headers are all there.
    - Live `/build-info.json` must be the head of main.
    - README has no `TBD-post-build:` lines.
    - Devpost draft has no `FILM_URL` left.
    - One more three-judges round: cold judge + strict security audit + line-by-line claims audit. Fix whatever they find. Do not re-run the security audit unless code changed. Do not re-run the claims audit unless public text changed. Do re-run the cold judge every time.
    - Clean build-and-ship-playbook final gate (see `anthropic-skills:build-and-ship-playbook`).

## Workflows and scripts

- **Three-judges reviews**: use the `anthropic-skills:three-judges` skill. Three fresh general-purpose subagents in parallel, each gets only `docs/reviews/judges/PROJECT.md` plus its verbatim prompt, strongest model. Save raw reports to `docs/reviews/judges/<YYYY-MM-DD>-r<N>-{1-cold-judge,2-security,3-claims}.md`. Triage with a short "Triage" section at the end of each file (confirmed / disputed / blocked here / accepted risk). Fix confirmed items, rerun, stop after 3 rounds even if not clean.
- **Build and ship**: the `/home/claude/tools/ship.sh` script commits and pushes; it aborts if `npm run verify --offline` fails. Standard commit message format at the top of the script.
- **Shell timing and limits**: the workspace proxy allowlists the npm registry and GitHub; curl to other hosts is blocked. Vercel deploys usually land in 1-2 minutes after push; poll `/build-info.json` to confirm.
- **Playwright and Chrome**: playwright-core at `/home/claude/tools/node_modules`; Chrome at `/usr/bin/google-chrome`. Pass `executablePath` and `--no-sandbox`. App Check rejects automated Chrome, so a cloud check from here will fall back to the prepared claim or fail. Mark those "unverified: blocked here", not "broken".
- **Lighthouse**: installed at `/home/claude/lh/node_modules/.bin/lighthouse`, currently 13.6.0.

## Reviewer environment reminders

- Gemini Nano is **not** available in this sandbox.
- App Check with reCAPTCHA Enterprise rejects automated Chrome, so sample threads fall back to the prepared claim. All reviews run against the live site mark that "unverified: blocked here", not "broken".
- `ohjay-official/nano-film` workflow runs are **evidence of on-device behaviour**. Reviewers don't trigger them.
- Vercel Analytics and Speed Insights load unconditionally but are same-origin, cookie-free, query-stripped, and disclosed on `/privacy/`. Already accepted in round 6.

## Do-not-break selectors

Film and e2e depend on these. Don't rename:

- `[data-action=check]`, `[data-thread="thread-1-carrier-lure"]`, `[data-action=consent-yes]`, `[data-action=consent-no]`, `[data-action=limited]`, `[data-action=save]`, `[data-action=reset]`, `[data-action=check-paste]`, `[data-action=load-shipment-demo]`, `[data-action=forget-cloud-consent]`, `[data-action=add-tracking]`
- `[data-track-form]`, `[data-track-input]`
- `.source-label`, `.outcome`, `.headline`, `.result h2`, `.app-ledger`, `[data-paste]`, `[data-try]`, `form[data-prompt]`
- Text: "prepared for this sample thread"
- Extension fixture: `h2.hP` plus `GM123456789012345`
- `e2e/on-device.mjs` itself: do not change

## File map

- `README.md` — the front door; updated through round 7 docs refresh.
- `docs/TESTING.md` — the full how-to-test (updated for 14 stores).
- `docs/submission/devpost-draft.md` — Devpost draft (refreshed 26 Nov; `FILM_URL` is the only placeholder).
- `docs/UI-NEXT.md` — UI-NEXT backlog; 15-35 marked done.
- `docs/HANDOFF-ui.md` — Grok's original UI handoff.
- `docs/HANDOVER-to-Claude-2026-11-23.md` — Grok's handover to Claude.
- `docs/HANDOVER-to-Grok-2026-11-26.md` — this file.
- `docs/reviews/judges/PROJECT.md` — the review card (updated for `68b5011`; refresh before the next round).
- `docs/reviews/judges/2026-11-23-r6-2-security.md`
- `docs/reviews/judges/2026-11-26-r7-{1-cold-judge,2-security,3-claims}.md`
- `docs/reviews.md` — review log (if maintained).
- `docs/proof/` — on-device run proofs and Lighthouse JSON (`docs/proof/lh-26nov/`).
- `packages/core/` — verdict logic, signals, reconcile, limited check, ingest, expected. Don't change behaviour here without a review driving it.
- `web/` — Vite multi-page site. Entry pages in `web/<route>/index.html`. UI in `web/src/ui/` and `web/src/site/`.
- `extension/` — Chrome MV3 extension. `src/background.ts`, `src/content.ts`, `src/sidepanel.ts`, `src/extract.ts`, `src/messages.ts`, `src/senderCheck.ts`, `src/round*.test.ts`.
- `web/src/packs/official.json` and `official.ts` — the carrier and vetted-store pack (14 stores after round 6).
- `scripts/verify.mjs` — the 19-check verify script.
- `e2e/on-device.mjs` — the nano-film test. Do not edit.
- `CLAUDE.md` (if present) — build rules Grok and Claude both follow.

## Loose notes for Grok

- The three-judges skill is at `anthropic-skills:three-judges`. Read it before running the final pre-submit round.
- Build-and-ship-playbook is at `anthropic-skills:build-and-ship-playbook`. That's the final gate.
- Readme-playbook: `anthropic-skills:readme-playbook`. Any README tweak should still match its Part 2 hackathon layer.
- Grok's own earlier handover (`docs/HANDOVER-to-Claude-2026-11-23.md`) is still the source of truth for pre-23 Nov history.
- When any of the review items in `docs/reviews/judges/*` says "Triage", those are the resolved items, not open ones.
- Oh-Jay's scheduled tasks skill isn't relevant here; the only schedule that matters is his own 30 Nov 20:00 Africa/Lagos submit.

— End of handover.
