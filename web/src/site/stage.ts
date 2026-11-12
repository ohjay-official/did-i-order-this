type FieldBlob = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  weight: number;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function makeBlobs(): FieldBlob[] {
  return [
    { cx: 0.5, cy: 0.88, rx: 0.8, ry: 0.34, weight: 1, phase: 0.2, speed: 0.13, driftX: 0.025, driftY: 0.014 },
    { cx: 0.14, cy: 0.86, rx: 0.5, ry: 0.28, weight: 0.95, phase: 1.4, speed: 0.15, driftX: 0.03, driftY: 0.016 },
    { cx: 0.88, cy: 0.85, rx: 0.52, ry: 0.3, weight: 0.95, phase: 2.2, speed: 0.12, driftX: 0.028, driftY: 0.016 },
    { cx: 0.32, cy: 0.73, rx: 0.34, ry: 0.22, weight: 0.7, phase: 3.3, speed: 0.16, driftX: 0.022, driftY: 0.016 },
    { cx: 0.7, cy: 0.75, rx: 0.36, ry: 0.2, weight: 1, phase: 4.1, speed: 0.14, driftX: 0.024, driftY: 0.016 },
    { cx: 0.5, cy: 1.02, rx: 0.98, ry: 0.28, weight: 1, phase: 0.8, speed: 0.1, driftX: 0.016, driftY: 0.008 },
  ];
}

// Warm ramp: deep red -> coral -> amber -> pale gold. No purple or magenta.
function colorize(t: number): [number, number, number] {
  const stops: Array<[number, number, number, number]> = [
    [0, 248, 214, 150],
    [0.22, 240, 168, 80],
    [0.48, 232, 110, 58],
    [0.72, 214, 80, 40],
    [1, 176, 52, 24],
  ];
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x >= a[0] && x <= b[0]) {
      const u = (x - a[0]) / (b[0] - a[0] || 1);
      return [
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u),
        Math.round(a[3] + (b[3] - a[3]) * u),
      ];
    }
  }
  return [246, 206, 130];
}

export function mountStage(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
  if (!ctx) return () => {};

  const blobs = makeBlobs();
  const off = document.createElement("canvas");
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return () => {};

  let frame = 0;
  let running = true;
  let last = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const paint = (time: number) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const t = prefersReducedMotion() ? 0 : time / 1000;
    const scale = 0.5;
    const ow = Math.max(1, Math.floor(width * scale));
    const oh = Math.max(1, Math.floor(height * scale));
    if (off.width !== ow || off.height !== oh) {
      off.width = ow;
      off.height = oh;
    }

    octx.clearRect(0, 0, ow, oh);
    octx.globalCompositeOperation = "lighter";
    for (const blob of blobs) {
      const x = (blob.cx + Math.sin(t * blob.speed + blob.phase) * blob.driftX) * ow;
      const y = (blob.cy + Math.cos(t * blob.speed * 0.85 + blob.phase) * blob.driftY) * oh;
      const rx = blob.rx * ow * (0.96 + 0.04 * Math.sin(t * blob.speed + blob.phase));
      const ry = blob.ry * oh * (0.96 + 0.04 * Math.cos(t * blob.speed * 1.05 + blob.phase));
      const gradient = octx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      const peak = Math.round(210 * blob.weight);
      gradient.addColorStop(0, `rgba(${peak}, ${peak}, ${peak}, 1)`);
      gradient.addColorStop(0.45, `rgba(${Math.round(peak * 0.55)}, ${Math.round(peak * 0.55)}, ${Math.round(peak * 0.55)}, 1)`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      octx.fillStyle = gradient;
      octx.beginPath();
      octx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      octx.fill();
    }
    octx.globalCompositeOperation = "source-over";

    const img = octx.getImageData(0, 0, ow, oh);
    const data = img.data;
    const threshold = 58;
    const feather = 26;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      if (v < threshold) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
        continue;
      }
      const tone = Math.min(1, (v - threshold) / (255 - threshold));
      const [r, g, b] = colorize(tone);
      const alpha = Math.min(255, Math.round(((v - threshold) / feather) * 255));
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = alpha;
    }
    octx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "blur(3.5px)";
    ctx.drawImage(off, 0, 0, width, height);
    ctx.filter = "none";
  };

  const loop = (now: number) => {
    if (!running) return;
    if (document.hidden) {
      frame = window.requestAnimationFrame(loop);
      return;
    }
    if (now - last > 48) {
      paint(now);
      last = now;
    }
    if (!prefersReducedMotion()) frame = window.requestAnimationFrame(loop);
  };

  resize();
  paint(0);
  window.addEventListener("resize", resize);
  const onVis = () => {
    if (!document.hidden && !prefersReducedMotion() && running) {
      last = 0;
      frame = window.requestAnimationFrame(loop);
    }
  };
  document.addEventListener("visibilitychange", onVis);
  if (!prefersReducedMotion()) frame = window.requestAnimationFrame(loop);

  return () => {
    running = false;
    window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVis);
  };
}
