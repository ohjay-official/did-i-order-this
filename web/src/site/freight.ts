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
  const video = root.querySelector<HTMLVideoElement>("[data-freight-video]");
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
  let duration = 0;
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
    lettersW = letters.scrollWidth;
    B = (stripW + (1 - REST) * vw) / vw;
    root.style.height = `${((1 + Math.max(A, OVERLAP * A + B)) * vh).toFixed(0)}px`;
  };

  const useStill = () => root.classList.add("is-still");

  const load = () => {
    if (loaded) return;
    loaded = true;
    const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"') !== "";
    video.src = !h264 ? "/media/handling-720.webm" : vw <= 900 ? "/media/handling-720.mp4" : "/media/handling-1080.mp4";
    video.preload = "auto";
    video.muted = true;
    const timeout = window.setTimeout(() => {
      if (!duration) useStill();
    }, 10000);
    video.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timeout);
        duration = video.duration || 4.04;
        root.classList.remove("is-still");
        schedule();
      },
      { once: true },
    );
    video.addEventListener("error", useStill, { once: true });
    video.addEventListener("seeked", () => {
      if (Math.abs(video.currentTime - cur) > 1 / 60) schedule();
    });
    video.load();
  };

  const tick = () => {
    raf = 0;
    const y = -root.getBoundingClientRect().top;
    const q = clamp(y / (A * vh));
    const r = clamp((y - OVERLAP * A * vh) / (B * vh));
    root.style.setProperty("--ph", clamp((q - 0.82) / 0.14).toFixed(3));
    strip.style.transform = `translate3d(${(vw - r * (stripW + (1 - REST) * vw)).toFixed(1)}px,0,0)`;
    letters.style.transform = `translate3d(${(vw - r * (lettersW + vw)).toFixed(1)}px,0,0)`;
    for (const card of cards) {
      const left = card.getBoundingClientRect().left;
      const s = clamp((0.98 - left / vw) / 0.14, -0.4, 1.6) * 100;
      card.style.setProperty("--s", `${s.toFixed(1)}%`);
    }
    let moving = false;
    if (duration) {
      target = q * (duration - 1 / 48);
      cur += (target - cur) * 0.2;
      if (Math.abs(target - cur) > 0.0005) moving = true;
      else cur = target;
      if (!video.seeking && Math.abs(video.currentTime - cur) > 1 / 60) video.currentTime = cur;
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
