// Home sample-box letter: one-shot text reveals (Web Animations API), ostra timings.
// Hidden starting states apply only under html.ed-anim, so no JS or reduced motion = visible text.
export function mountEd(root: ParentNode = document): void {
  const ed = root.querySelector<HTMLElement>("[data-ed]");
  if (!ed) return;
  const ok =
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    "IntersectionObserver" in window &&
    typeof Element.prototype.animate === "function";
  if (!ok) return;
  const html = document.documentElement;
  html.classList.add("ed-anim");
  try {
    const EASE = "cubic-bezier(.22,.8,.24,1)";
    const rise = (el: Element, delay = 0) => {
      (el as HTMLElement).style.opacity = "1";
      el.animate(
        [
          { opacity: 0, transform: "translateY(18px)", filter: "blur(6px)" },
          { opacity: 1, transform: "none", filter: "blur(0)" },
        ],
        { duration: 1000, delay, easing: EASE, fill: "backwards" },
      );
    };
    const run = (el: Element) => {
      if (el.matches(".ed-h")) {
        el.querySelectorAll<HTMLElement>(".ed-mask > span").forEach((s, i) => {
          s.style.transform = "none";
          s.animate([{ transform: "translateY(105%)" }, { transform: "none" }], {
            duration: 1100,
            delay: 120 + i * 110,
            easing: "cubic-bezier(.2,.75,.15,1)",
            fill: "backwards",
          });
        });
      } else if (el.matches("[data-sign]")) {
        (el as HTMLElement).style.clipPath = "inset(0 0 0 0)";
        el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
          duration: 1400,
          delay: 180,
          easing: "cubic-bezier(.6,.1,.3,1)",
          fill: "backwards",
        });
      } else if (el.matches(".ed-lead")) {
        rise(el, 420);
      } else if (el.matches(".ed-name")) {
        rise(el, 350);
      } else if (el.matches(".ed-btns")) {
        rise(el, 480);
      } else {
        rise(el);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          run(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    ed.querySelectorAll(".ed-h, [data-rise], [data-sign]").forEach((el) => io.observe(el));
    // cards: staggered once the rail enters
    const cards = [...ed.querySelectorAll<HTMLElement>(".ed-card")];
    cards.forEach((c) => (c.style.opacity = "0"));
    const cio = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        cio.disconnect();
        cards.forEach((c, i) => {
          c.style.opacity = "1";
          c.animate(
            [
              { opacity: 0, transform: "translateY(18px)", filter: "blur(6px)" },
              { opacity: 1, transform: "none", filter: "blur(0)" },
            ],
            { duration: 1000, delay: Math.min(i, 4) * 110, easing: EASE, fill: "backwards" },
          );
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    const rail = ed.querySelector(".ed-rail");
    if (rail) cio.observe(rail);
  } catch {
    html.classList.remove("ed-anim");
  }
}
