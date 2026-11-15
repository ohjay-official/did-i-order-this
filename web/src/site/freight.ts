// Scroll-driven sticky freight scene: clip scrubs with scroll, giant letters knock out
// the clip, a warm sweep crosses the band, then the strip of sample-inbox steps slides in.

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function mountFreight(root: HTMLElement): void {
  const video = root.querySelector<HTMLVideoElement>("[data-freight-video]");
  const strip = root.querySelector<HTMLElement>("[data-freight-strip]");
  const track = root.querySelector<HTMLElement>("[data-freight-track]");
  if (!video || !strip || !track) return;

  if (prefersReducedMotion()) {
    root.classList.add("is-static");
    return;
  }
  root.classList.add("is-scroll");

  let duration = 0;
  let ready = false;
  let loaded = false;
  let raf = 0;
  let targetTime = 0;

  const fallBack = () => {
    root.classList.add("is-poster");
  };

  const load = () => {
    if (loaded) return;
    loaded = true;
    const narrow = window.matchMedia("(max-width: 899px)").matches;
    const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"') !== "";
    video.src = !h264 ? "/media/freight-720.webm" : narrow ? "/media/freight-720.mp4" : "/media/freight-1080.mp4";
    video.muted = true;
    video.preload = "auto";
    const timeout = window.setTimeout(() => {
      if (!ready) fallBack();
    }, 8000);
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timeout);
        duration = video.duration || 8;
        ready = true;
        root.classList.add("is-video");
        // iOS paints seeks only after one play call.
        const played = video.play();
        if (played) played.then(() => video.pause()).catch(() => undefined);
        schedule();
      },
      { once: true },
    );
    video.addEventListener("error", fallBack, { once: true });
    video.load();
  };

  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load();
        near.disconnect();
      }
    },
    { rootMargin: "800px 0px" },
  );
  near.observe(root);

  const update = () => {
    raf = 0;
    const rect = root.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const p = total > 0 ? clamp(-rect.top / total) : 0;
    root.style.setProperty("--p", p.toFixed(4));
    root.style.setProperty("--knock", (1 - ease(range(p, 0.18, 0.42))).toFixed(4));
    root.style.setProperty("--letters", ease(range(p, 0, 0.3)).toFixed(4));
    root.style.setProperty("--sweep", range(p, 0.38, 0.6).toFixed(4));
    root.style.setProperty("--strip", ease(range(p, 0.48, 0.66)).toFixed(4));

    const overflow = Math.max(0, track.scrollWidth - strip.clientWidth);
    const slide = ease(range(p, 0.66, 0.96));
    track.style.transform = `translate3d(${(-overflow * slide).toFixed(1)}px,0,0)`;

    if (ready && duration) {
      targetTime = clamp(p / 0.9) * (duration - 0.05);
      if (!video.seeking && Math.abs(video.currentTime - targetTime) > 1 / 30) {
        video.currentTime = targetTime;
      }
    }
  };

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  video.addEventListener("seeked", () => {
    if (Math.abs(video.currentTime - targetTime) > 1 / 30) schedule();
  });

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();
}
