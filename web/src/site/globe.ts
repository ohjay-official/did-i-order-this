// Sample-box globe, aligned to the ostra globe spec: nine latitude rings, a seeded
// Park-Miller layout, curved SphereGeometry tiles with rounded corners, a rim fade
// toward the page colour, a bottom-up build, scroll coupling, and drag with momentum.
// Tiles are our own sample-inbox screens (a 4x4 atlas = four 2x2 sheets).

const PAPER: [number, number, number] = [247 / 255, 243 / 255, 238 / 255];
const SHEETS = 4;
const BANDS = [11, 14, 17, 21, 24, 21, 17, 14, 11];
const GAP = 2.1;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function parkMiller(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uRect;
  uniform float uAspect;
  uniform float uOpacity;
  uniform vec3 uPaper;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 b = vec2(0.5 * uAspect, 0.5);
    float r = 0.085;
    vec2 q = abs(p) - b + r;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float w = fwidth(d) * 1.2;
    float mask = 1.0 - smoothstep(-w, w, d);
    vec3 color = texture2D(uMap, uRect.xy + vUv * uRect.zw).rgb;
    color = mix(color, uPaper, pow(1.0 - vFacing, 2.2) * 0.62);
    float alpha = mask * uOpacity;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

interface TileSpec {
  ring: number;
  ringFromBottom: number;
  phiStart: number;
  phiLength: number;
  thetaStart: number;
  thetaLength: number;
  lon: number;
}

function layout(): TileSpec[] {
  const rand = parkMiller(20261113);
  const total = BANDS.reduce((a, h) => a + h, 0) + GAP * (BANDS.length - 1);
  let theta = (180 - total) / 2;
  const tiles: TileSpec[] = [];
  BANDS.forEach((h, ring) => {
    const centre = theta + h / 2;
    const sinC = Math.sin((centre * Math.PI) / 180);
    const widths: number[] = [];
    const gap = GAP / sinC;
    let sum = 0;
    while (sum < 360) {
      const w = (h * (0.82 + rand() * 0.62)) / sinC;
      widths.push(w);
      sum += w + gap;
    }
    const scale = 360 / sum;
    let lon = rand() * 360;
    for (const w0 of widths) {
      const w = w0 * scale;
      let tStart = theta;
      let tLen = h;
      if (rand() < 0.45) {
        const cut = rand() * 0.2 * h;
        tLen = h - cut;
        if (rand() < 0.5) tStart = theta + cut;
      }
      tiles.push({
        ring,
        ringFromBottom: BANDS.length - 1 - ring,
        phiStart: (lon * Math.PI) / 180,
        phiLength: (w * Math.PI) / 180,
        thetaStart: (tStart * Math.PI) / 180,
        thetaLength: (tLen * Math.PI) / 180,
        lon: lon % 360,
      });
      lon += w + gap * scale;
    }
    theta += h + GAP;
  });
  return tiles;
}

export function mountGlobe(root: HTMLElement): void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-globe-canvas]");
  if (!canvas) return;
  if (!hasWebGL()) {
    root.classList.add("is-static");
    return;
  }
  let started = false;
  const near = new IntersectionObserver(
    (entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return;
      started = true;
      near.disconnect();
      void start(root, canvas);
    },
    { rootMargin: "300px 0px" },
  );
  near.observe(root);
}

async function start(root: HTMLElement, canvas: HTMLCanvasElement): Promise<void> {
  let THREE: typeof import("./globe-three.ts");
  try {
    THREE = await import("./globe-three.ts");
  } catch {
    root.classList.add("is-static");
    return;
  }
  let renderer: import("three").WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  } catch {
    root.classList.add("is-static");
    return;
  }
  const reduced = prefersReducedMotion();
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const fov = ((2 * Math.asin(1 / 3.7) * 180) / Math.PI) * 1.015;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 20);
  camera.position.set(0, 0, 3.7);

  const group = new THREE.Group();
  group.rotation.x = 0.2;
  group.rotation.y = -0.6;
  scene.add(group);

  const wide = window.innerWidth >= 700;
  let textureReady = false;
  const texture = new THREE.TextureLoader().load(
    wide ? "/media/globe-atlas.webp" : "/media/globe-atlas-1024.webp",
    () => {
      textureReady = true;
      schedule();
    },
    undefined,
    () => {
      textureReady = true;
      schedule();
    },
  );
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const specs = layout();
  const ringCounts = BANDS.map((_, ring) => specs.filter((t) => t.ring === ring).length);
  const ringRank = new Map<TileSpec, number>();
  BANDS.forEach((_, ring) => {
    specs
      .filter((t) => t.ring === ring)
      .sort((a, b) => a.lon - b.lon)
      .forEach((t, i) => ringRank.set(t, i));
  });

  interface Tile {
    mesh: import("three").Mesh;
    uniforms: { uOpacity: { value: number } };
    delay: number;
  }
  const tiles: Tile[] = specs.map((spec, n) => {
    const degW = (spec.phiLength * 180) / Math.PI;
    const degH = (spec.thetaLength * 180) / Math.PI;
    const geometry = new THREE.SphereGeometry(
      1,
      Math.max(6, Math.round(degW / 3)),
      Math.max(6, Math.round(degH / 3)),
      spec.phiStart,
      spec.phiLength,
      spec.thetaStart,
      spec.thetaLength,
    );
    const mid = spec.thetaStart + spec.thetaLength / 2;
    const aspect = (spec.phiLength * Math.sin(mid)) / spec.thetaLength;
    // Sheet n mod 4, quadrant floor(n/4) mod 4: all 16 screens before any repeat.
    const sheet = n % SHEETS;
    const quad = Math.floor(n / SHEETS) % 4;
    const col = (sheet % 2) * 2 + (quad % 2);
    const row = Math.floor(sheet / 2) * 2 + Math.floor(quad / 2);
    const cell = 0.25;
    const inset = cell * 0.035;
    let w = cell - inset * 2;
    let h = w;
    if (aspect > 1) h = w / aspect;
    else w = h * aspect;
    const x = col * cell + (cell - w) / 2;
    const yTop = row * cell + (cell - h) / 2;
    const rect = new THREE.Vector4(x, 1 - yTop - h, w, h);
    const uniforms = {
      uMap: { value: texture },
      uRect: { value: rect },
      uAspect: { value: aspect },
      uOpacity: { value: reduced ? 1 : 0 },
      uPaper: { value: new THREE.Vector3(...PAPER) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: true,
      premultipliedAlpha: true,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (!reduced) mesh.scale.setScalar(0.9);
    group.add(mesh);
    const delay = spec.ringFromBottom * 0.2 + ((ringRank.get(spec) ?? 0) / ringCounts[spec.ring]) * 0.42;
    return { mesh, uniforms, delay };
  });
  const buildEnd = Math.max(...tiles.map((t) => t.delay)) + 0.5;

  const resize = () => {
    const rect = root.getBoundingClientRect();
    const size = Math.max(1, rect.width);
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(root);

  // Motion state.
  let velocity = 0;
  let spinY = group.rotation.y;
  let tilt = 0.2;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMoveT = 0;
  let tracked = 0;
  let lastScroll = window.scrollY;
  let introStart = -1;
  let introRequested = false;
  let built = reduced;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const clampV = (v: number) => Math.max(-6, Math.min(6, v));

  if (!reduced) {
    group.scale.set(0.42, 0.42 * 0.22, 0.42);
    group.position.y = -0.62;
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        const delta = y - lastScroll;
        lastScroll = y;
        if (!dragging) velocity = clampV(velocity + delta * 0.0042);
        schedule();
      },
      { passive: true },
    );
  }

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    root.classList.add("is-dragging");
    velocity = 0;
    tracked = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    lastMoveT = performance.now();
    schedule();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const now = performance.now();
    const width = root.getBoundingClientRect().width || 1;
    const k = 2.6 / width;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    spinY += dx * k;
    tilt = Math.max(-0.55, Math.min(0.75, tilt + dy * k * 0.8));
    const dt = Math.max(0.001, (now - lastMoveT) / 1000);
    lastMoveT = now;
    tracked = tracked * 0.6 + ((dx * k) / dt) * 0.4;
    schedule();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    velocity = clampV(tracked);
    schedule();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!reduced && introRequested && introStart < 0 && textureReady) introStart = now;
    let animating = false;
    if (!reduced && introStart >= 0) {
      const t = (now - introStart) / 1000;
      const p = ease(Math.min(1, t / 1.1));
      const s = 0.42 + 0.58 * p;
      group.scale.set(s, s * (0.22 + 0.78 * p), s);
      group.position.y = -(1 - p) * 0.62;
      if (t < 1.1) spinY += Math.pow(1 - p, 2) * 2.6 * dt;
      if (!built) {
        if (t >= buildEnd) {
          for (const tile of tiles) {
            tile.uniforms.uOpacity.value = 1;
            tile.mesh.scale.setScalar(1);
          }
          built = true;
        } else {
          for (const tile of tiles) {
            const k = ease(Math.max(0, Math.min(1, (t - tile.delay) / 0.5)));
            tile.uniforms.uOpacity.value = k;
            tile.mesh.scale.setScalar(0.9 + 0.1 * k);
          }
        }
      }
      animating = t < Math.max(1.1, buildEnd);
    }

    if (!dragging) {
      spinY += velocity * dt;
      velocity *= Math.exp(-2.6 * dt);
      if (Math.abs(velocity) < 0.0005) velocity = 0;
      tilt += (0.2 - tilt) * (1 - Math.exp(-2.2 * dt));
    }
    group.rotation.y = spinY;
    group.rotation.x = tilt;
    renderer.render(scene, camera);

    const settling = Math.abs(velocity) > 0 || Math.abs(tilt - 0.2) > 0.0005 || dragging || !textureReady;
    if ((visible && settling) || animating || (introRequested && introStart < 0)) schedule();
  };

  function schedule(): void {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !introRequested) {
        introRequested = true;
        window.setTimeout(() => {
          textureReady = true;
          schedule();
        }, 4000);
      }
      if (visible) schedule();
    },
    { rootMargin: "120px 0px" },
  );
  io.observe(root);

  root.classList.add("is-live");
  schedule();
}
