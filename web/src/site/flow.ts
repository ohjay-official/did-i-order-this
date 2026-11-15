import { mountFreight } from "./freight.ts";
import { mountGlobe } from "./globe.ts";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Auto-sliding row of sample cases. The list is duplicated once for a seamless loop;
// the copy is hidden from assistive tech and from keyboard focus.
function mountSlider(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>("[data-slider-track]");
  if (!track) return;
  if (prefersReducedMotion()) {
    root.classList.add("is-static");
    return;
  }
  const items = Array.from(track.children);
  for (const item of items) {
    const copy = item.cloneNode(true) as HTMLElement;
    copy.setAttribute("aria-hidden", "true");
    for (const link of copy.querySelectorAll("a, button")) link.setAttribute("tabindex", "-1");
    track.appendChild(copy);
  }
  root.classList.add("is-auto");
  const io = new IntersectionObserver((entries) => {
    root.classList.toggle("is-paused", !entries.some((entry) => entry.isIntersecting));
  });
  io.observe(root);
}

export function mountFlow(doc: Document): void {
  const globe = doc.querySelector<HTMLElement>("[data-globe]");
  if (globe) mountGlobe(globe);
  const slider = doc.querySelector<HTMLElement>("[data-slider]");
  if (slider) mountSlider(slider);
  const freight = doc.querySelector<HTMLElement>("[data-freight]");
  if (freight) mountFreight(freight);
}
