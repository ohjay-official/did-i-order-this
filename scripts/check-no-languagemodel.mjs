import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const roots = ["packages", "web", "extension", "scripts"];
const allowedExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html"]);
const skipDirs = new Set(["node_modules", "dist", "build", ".git"]);
const hits = [];

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
    const text = readFileSync(path, "utf8");
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
