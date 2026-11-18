#!/usr/bin/env node
// One command for judges and maintainers: `npm run verify`.
// Prints PASS / FAIL per check and exits non-zero if any check fails.
// `npm run verify -- --offline` skips the live-site checks.
// `npm run verify -- --skip-build` reuses existing build output.
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has("--offline");
const SKIP_BUILD = args.has("--skip-build");
const SITE = (process.env.VERIFY_SITE || "https://did-i-order-this.vercel.app").replace(/\/$/, "");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok === null ? "SKIP" : ok ? "PASS" : "FAIL";
  console.log(`${tag}  ${name}${detail ? `  (${detail})` : ""}`);
}

function run(name, cmd, cmdArgs) {
  const started = Date.now();
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = res.status === 0;
  if (!ok) {
    const tail = `${res.stdout || ""}\n${res.stderr || ""}`.trim().split("\n").slice(-25).join("\n");
    console.log(tail);
  }
  record(name, ok, `${seconds}s`);
  return res;
}

// Secret patterns. Matches are never printed, only the file and pattern name.
const SECRET_PATTERNS = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{20,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Slack token", /\bxox[abpr]-[0-9A-Za-z-]{10,}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}/],
  ["Vercel token", /\bvercel_[A-Za-z0-9]{20,}/],
  ["App Check debug token assignment", /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*["']?[0-9a-f]{8}-[0-9a-f]{4}/i],
];

function scanText(text, where, hits) {
  for (const line of text.split("\n")) {
    if (line.includes('"integrity": "sha')) continue; // lockfile hashes
    for (const [label, re] of SECRET_PATTERNS) {
      if (re.test(line)) hits.add(`${label} in ${where}`);
    }
  }
}

function secretsScan() {
  const hits = new Set();
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const file of tracked) {
    if (!existsSync(file) || statSync(file).size > 5_000_000) continue;
    if (/\.(png|jpe?g|webp|gif|mp4|webm|woff2?|ico|zip)$/i.test(file)) continue;
    scanText(readFileSync(file, "utf8"), file, hits);
  }
  const envFiles = tracked.filter((file) => /(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".env.example"));
  for (const file of envFiles) hits.add(`tracked env file ${file}`);
  if (existsSync(".env.example")) {
    const filled = readFileSync(".env.example", "utf8").split("\n").filter((line) => /^[A-Z_]+=.+/.test(line));
    if (filled.length) hits.add(`.env.example has ${filled.length} filled value(s)`);
  }
  record("secrets scan: tracked files", hits.size === 0, hits.size ? [...hits].join("; ") : `${tracked.length} files`);

  const historyHits = new Set();
  const history = spawnSync("git", ["log", "--all", "-p", "--no-color"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  scanText(history.stdout || "", "git history", historyHits);
  const commits = execFileSync("git", ["rev-list", "--all", "--count"], { encoding: "utf8" }).trim();
  record("secrets scan: git history", historyHits.size === 0, historyHits.size ? [...historyHits].join("; ") : `${commits} commits`);
}

function bundleScan() {
  // The shipped bundles must never carry an App Check debug token or debug flag.
  const roots = ["web/dist", "extension/dist"].filter(existsSync);
  const bad = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|html)$/.test(name)) {
        const text = readFileSync(path, "utf8");
        // The Firebase SDK reads this global; flag only an assignment of a value.
        if (/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*(!0|true|["'`][^"'`]+["'`])/.test(text)) bad.push(path);
      }
    }
  };
  roots.forEach(walk);
  record("bundle scan: no App Check debug token", roots.length > 0 && bad.length === 0, bad.join(", ") || roots.join(", "));
}

function audit() {
  const res = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch {
    record("dependency audit", false, "npm audit did not return JSON");
    return;
  }
  // Accepted advisories, by id. Any other high or critical advisory fails.
  // - GHSA-m9gg-hp2v-232j: @grpc/grpc-js, a Node-only transport pulled in by the
  //   Firestore part of the firebase package. This app never imports Firestore,
  //   and the browser bundles contain no grpc code (checked below).
  // - GHSA-fc5q-39xc-vjpf: picomatch ReDoS (published 19 Oct 2026, no patched
  //   release). It reaches only build and test tools (vite, vitest,
  //   typescript-eslint), which parse globs from this repo's own config. It must
  //   stay out of the production dependency tree (checked below).
  const ACCEPTED = new Set(["GHSA-m9gg-hp2v-232j", "GHSA-fc5q-39xc-vjpf"]);
  const DEV_ONLY = new Set(["GHSA-fc5q-39xc-vjpf"]);
  const rootAdvisories = (report) => {
    const ids = new Set();
    for (const v of Object.values(report.vulnerabilities || {})) {
      for (const via of v.via || []) {
        if (typeof via === "object" && (via.severity === "high" || via.severity === "critical")) {
          ids.add(String(via.url || via.source).split("/").pop());
        }
      }
    }
    return ids;
  };
  const all = rootAdvisories(data);
  const open = [...all].filter((id) => !ACCEPTED.has(id));
  let prod;
  try {
    prod = rootAdvisories(JSON.parse(spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout));
  } catch {
    record("dependency audit", false, "npm audit --omit=dev did not return JSON");
    return;
  }
  const leaked = [...prod].filter((id) => DEV_ONLY.has(id));
  const counts = data.metadata?.vulnerabilities || {};
  record(
    "dependency audit (high/critical, excluding accepted advisories)",
    open.length === 0 && leaked.length === 0,
    open.length || leaked.length
      ? [...open.map((id) => `open ${id}`), ...leaked.map((id) => `dev-only advisory in production deps ${id}`)].join(", ")
      : `critical ${counts.critical ?? 0}, high ${counts.high ?? 0} (accepted: ${[...all].join(", ") || "none"}), moderate ${counts.moderate ?? 0}`,
  );
  if (existsSync("web/dist")) {
    const js = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".js")) js.push(readFileSync(p, "utf8"));
      }
    };
    walk("web/dist");
    record("accepted advisory not shipped: no grpc in web bundle", !js.some((t) => t.includes("@grpc/grpc-js") || t.includes("grpc-js")));
  }
}

async function fetchStatus(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: "follow", ...init });
    return { status: res.status, headers: res.headers, text: init.method === "HEAD" ? "" : await res.text() };
  } catch (error) {
    return { status: 0, headers: new Headers(), text: String(error) };
  }
}

async function liveChecks() {
  const sitemap = await fetchStatus(`${SITE}/sitemap.xml`);
  const pages = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, SITE));
  record("live: sitemap.xml lists routes", sitemap.status === 200 && pages.length > 0, `${pages.length} routes`);

  const links = new Set();
  const badPages = [];
  for (const page of pages) {
    const res = await fetchStatus(page);
    if (res.status !== 200) badPages.push(`${page} ${res.status}`);
    for (const m of res.text.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      const raw = m[1];
      if (/^(mailto:|tel:|javascript:|data:)/.test(raw)) continue;
      const abs = new URL(raw, page).toString();
      if (abs.startsWith(SITE)) links.add(abs.split("?")[0]);
    }
  }
  record("live: every sitemap route returns 200", badPages.length === 0, badPages.join(", ") || `${pages.length} ok`);

  const brokenLinks = [];
  for (const link of links) {
    const res = await fetchStatus(link, { method: "HEAD" });
    if (res.status !== 200) brokenLinks.push(`${link.replace(SITE, "")} ${res.status}`);
  }
  record("live: internal links and assets resolve", brokenLinks.length === 0, brokenLinks.join(", ") || `${links.size} checked`);

  const missing = await fetchStatus(`${SITE}/this-page-does-not-exist-${Date.now()}`);
  record("live: unknown path returns the 404 page", missing.status === 404);

  const pkg = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  const zipUrl = `${SITE}/downloads/did-i-order-this-extension-${pkg.version}.zip`;
  const zip = await fetchStatus(zipUrl, { method: "HEAD" });
  record("live: extension zip downloadable", zip.status === 200, zip.status === 200 ? zipUrl.replace(SITE, "") : `${zip.status}`);

  const home = await fetchStatus(`${SITE}/`);
  const required = [
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "strict-transport-security",
    "permissions-policy",
  ];
  const absent = required.filter((h) => !home.headers.get(h));
  record("live: security headers present", absent.length === 0, absent.length ? `missing ${absent.join(", ")}` : `${required.length} headers`);
}

console.log("Did I Order This? verify\n");
// Node 22.22 or later is the supported minimum (package.json engines).
{
  const [maj, min] = process.versions.node.split(".").map(Number);
  record("Node 22.22 or later", maj > 22 || (maj === 22 && min >= 22), `node ${process.versions.node}`);
}
run("unit tests (core, web, extension)", "npm", ["test", "--silent"]);
run("core coverage thresholds", "npm", ["run", "coverage", "--silent"]);
run("typecheck", "npm", ["run", "typecheck", "--silent"]);
run("lint", "npm", ["run", "lint", "--silent"]);
run("no direct Prompt API calls in product code", "npm", ["run", "check:no-languagemodel", "--silent"]);
if (SKIP_BUILD) record("build", null, "skipped");
else run("build (web + extension)", "npm", ["run", "build", "--silent"]);
run("package extension zip", "node", ["extension/package.mjs"]);
secretsScan();
bundleScan();
audit();
if (OFFLINE) record("live site checks", null, "offline");
else await liveChecks();

const failed = results.filter((r) => r.ok === false);
console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"}: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed, ${results.filter((r) => r.ok === null).length} skipped`);
process.exit(failed.length === 0 ? 0 : 1);
