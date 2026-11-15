// Sticky handling-clip scene (KV scroll mapping): the clip is scrubbed, never played.
// A = 2.4 viewports for the clip, B = (strip width + 0.45 vw) / vw x 1.1 for the strip.
// Giant letters use mix-blend-mode: darken, so they show only where the clip is light
// and read as passing behind the truck. The strip slides in on the dark band.

const A = 2.4;
// The strip starts while the clip is still finishing, so there is no frozen stretch.
const OVERLAP = 0.9;
// The strip stops with its last card resting on screen, then the section releases.
const REST = 0.94;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mountFreight(root: HTMLElement): void {
  const scene = root.querySelector<HTMLElement>("[data-freight-scene]");
  const video = root.querySelector<HTMLCanvasElement>("[data-freight-video]");
  const still = root.querySelector<HTMLImageElement>("[data-freight-still]");
  const strip = root.querySelector<HTMLElement>("[data-freight-strip]");
  const letters = root.querySelector<HTMLElement>("[data-freight-letters]");
  if (!scene || !video || !still || !strip || !letters) return;
  const cards = Array.from(strip.querySelectorAll<HTMLElement>(".fc"));
  const reduced = prefersReducedMotion();

  let vw = 0;
  let vh = 0;
  let B = 1;
  let stripW = 0;
  let lettersW = 0;
  const FRAMES = 97;
  const images: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
  let ready = false;
  let drawn = -1;
  let cardOffsets: number[] = [];
  const ctx2d = video.getContext("2d");
  let cur = 0;
  let target = 0;
  let raf = 0;
  let inView = false;
  let loaded = false;

  // Frame the clip: cover on wide screens; on portrait/narrow screens 155vw wide,
  // 40% of the frame at mid-screen, final band edge (44.8%) at 36% of the viewport.
  const frame = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const narrow = vw < 768 || vw <= vh;
    let w: number;
    let h: number;
    let left: number;
    let top: number;
    if (narrow) {
      w = vw * 1.55;
      h = (w * 9) / 16;
      left = vw / 2 - 0.4 * w;
      top = 0.36 * vh - 0.448 * h;
    } else {
      const s = Math.max(vw / 1920, vh / 1080);
      w = 1920 * s;
      h = 1080 * s;
      left = (vw - w) / 2;
      top = (vh - h) / 2;
    }
    for (const el of [video, still]) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }
    const edge = top + 0.448 * h;
    scene.style.setProperty("--edge-px", `${edge.toFixed(1)}px`);
    scene.style.setProperty("--line-px", `${(top + 0.9 * h).toFixed(1)}px`);
    root.classList.toggle("is-narrow", narrow);

    if (reduced) {
      root.style.height = "";
      return;
    }
    stripW = strip.scrollWidth;
    const prev = strip.style.transform;
    strip.style.transform = "none";
    const base = strip.getBoundingClientRect().left;
    cardOffsets = cards.map((c) => c.getBoundingClientRect().left - base);
    strip.style.transform = prev;
    lettersW = letters.scrollWidth;
    B = (stripW + (1 - REST) * vw) / vw;
    root.style.height = `${((1 + Math.max(A, OVERLAP * A + B)) * vh).toFixed(0)}px`;
  };

  const useStill = () => root.classList.add("is-still");

  // The clip is drawn from a WebP frame sequence onto a canvas. Seeking a <video> on
  // every scroll frame stalls on many phones and laptops; drawing a decoded image does not.
  const load = () => {
    if (loaded || !ctx2d) {
      if (!ctx2d) useStill();
      return;
    }
    loaded = true;
    const dir = vw <= 900 ? "/media/freight-960/" : "/media/freight-1280/";
    let failed = 0;
    const fetchFrame = (i: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.src = `${dir}f${String(i + 1).padStart(3, "0")}.webp`;
        img
          .decode()
          .then(() => {
            images[i] = img;
            if (!ready) {
              ready = true;
              video.width = img.naturalWidth;
              video.height = img.naturalHeight;
              root.classList.remove("is-still");
            }
            schedule();
          })
          .catch(() => {
            failed += 1;
            if (failed > 8 && !ready) useStill();
          })
          .finally(resolve);
      });
    // First and last frames first, then every 8th, then the rest, six at a time.
    const order: number[] = [0, FRAMES - 1];
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!order.includes(i)) order.push(i);
    let next = 0;
    const worker = async () => {
      while (next < order.length) await fetchFrame(order[next++]);
    };
    for (let k = 0; k < 6; k++) void worker();
  };

  const nearest = (i: number): HTMLImageElement | null => {
    for (let d = 0; d < FRAMES; d++) {
      const a = images[i - d];
      if (a) return a;
      const b = images[i + d];
      if (b) return b;
    }
    return null;
  };

  const tick = () => {
    raf = 0;
    const y = -root.getBoundingClientRect().top;
    const q = clamp(y / (A * vh));
    const r = clamp((y - OVERLAP * A * vh) / (B * vh));
    root.style.setProperty("--ph", clamp((q - 0.82) / 0.14).toFixed(3));
    strip.style.transform = `translate3d(${(vw - r * (stripW + (1 - REST) * vw)).toFixed(1)}px,0,0)`;
    letters.style.transform = `translate3d(${(vw - r * (lettersW + vw)).toFixed(1)}px,0,0)`;
    const stripX = vw - r * (stripW + (1 - REST) * vw);
    cards.forEach((card, i) => {
      const left = stripX + (cardOffsets[i] ?? 0);
      const s = clamp((0.98 - left / vw) / 0.14, -0.4, 1.6) * 100;
      card.style.setProperty("--s", `${s.toFixed(1)}%`);
    });
    let moving = false;
    if (ready && ctx2d) {
      target = q * (FRAMES - 1);
      cur += (target - cur) * 0.35;
      if (Math.abs(target - cur) > 0.02) moving = true;
      else cur = target;
      const i = Math.round(cur);
      const img = images[i] ?? nearest(i);
      if (img && (i !== drawn || !images[i])) {
        ctx2d.drawImage(img, 0, 0, video.width, video.height);
        if (images[i]) drawn = i;
      }
    }
    if (moving && inView) schedule();
  };

  function schedule(): void {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  frame();
  if (reduced) {
    root.classList.add("is-static", "is-still");
    window.addEventListener("resize", frame);
    return;
  }
  root.classList.add("is-scroll");

  new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    },
    { rootMargin: "900px 0px" },
  ).observe(root);
  new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    if (inView) schedule();
  }).observe(root);

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    frame();
    schedule();
  });
  document.fonts?.ready.then(() => {
    frame();
    schedule();
  });
  schedule();
}
