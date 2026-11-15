import { mountFreight } from "./freight.ts";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Work-row slider (ostra spec): every 2.4s the track slides left by one card over
// 900ms, then the first card moves to the end and the transform resets.
function mountSlider(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>("[data-slider-track]");
  if (!track) return;
  if (prefersReducedMotion() || typeof track.animate !== "function") {
    root.classList.add("is-static");
    return;
  }
  root.classList.add("is-auto");
  let running = false;
  let visible = false;
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  });
  io.observe(root);
  window.setInterval(() => {
    if (running || document.hidden || !visible || root.matches(":focus-within")) return;
    const first = track.firstElementChild as HTMLElement | null;
    if (!first) return;
    running = true;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = first.getBoundingClientRect().width + gap;
    const anim = track.animate(
      [{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-distance}px,0,0)` }],
      { duration: 900, easing: "cubic-bezier(.65,0,.35,1)" },
    );
    anim.onfinish = () => {
      track.appendChild(first);
      track.style.transform = "";
      running = false;
    };
  }, 2400);
}

export function mountFlow(doc: Document): void {
  const globe = doc.querySelector<HTMLElement>("[data-globe]");
  if (globe) {
    // three.js is only fetched when the globe gets close to the viewport.
    const load = () => void import("./globe.ts").then((m) => m.mountGlobe(globe));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            load();
          }
        },
        { rootMargin: "900px 0px" },
      );
      io.observe(globe);
    } else {
      load();
    }
  }
  const slider = doc.querySelector<HTMLElement>("[data-slider]");
  if (slider) mountSlider(slider);
  const freight = doc.querySelector<HTMLElement>("[data-freight]");
  if (freight) mountFreight(freight);
}
