// Drive branded Google Chrome over CDP, with Nano flags enabled the same way
// as ohjay-official/nano-probe. Do not use Playwright's default launch args
// (they disable component updates and block the model download).
//
// Usage: node on-device.mjs <chrome-binary> <profile-dir> <out-dir> [siteUrl] [extensionDir] [timeoutMinutes]
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const [
  chromeBin = "google-chrome",
  profileDir = "/tmp/nano-profile",
  outDir = path.join(here, "out"),
  siteUrl = "https://did-i-order-this.vercel.app/",
  extensionDir = "",
  timeoutArg = "15",
] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg) * 60_000;

await mkdir(outDir, { recursive: true });
await mkdir(profileDir, { recursive: true });

const localStatePath = path.join(profileDir, "Local State");
if (!existsSync(localStatePath)) {
  await writeFile(
    localStatePath,
    JSON.stringify({
      browser: {
        enabled_labs_experiments: [
          "optimization-guide-on-device-model@2",
          "prompt-api-for-gemini-nano@1",
        ],
      },
      internal_only_uis_enabled: true,
    }),
  );
}

const fixtureHtml = await readFile(path.join(here, "gmail-fixture.html"));
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(fixtureHtml);
});
await new Promise((resolve) => server.listen(8123, "127.0.0.1", resolve));

const wantExtension = Boolean(extensionDir && existsSync(path.join(extensionDir, "manifest.json")));
const chromeArgs = [
  `--user-data-dir=${profileDir}`,
  "--remote-debugging-port=9222",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1280,800",
  "--window-position=0,0",
];
if (wantExtension) {
  chromeArgs.unshift("--remote-debugging-pipe", "--enable-unsafe-extension-debugging");
}
chromeArgs.push("about:blank");

const chrome = spawn(chromeBin, chromeArgs, {
  stdio: wantExtension ? ["ignore", "pipe", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
});

let chromeLog = "";
chrome.stdout?.on("data", (d) => {
  chromeLog += d;
});
chrome.stderr?.on("data", (d) => {
  chromeLog += d;
});
chrome.on("exit", (code, signal) => {
  chromeLog += `\n[chrome exit code=${code} signal=${signal}]\n`;
});

function redact(s) {
  return String(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted]")
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[redacted]")
    .replace(/6L[0-9A-Za-z\-_]{20,}/g, "[redacted]");
}

async function loadUnpacked(absPath) {
  const cdpIn = chrome.stdio[3];
  const cdpOut = chrome.stdio[4];
  if (!cdpIn || !cdpOut) {
    throw new Error("Chrome did not receive pipe fds 3 and 4 for Extensions.loadUnpacked.");
  }
  const id = 1337;
  const request = { id, method: "Extensions.loadUnpacked", params: { path: path.resolve(absPath) } };
  let pending = "";
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Extensions.loadUnpacked timed out after 20s")), 20_000);
    const onData = (chunk) => {
      pending += chunk.toString("utf8");
      let end = pending.indexOf("\x00");
      while (end !== -1) {
        const whole = pending.slice(0, end);
        pending = pending.slice(end + 1);
        end = pending.indexOf("\x00");
        try {
          const msg = JSON.parse(whole);
          if (msg.id === id) {
            clearTimeout(timer);
            cdpOut.off("data", onData);
            resolve(msg);
          }
        } catch {
          // ignore incomplete frames
        }
      }
    };
    cdpOut.on("data", onData);
    cdpOut.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    cdpIn.write(JSON.stringify(request) + "\x00");
  });
  if (response.error) {
    throw new Error("Extensions.loadUnpacked failed: " + JSON.stringify(response.error));
  }
  if (!response.result?.id) {
    throw new Error("Extensions.loadUnpacked returned no extension id: " + JSON.stringify(response));
  }
  return response.result.id;
}

async function waitForCdpPort() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/version");
      if (res.ok) return res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Chrome DevTools port 9222 never came up");
}

async function readCheck(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    return {
      label: document.querySelector(".source-label")?.textContent?.trim() || null,
      outcome: document.querySelector(".outcome")?.textContent?.trim() || null,
      headline: document.querySelector(".headline, .result h2")?.textContent?.trim() || null,
      consentShown: Boolean(document.querySelector("[data-action=consent-yes]")),
      usedSample: text.includes("prepared for this sample thread"),
      bodySnippet: text.slice(0, 1500),
    };
  });
}

async function waitForCheck(page, deadline, snapPrefix) {
  let lastSnap = 0;
  while (Date.now() < deadline) {
    const state = await readCheck(page);
    if (state.label || state.consentShown || (state.bodySnippet || "").includes("could not run")) {
      return state;
    }
    if (Date.now() - lastSnap > 120_000) {
      await page.screenshot({ path: path.join(outDir, `${snapPrefix}-progress-${Date.now()}.png`) });
      lastSnap = Date.now();
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return readCheck(page);
}

const result = {
  startedAt: new Date().toISOString(),
  siteUrl,
  chromeBin,
};
let browser;
try {
  if (wantExtension) {
    result.extensionId = await loadUnpacked(extensionDir);
    result.loadUnpacked = "ok";
    console.log("Loaded unpacked extension");
  }
  result.version = await waitForCdpPort();
  if (result.version?.Browser) console.log("CHROME:", result.version.Browser);

  browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("[data-action=check]", { timeout: 30_000 });
  const dhl = page.locator('[data-thread="thread-1-carrier-lure"]');
  if (await dhl.count()) await dhl.click();
  await page.click("[data-action=check]");
  const hostedDeadline = Date.now() + timeoutMs;
  result.hosted = await waitForCheck(page, hostedDeadline, "hosted");
  await page.screenshot({ path: path.join(outDir, "hosted-inbox.png"), fullPage: true });
  console.log("HOSTED LABEL:", result.hosted.label || "(none)");
  if (result.hosted.headline) console.log("HOSTED HEADLINE:", result.hosted.headline);
  if (result.hosted.outcome) console.log("HOSTED OUTCOME:", result.hosted.outcome);

  if (wantExtension && result.extensionId) {
    const fixture = await context.newPage();
    await fixture.goto("http://127.0.0.1:8123/", { waitUntil: "domcontentloaded" });
    await fixture.waitForSelector("h2.hP");
    await new Promise((r) => setTimeout(r, 1500));
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${result.extensionId}/sidepanel.html`, {
      waitUntil: "domcontentloaded",
    });
    await panel.waitForSelector("[data-action=check]", { timeout: 30_000 });
    const ready = await panel.waitForFunction(
      () => {
        const btn = document.querySelector("[data-action=check]");
        return btn && !btn.hasAttribute("disabled") && (document.body.innerText || "").includes("GM123456789012345");
      },
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);
    result.extensionReady = ready;
    if (ready) {
      await panel.click("[data-action=check]");
      const extDeadline = Date.now() + Math.min(timeoutMs, 8 * 60_000);
      result.extension = await waitForCheck(panel, extDeadline, "extension");
    } else {
      result.extension = await readCheck(panel);
      result.extensionError = "Side panel did not receive the fixture email text.";
    }
    await panel.screenshot({ path: path.join(outDir, "extension-sidepanel.png"), fullPage: true });
    await fixture.screenshot({ path: path.join(outDir, "gmail-fixture.png"), fullPage: true });
    console.log("EXTENSION LABEL:", result.extension?.label || "(none)");
    if (result.extension?.headline) console.log("EXTENSION HEADLINE:", result.extension.headline);
  }
} catch (error) {
  result.fatal = String(error && (error.stack || error));
  console.log(result.fatal);
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
  await writeFile(path.join(outDir, "chrome.log"), redact(chromeLog).slice(-20000));
  if (browser) await browser.close().catch(() => {});
  chrome.kill("SIGTERM");
  server.close();
}

const hostedOk =
  result.hosted?.label === "Checked on this device" &&
  result.hosted?.consentShown !== true &&
  result.hosted?.usedSample !== true;
const extensionOk =
  !wantExtension || result.extension?.label === "Checked on this device";
if (!hostedOk) {
  console.log("HOSTED CHECK FAILED: expected Checked on this device");
}
if (wantExtension && !extensionOk) {
  console.log("EXTENSION CHECK FAILED: expected Checked on this device");
}
process.exit(hostedOk && extensionOk ? 0 : 1);
