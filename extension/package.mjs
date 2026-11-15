// Zips extension/dist into a judge-ready archive: load it with "Load unpacked"
// after unzipping. Usage: node extension/package.mjs [outDir]
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
const outDir = path.resolve(process.argv[2] ?? path.join(root, "release"));
const name = `did-i-order-this-extension-${manifest.version}.zip`;

async function walk(dir, prefix = "") {
  const files = {};
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if ((await stat(full)).isDirectory()) Object.assign(files, await walk(full, rel));
    else files[`did-i-order-this-extension/${rel}`] = new Uint8Array(await readFile(full));
  }
  return files;
}

const files = await walk(dist);
for (const forbidden of Object.keys(files)) {
  if (/\.map$|\.env/.test(forbidden)) throw new Error(`Refusing to package ${forbidden}`);
}
const zip = zipSync(files, { level: 9, mtime: new Date("2026-11-30T00:00:00Z") });
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, name), zip);
console.log(`Packaged ${Object.keys(files).length} files into ${path.join(outDir, name)} (${zip.length} bytes)`);
