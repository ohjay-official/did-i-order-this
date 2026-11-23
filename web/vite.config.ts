import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/** The commit this build came from: Vercel's build variable, else local git, else "unknown". */
function buildSha(): { sha: string; source: string } {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return { sha: process.env.VERCEL_GIT_COMMIT_SHA, source: "vercel" };
  try {
    return { sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), source: "git" };
  } catch {
    return { sha: "unknown", source: "unknown" };
  }
}

export default defineConfig({
  appType: "mpa",
  plugins: [
    {
      // /build-info.json names the commit that was deployed, so a proof run can record it.
      name: "build-info",
      apply: "build",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "build-info.json", source: `${JSON.stringify(buildSha())}\n` });
      },
    },
    {
      name: "preview-404",
      configurePreviewServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
            if (url.startsWith("/assets/") || /\.(js|css|map|svg|png|jpg|jpeg|webp|woff2|txt|xml|ico)$/.test(url)) {
              next();
              return;
            }
            const dist = path.resolve(root, "dist");
            const candidates = [];
            if (url === "/" || url === "") {
              candidates.push(path.join(dist, "index.html"));
            } else {
              const trimmed = url.replace(/\/+$/, "");
              candidates.push(path.join(dist, trimmed, "index.html"));
              candidates.push(path.join(dist, trimmed + ".html"));
              candidates.push(path.join(dist, trimmed));
            }
            const hit = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
            if (hit) {
              res.statusCode = 200;
              if (hit.endsWith(".html")) res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(fs.readFileSync(hit));
              return;
            }
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(fs.readFileSync(path.join(dist, "404.html")));
          });
        };
      },
    },
  ],

  resolve: {
    alias: {
      "@did-i-order-this/core": path.resolve(root, "../packages/core/src/index.ts"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: path.resolve(root, "index.html"),
        how: path.resolve(root, "how-it-works/index.html"),
        features: path.resolve(root, "features/index.html"),
        privacy: path.resolve(root, "privacy/index.html"),
        extension: path.resolve(root, "extension/index.html"),
        faq: path.resolve(root, "faq/index.html"),
        pricing: path.resolve(root, "pricing/index.html"),
        about: path.resolve(root, "about/index.html"),
        app: path.resolve(root, "app/index.html"),
        extensionDemo: path.resolve(root, "extension-demo/index.html"),
        notFound: path.resolve(root, "404.html"),
        og: path.resolve(root, "og.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
