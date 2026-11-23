// Features hero: the five sample emails drift left across a scanner line.
// Right of the line each card is the email; at the line it breaks into ember pixels;
// left of the line the same area shows the structured claim the model is allowed to produce.
// The badge reads the claim fields as a card crosses, then shows the verdict that the
// real core code (decideVerdict) returns for that claim with the default sample ledger.
import { decideVerdict, type EmailClaim, type Outcome } from "@did-i-order-this/core";
import { demoSeed, sampleThreads, type SampleThread } from "../demo/seed.ts";
import { getOfficialPack } from "../packs/official.ts";

const PALETTE = ["#ff4a12", "#ff5a1f", "#ff6b2c", "#ff8a3d", "#ffb06a", "#ffd9b5", "#fff3e6"];
const OUTCOME_WORD: Record<Outcome, string> = { safe: "Safe", warning: "Warning", neutral: "Neutral" };
const CTA: Record<string, string> = {
  "thread-1-carrier-lure": "Pay $2.99 now",
  "thread-2-shipment-notice": "View order",
  "thread-3-safe-carrier": "Track package",
  "thread-4-neutral-renewal": "Pay invoice",
  "thread-5-wrong-tracking": "Pay duty fee",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function claimLines(claim: EmailClaim): string {
  return JSON.stringify(claim, null, 2);
}

function cardHtml(t: SampleThread, i: number): string {
  const lines = t.body.split("\n").filter((l) => l.trim() && !/^(dear|hello)/i.test(l)).slice(0, 3);
  return `<article class="bc bc--${i + 1}" aria-hidden="true">
    <div class="bc-bar"><span class="bc-from">${esc(t.fromName)}</span><span class="bc-domain">${esc(t.fromEmail)}</span></div>
    <p class="bc-date">${esc(t.date)}</p>
    <h3 class="bc-subject">${esc(t.subject)}</h3>
    <div class="bc-body">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
    <span class="bc-cta">${esc(CTA[t.id] ?? "Open")}</span>
  </article>`;
}

export function mountBelt(root: ParentNode = document): void {
  const hero = root.querySelector<HTMLElement>("[data-belt]");
  if (!hero) return;
  const belt = hero.querySelector<HTMLElement>(".belt")!;
  const cardsEl = hero.querySelector<HTMLElement>(".belt-cards")!;
  const codesEl = hero.querySelector<HTMLElement>(".belt-codes")!;
  const canvas = hero.querySelector<HTMLCanvasElement>(".belt-fx")!;
  const badgeNum = hero.querySelector<HTMLElement>("[data-badge-num]")!;
  const badgeOut = hero.querySelector<HTMLElement>("[data-badge-out]")!;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const pack = getOfficialPack();
  const ledger = demoSeed();
  const threads = sampleThreads;
  // Built-in samples: the app sets their sender, so it counts as verified.
  const outcomes = threads.map((t) => decideVerdict(t.expectedClaim, ledger, pack, "on_device", { senderCheck: "verified" }));

  cardsEl.innerHTML = threads.map(cardHtml).join("");
  codesEl.innerHTML = threads
    .map(
      (t, i) => `<div class="bcode" aria-hidden="true"><pre class="bcode-json">${esc(claimLines(t.expectedClaim))}</pre><pre class="bcode-meta">// prepared claim, sample thread ${i + 1}
// from: ${esc(t.fromDomain)}
// outcome from code: ${outcomes[i].outcome}
// ${esc(outcomes[i].headline)}</pre></div>`,
    )
    .join("");
  const cards = [...cardsEl.children] as HTMLElement[];
  const codes = [...codesEl.children] as HTMLElement[];
  const n = cards.length;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0;
  let cw = 0;
  let ch = 0;
  let gap = 0;
  let Lx = 0;
  let span = 0;
  let period = 0;
  let dpr = 1;
  let off = 0;
  let vel = 0;
  let hover = 0;
  let hoverTarget = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let dragVel = 0;
  let shownFields = 0;
  let current = -1;
  let inView = true;
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }[] = [];

  const measure = () => {
    W = belt.clientWidth;
    const r = cards[0].getBoundingClientRect();
    cw = r.width;
    ch = r.height;
    gap = parseFloat(getComputedStyle(hero).getPropertyValue("--gap-px")) || W * 0.0475;
    Lx = W / 2;
    span = cw + gap;
    period = span * n;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(belt.clientHeight * dpr);
  };
  measure();
  off = W / 2 - 0.62 * cw;

  const mod = (a: number, m: number) => ((a % m) + m) % m;
  const autoSpeed = () => (reduced ? 0 : -0.06 * window.innerWidth);
  const TOP = 70;

  const drawFx = (x: number, i: number, t: number, cut: number) => {
    const right = x + cw;
    if (right <= Lx) return;
    const hw = Math.min(150, right - Lx);
    const g = ctx.createLinearGradient(Lx, 0, Lx + 150, 0);
    g.addColorStop(0, "rgba(255,96,40,.42)");
    g.addColorStop(1, "rgba(255,96,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Lx, TOP, hw, ch);
    const R = 0.3 * cw;
    const rows = Math.floor(ch / 3);
    const startCol = Math.floor(cut / 3);
    const endCol = Math.min(Math.ceil((cut + R) / 3), Math.floor(cw / 3));
    const tw = reduced ? 0 : Math.floor(t * 9);
    for (let gx = startCol; gx <= endCol; gx++) {
      const sx = x + gx * 3;
      const d = sx - Lx;
      if (d < 0) continue;
      const p = Math.pow(Math.max(0, 1 - d / R), 1.7);
      if (p <= 0) continue;
      for (let row = -5; row < rows + 5; row++) {
        const inside = row >= 0 && row < rows;
        const fade = inside ? 1 : 1 - Math.min(5, row < 0 ? -row : row - rows + 1) / 5;
        const thresh = inside ? p * 0.92 : p * 0.16 * fade;
        if (hash(gx, row, i) >= thresh) continue;
        if (!reduced && hash(gx, row, tw + 97) < 0.22) continue;
        const h2 = hash(row, gx, i + 31);
        const idx = d < 10 ? 4 + Math.floor(h2 * 3) : Math.floor(h2 * h2 * 7);
        ctx.fillStyle = PALETTE[Math.min(6, idx)];
        const size = 1.1 + h2 * 1.7;
        const jx = reduced ? 0 : (hash(gx, row, 7) - 0.5) * 1.6;
        const jy = reduced ? 0 : (hash(row, gx, 9) - 0.5) * 1.6;
        ctx.fillRect(sx + jx, TOP + row * 3 + jy, size, size);
      }
    }
  };

  const setBadge = (i: number, progress: number, snap: boolean) => {
    const target = Math.round(5 * Math.min(1, progress / 0.6));
    if (snap) shownFields = target;
    else shownFields += (target - shownFields) * 0.25;
    const f = Math.round(shownFields);
    badgeNum.textContent = `${f} of 5 fields`;
    const done = f >= 5;
    const o = outcomes[i].outcome;
    badgeOut.textContent = done ? OUTCOME_WORD[o] : "reading";
    hero.dataset.outcome = done ? o : "reading";
  };

  let prev = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = now / 1000;
    hover += (hoverTarget - hover) * Math.min(1, dt * 4);
    if (!dragging) {
      const target = autoSpeed() * (1 - 0.65 * hover);
      vel += (target - vel) * (1 - Math.exp(-2.2 * dt));
      off += vel * dt;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, belt.clientHeight);
    let crossing = -1;
    let crossProgress = 0;
    for (let i = 0; i < n; i++) {
      const x = mod(off + i * span + span, period) - span;
      const cut = Math.max(0, Math.min(cw, Lx - x));
      const card = cards[i];
      const code = codes[i];
      card.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
      code.style.transform = card.style.transform;
      if (cut > 0) {
        card.style.clipPath = `inset(0 0 0 ${cut.toFixed(1)}px)`;
        const m = `linear-gradient(90deg, transparent ${cut.toFixed(1)}px, #000 ${(cut + 26).toFixed(1)}px)`;
        card.style.setProperty("-webkit-mask-image", m);
        card.style.maskImage = m;
        code.style.visibility = "visible";
        code.style.clipPath = `inset(0 ${(cw - cut).toFixed(1)}px 0 0)`;
        drawFx(x, i, t, cut);
      } else {
        card.style.clipPath = "";
        card.style.maskImage = "";
        card.style.removeProperty("-webkit-mask-image");
        code.style.visibility = "hidden";
      }
      if (cut > 0 && cut < cw && crossing === -1) {
        crossing = i;
        crossProgress = cut / cw;
      }
    }
    if (crossing !== -1) {
      setBadge(crossing, crossProgress, crossing !== current);
      current = crossing;
    }
    if (!reduced) {
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.7 && sparks.length < 160) {
          sparks.push({
            x: Lx + Math.random() * 30,
            y: TOP - 10 + Math.random() * (ch + 20),
            vx: -30 + Math.random() * 70 + vel * 0.6,
            vy: (Math.random() - 0.5) * 50,
            life: 0.3 + Math.random() * 0.8,
            size: 0.8 + Math.random() * 1.8,
            color: PALETTE[Math.floor(Math.random() * 7)],
          });
        }
      }
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(k, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = Math.min(1, s.life * 2.2);
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1;
    }
    if (inView) requestAnimationFrame(frame);
  };

  belt.addEventListener("pointerenter", () => (hoverTarget = 1));
  belt.addEventListener("pointerleave", () => (hoverTarget = 0));
  belt.addEventListener("pointerdown", (e) => {
    dragging = true;
    belt.setPointerCapture(e.pointerId);
    belt.classList.add("is-dragging");
    lastX = e.clientX;
    lastT = performance.now();
    dragVel = 0;
  });
  belt.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    off += dx;
    dragVel = (dx / Math.max(8, now - lastT)) * 1000 * 0.8 + dragVel * 0.2;
    lastX = e.clientX;
    lastT = now;
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    belt.classList.remove("is-dragging");
    vel = dragVel;
  };
  belt.addEventListener("pointerup", release);
  belt.addEventListener("pointercancel", release);
  belt.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        vel += -e.deltaX * 6;
        e.preventDefault();
      }
    },
    { passive: false },
  );
  window.addEventListener("resize", measure);
  new IntersectionObserver((entries) => {
    const was = inView;
    inView = entries.some((en) => en.isIntersecting);
    if (inView && !was) {
      prev = performance.now();
      requestAnimationFrame(frame);
    }
  }).observe(hero);
  document.fonts?.ready.then(measure);
  requestAnimationFrame(frame);
}
