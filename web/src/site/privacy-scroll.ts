// Privacy hero: a scroll-scrubbed canvas. Scattered embers (the text of an email)
// gather into a laptop as you scroll: the email stays on this device.
// Motion is driven by scroll only, smoothed with a 0.12 lerp. Reduced motion draws the end state.
const COLORS = ["#ff5a1f", "#ff6b2c", "#ff8a3d", "#ffb06a", "#ffd9b5", "#f0b14a"];

interface P {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  size: number;
  color: string;
  phase: number;
}

export function mountPrivacyScroll(root: ParentNode = document): void {
  const wrap = root.querySelector<HTMLElement>("[data-priv]");
  if (!wrap) return;
  const canvas = wrap.querySelector<HTMLCanvasElement>(".priv-canvas")!;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let ps: P[] = [];
  let target = reduced ? 1 : 0;
  let smoothed = target;
  let raf = 0;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const build = () => {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const narrow = W < 768;
    const n = narrow ? 650 : 1400;
    const cx = narrow ? W * 0.5 : W * 0.7;
    const cy = narrow ? H * 0.5 : H * 0.48;
    const sw = narrow ? W * 0.74 : Math.min(W * 0.34, 560);
    const sh = sw * 0.62;
    const left = cx - sw / 2;
    const top = cy - sh / 2 - sh * 0.1;
    const targets: [number, number][] = [];
    const per = (len: number, total: number) => Math.round((len / total) * n);
    const outline = 2 * (sw + sh);
    const base = sw * 1.25;
    const totalLen = outline * 1.4 + base + sw * 2.2;
    // screen outline
    for (let i = 0; i < per(outline * 1.4, totalLen); i++) {
      const d = Math.random() * outline;
      let x: number;
      let y: number;
      if (d < sw) [x, y] = [left + d, top];
      else if (d < sw + sh) [x, y] = [left + sw, top + d - sw];
      else if (d < 2 * sw + sh) [x, y] = [left + sw - (d - sw - sh), top + sh];
      else [x, y] = [left, top + sh - (d - 2 * sw - sh)];
      targets.push([x + rand(-1.5, 1.5), y + rand(-1.5, 1.5)]);
    }
    // base
    for (let i = 0; i < per(base, totalLen); i++) {
      const t = Math.random();
      const x = cx - base / 2 + t * base;
      const y = top + sh + sh * 0.1 + rand(-2, 2);
      targets.push([x, y]);
    }
    // text rows inside the screen: the email, now local
    while (targets.length < n) {
      const row = Math.floor(Math.random() * 6);
      const lineW = sw * (row === 0 ? 0.5 : row === 5 ? 0.38 : rand(0.62, 0.8));
      const x = left + sw * 0.1 + Math.random() * lineW;
      const y = top + sh * 0.2 + row * sh * 0.12 + rand(-1.5, 1.5);
      targets.push([x, y]);
    }
    ps = targets.map(([tx, ty]) => ({
      sx: rand(-0.05 * W, 1.05 * W),
      sy: rand(-0.05 * H, 1.05 * H),
      tx,
      ty,
      size: rand(1, 2.6),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  const draw = (time: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      const local = Math.min(1, Math.max(0, (smoothed - p.phase / 40) * 1.25));
      const e = ease(local);
      const drift = reduced ? 0 : (1 - e) * 6;
      const x = p.sx + (p.tx - p.sx) * e + Math.sin(time / 1400 + p.phase) * drift;
      const y = p.sy + (p.ty - p.sy) * e + Math.cos(time / 1700 + p.phase) * drift;
      ctx.globalAlpha = 0.35 + 0.55 * e;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  };

  const progress = () => {
    const r = wrap.getBoundingClientRect();
    const total = wrap.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
  };

  const tick = (time: number) => {
    raf = 0;
    target = reduced ? 1 : progress();
    smoothed += (target - smoothed) * 0.12;
    draw(time);
    const r = wrap.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight;
    if (visible && !reduced) raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  build();
  draw(0);
  window.addEventListener("scroll", start, { passive: true });
  window.addEventListener("resize", () => {
    build();
    start();
  });
  start();
}
