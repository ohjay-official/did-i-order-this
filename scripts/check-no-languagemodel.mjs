import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const roots = ["packages", "web", "extension", "scripts"];
const allowedExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html"]);
const skipDirs = new Set(["node_modules", "dist", "build", ".git"]);
const hits = [];

// One presence check is allowed: Firebase AI Logic sends an "only on device"
// request to the cloud when the browser has no on-device API, so product code
// must be able to see that the API is missing before it asks. That file may
// test for the name and do nothing else with it.
const PRESENCE_CHECK_FILE = join("web", "src", "ai", "onDevice.ts");
const PRESENCE_CHECK = '"LanguageModel" in scope';

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (skipDirs.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (path.endsWith("check-no-languagemodel.mjs")) continue;
    if (!allowedExt.has(extname(name))) continue;
    let text = readFileSync(path, "utf8");
    if (path === PRESENCE_CHECK_FILE) text = text.replace(PRESENCE_CHECK, "");
    if (text.includes("LanguageModel")) {
      hits.push(path);
    }
  }
}

for (const root of roots) walk(root);

if (hits.length) {
  console.error("LanguageModel appears in:");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log("OK: no LanguageModel references in source.");
