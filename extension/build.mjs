import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, "dist");
const alias = {
  "@did-i-order-this/core": path.resolve(root, "../packages/core/src/index.ts"),
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  root,
  configFile: false,
  resolve: { alias },
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(root, "sidepanel.html"),
    },
  },
});

await build({
  root,
  configFile: false,
  resolve: { alias },
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: path.join(root, "src/content.ts"),
      name: "DidIOrderThisContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});

await build({
  root,
  configFile: false,
  resolve: { alias },
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: path.join(root, "src/background.ts"),
      name: "DidIOrderThisBackground",
      formats: ["iife"],
      fileName: () => "background.js",
    },
  },
});

await cp(path.join(root, "manifest.json"), path.join(outDir, "manifest.json"));

// Vite may emit sidepanel.html in a nested path; flatten if needed.
const htmlPath = path.join(outDir, "sidepanel.html");
const html = await readFile(htmlPath, "utf8");
await writeFile(htmlPath, html);
console.log("Extension unpacked build is in extension/dist");
