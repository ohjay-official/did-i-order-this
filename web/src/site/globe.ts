// Sample-box globe: curved rounded tiles of real sample-inbox screens on a sphere.
// three.js is loaded only when the section comes near the viewport.

const TILE_COUNT = 16;
const BG: [number, number, number] = [247 / 255, 243 / 255, 238 / 255];

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

const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute float aRow;
  attribute float aTile;
  attribute float aRand;
  uniform float uIntro;
  varying vec2 vUv;
  varying float vTile;
  varying float vGrow;
  varying float vFacing;
  void main() {
    float t = clamp(uIntro * 1.9 - aRow * 1.0 - aRand * 0.3, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec3 p = aCenter + (position - aCenter) * t;
    p.y -= (1.0 - t) * 0.55;
    vUv = uv;
    vTile = aTile;
    vGrow = t;
    vec3 n = normalize(normalMatrix * normalize(position));
    vFacing = n.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uBg;
  varying vec2 vUv;
  varying float vTile;
  varying float vGrow;
  varying float vFacing;
  float sdRound(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = sdRound(vUv - 0.5, vec2(0.5), 0.11);
    float aa = fwidth(d) * 1.2;
    float mask = 1.0 - smoothstep(-aa, aa, d);
    float id = floor(vTile + 0.5);
    float row = floor((id + 0.5) / 4.0);
    float col = id - row * 4.0;
    vec2 uv = vec2((col + vUv.x) / 4.0, 1.0 - (row + 1.0 - vUv.y) / 4.0);
    vec3 tex = texture2D(uAtlas, uv).rgb;
    float facing = clamp(vFacing, 0.0, 1.0);
    vec3 color = mix(uBg, tex, smoothstep(0.02, 0.6, facing));
    float alpha = mask * vGrow * smoothstep(0.0, 0.22, facing);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface Tile {
  lat: number;
  lon: number;
  sLat: number;
  sLon: number;
  row: number;
  tile: number;
}

function layout(): Tile[] {
  const tiles: Tile[] = [];
  const step = 22;
  const size = 19;
  const lats = [-66, -44, -22, 0, 22, 44, 66];
  let index = 0;
  lats.forEach((lat, r) => {
    const c = Math.cos((lat * Math.PI) / 180);
    const count = Math.max(5, Math.floor((360 * c) / step));
    const spacing = 360 / count;
    const sLon = Math.min(spacing - 3 / c, size / c);
    const offset = (r % 2) * (spacing / 2);
    for (let i = 0; i < count; i += 1) {
      tiles.push({ lat, lon: i * spacing + offset, sLat: size, sLon, row: r / (lats.length - 1), tile: (index * 7 + r * 3) % TILE_COUNT });
      index += 1;
    }
  });
  return tiles;
}

export function mountGlobe(root: HTMLElement): void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-globe-canvas]");
  if (!canvas) return;
  if (prefersReducedMotion() || !hasWebGL()) {
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
    { rootMargin: "500px 0px" },
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
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    root.classList.add("is-static");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 4.2);

  const wide = window.innerWidth >= 700;
  const texture = await new THREE.TextureLoader()
    .loadAsync(wide ? "/media/globe-atlas.webp" : "/media/globe-atlas-1024.webp")
    .catch(() => null);
  if (!texture) {
    renderer.dispose();
    root.classList.add("is-static");
    return;
  }
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const segs = 8;
  const tiles = layout();
  const perTile = (segs + 1) * (segs + 1);
  const positions = new Float32Array(tiles.length * perTile * 3);
  const centers = new Float32Array(tiles.length * perTile * 3);
  const uvs = new Float32Array(tiles.length * perTile * 2);
  const rows = new Float32Array(tiles.length * perTile);
  const ids = new Float32Array(tiles.length * perTile);
  const rands = new Float32Array(tiles.length * perTile);
  const indices: number[] = [];
  const toRad = Math.PI / 180;
  const R = 1;
  const point = (lat: number, lon: number): [number, number, number] => {
    const a = lat * toRad;
    const b = lon * toRad;
    return [R * Math.cos(a) * Math.sin(b), R * Math.sin(a), R * Math.cos(a) * Math.cos(b)];
  };

  tiles.forEach((tile, t) => {
    const base = t * perTile;
    const center = point(tile.lat, tile.lon);
    const rand = Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1;
    for (let y = 0; y <= segs; y += 1) {
      for (let x = 0; x <= segs; x += 1) {
        const u = x / segs;
        const v = y / segs;
        const p = point(tile.lat + (v - 0.5) * tile.sLat, tile.lon + (u - 0.5) * tile.sLon);
        const k = base + y * (segs + 1) + x;
        positions.set(p, k * 3);
        centers.set(center, k * 3);
        uvs.set([u, v], k * 2);
        rows[k] = tile.row;
        ids[k] = tile.tile;
        rands[k] = rand;
      }
    }
    for (let y = 0; y < segs; y += 1) {
      for (let x = 0; x < segs; x += 1) {
        const a = base + y * (segs + 1) + x;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aCenter", new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aRow", new THREE.BufferAttribute(rows, 1));
  geometry.setAttribute("aTile", new THREE.BufferAttribute(ids, 1));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  geometry.setIndex(indices);

  const uniforms = {
    uAtlas: { value: texture },
    uBg: { value: new THREE.Vector3(...BG) },
    uIntro: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const globe = new THREE.Mesh(geometry, material);
  globe.rotation.x = 0.16;
  scene.add(globe);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fit = w < h ? 4.2 / camera.aspect : 4.2;
    camera.position.z = Math.max(3.4, Math.min(fit, 6));
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // Motion state: auto spin + scroll coupling + drag with momentum.
  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastScroll = window.scrollY;
  let introStart = 0;
  let visible = false;
  let raf = 0;
  let last = performance.now();

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    velocity = 0;
    root.classList.add("is-dragging");
  });
  window.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    const delta = dx * 0.006;
    angle += delta;
    velocity = delta;
  });
  const release = () => {
    dragging = false;
    root.classList.remove("is-dragging");
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!introStart) introStart = now;
    uniforms.uIntro.value = Math.min(1, (now - introStart) / 2400);

    const scroll = window.scrollY;
    const scrollDelta = scroll - lastScroll;
    lastScroll = scroll;
    if (!dragging) {
      velocity *= Math.pow(0.04, dt);
      angle += velocity + dt * 0.12 + scrollDelta * 0.0022;
    }
    globe.rotation.y = angle;
    renderer.render(scene, camera);
    if (visible) raf = requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible && !raf) {
      last = performance.now();
      lastScroll = window.scrollY;
      raf = requestAnimationFrame(frame);
    }
  });
  io.observe(root);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!document.hidden && visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  root.classList.add("is-live");
}
