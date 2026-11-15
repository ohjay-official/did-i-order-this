// LED dot type: replaces [data-dots] with an SVG of filled circles from 7-row bitmap glyphs.
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderDots(el: HTMLElement): void {
  const text = el.dataset.dots ?? "";
  const word = el.classList.contains("dot-word");
  const pitchX = word ? 4 : 5;
  const pitchY = 4;
  const r = word ? 1.8 : el.closest("[data-dot-r]") ? Number((el.closest("[data-dot-r]") as HTMLElement).dataset.dotR) : 1.7;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "dot-svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  let x = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      x += pitchX * 3;
      continue;
    }
    glyph.forEach((row, y) => {
      [...row].forEach((bit, col) => {
        if (bit !== "1") return;
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", String(x + col * pitchX + 1.55));
        c.setAttribute("cy", String(y * pitchY + 1.55));
        c.setAttribute("r", String(r));
        svg.appendChild(c);
      });
    });
    x += glyph[0].length * pitchX + pitchX;
  }
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, x - pitchX + 3)} 28`);
  svg.setAttribute("fill", "currentColor");
  el.replaceChildren(svg);
}

export function mountDots(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-dots]").forEach(renderDots);
}
