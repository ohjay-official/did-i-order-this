// How it works: three rigid cards, gauge ticks, one-shot entrance.
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountHiw(root: ParentNode = document): void {
  const stage = root.querySelector<HTMLElement>("[data-hiw]");
  if (!stage) return;

  const ticks = stage.querySelector<SVGGElement>("[data-ticks]");
  if (ticks) {
    const ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i <= 22; i++) {
      const a = ((190 + i * 5) * Math.PI) / 180;
      const outer = 142;
      const inner = i % 5 === 0 ? 129 : 133;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", (163 + Math.cos(a) * inner).toFixed(2));
      line.setAttribute("y1", (163 + Math.sin(a) * inner).toFixed(2));
      line.setAttribute("x2", (163 + Math.cos(a) * outer).toFixed(2));
      line.setAttribute("y2", (163 + Math.sin(a) * outer).toFixed(2));
      line.setAttribute("class", "hc-tick");
      line.setAttribute("stroke-width", i % 5 === 0 ? "1.5" : "1");
      ticks.appendChild(line);
    }
  }

  if (reduced()) return;
  stage.classList.add("is-entering");
  const done = () => stage.classList.remove("is-entering");
  const failsafe = window.setTimeout(done, 3200);
  const last = stage.querySelector(".hc--stamp .hc-more");
  last?.addEventListener(
    "animationend",
    () => {
      window.clearTimeout(failsafe);
      done();
    },
    { once: true },
  );
}
