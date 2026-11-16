import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extractOpenGmailThread } from "./extract.ts";
import { isTrustedSender, matchPrefixes } from "./messages.ts";
import { FIXTURE_MATCH, fixtureThread, fixtureThreadHtml, mountFixture } from "../../web/src/extensionDemo/fixture.ts";
import { formatEmailText, sampleThreads } from "../../web/src/demo/seed.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "../manifest.json"), "utf8")) as {
  permissions: string[];
  host_permissions?: string[];
  content_scripts: Array<{ matches: string[] }>;
};
const fixtureHtml = readFileSync(path.join(here, "../../web/extension-demo/index.html"), "utf8");

describe("content-script matches", () => {
  it("run only on Gmail and the exact hosted fixture path", () => {
    const matches = manifest.content_scripts.flatMap((entry) => entry.matches);
    expect(matches).toEqual(["https://mail.google.com/*", "https://did-i-order-this.vercel.app/extension-demo/*"]);
    expect(matches).toContain(FIXTURE_MATCH);
    expect(manifest.permissions).toEqual(["storage", "sidePanel"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("trust messages from the fixture path only, not the rest of the site", () => {
    const prefixes = matchPrefixes(manifest.content_scripts.flatMap((entry) => entry.matches));
    const from = (url: string) => isTrustedSender({ id: "me", tab: { url } }, "me", prefixes);
    expect(from("https://did-i-order-this.vercel.app/extension-demo/")).toBe(true);
    expect(from("https://did-i-order-this.vercel.app/extension-demo/?thread=thread-3-safe-carrier")).toBe(true);
    expect(from("https://did-i-order-this.vercel.app/app/")).toBe(false);
    expect(from("https://did-i-order-this.vercel.app/")).toBe(false);
    expect(from("https://did-i-order-this.vercel.app.evil.example/extension-demo/")).toBe(false);
    expect(from("https://mail.google.com/mail/u/0/#inbox/abc")).toBe(true);
  });
});

describe("hosted extension fixture", () => {
  it("is labelled as a fixture and kept out of search", () => {
    const dom = new JSDOM(fixtureHtml);
    const doc = dom.window.document;
    expect(doc.querySelector("[data-fixture-banner]")?.textContent).toContain("Extension test fixture.");
    expect(doc.querySelector("[data-fixture-banner]")?.textContent).toContain("It is not Gmail");
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("serves the first DHL thread without JavaScript, readable by the content script", () => {
    const doc = new JSDOM(fixtureHtml).window.document;
    expect(doc.querySelector("h2.hP")?.textContent).toBe("Your parcel is held. Pay the release fee.");
    const email = extractOpenGmailThread(doc);
    expect(email?.fromDomain).toBe("dhl-parcel-desk.example");
    expect(email?.text).toContain("GM123456789012345");
    expect(email?.text).not.toContain("Extension test fixture");
  });

  it("static markup matches what the page script renders for the first thread", () => {
    const staticDoc = new JSDOM(fixtureHtml).window.document;
    const rendered = new JSDOM(`<div role="main">${fixtureThreadHtml(sampleThreads[0])}</div>`).window.document;
    expect(extractOpenGmailThread(staticDoc)).toEqual(extractOpenGmailThread(rendered));
  });

  it("every sample thread extracts with its sender, subject and numbers", () => {
    for (const thread of sampleThreads) {
      const doc = new JSDOM(`<div role="main">${fixtureThreadHtml(thread)}</div>`).window.document;
      const email = extractOpenGmailThread(doc);
      expect(email?.subject).toBe(thread.subject);
      expect(email?.fromDomain).toBe(thread.fromDomain);
      expect(email?.text).toContain(thread.body.split("\n").find((line) => /\d/.test(line)) ?? thread.subject);
      expect(formatEmailText(thread)).toContain(thread.subject);
    }
  });

  it("switches threads from the buttons and from ?thread=", () => {
    const dom = new JSDOM(fixtureHtml);
    const doc = dom.window.document;
    mountFixture(doc, "?thread=thread-3-safe-carrier");
    expect(doc.querySelector("h2.hP")?.textContent).toBe("UPS delivery update for 1Z999AA10123456784");
    doc.querySelector<HTMLButtonElement>('[data-fixture-thread="thread-5-wrong-tracking"]')?.click();
    expect(extractOpenGmailThread(doc)?.text).toContain("GM999888777666555");
    expect(doc.querySelector('[data-fixture-thread="thread-5-wrong-tracking"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(fixtureThread("nope").id).toBe("thread-1-carrier-lure");
  });

  it("lists one button per sample thread", () => {
    const doc = new JSDOM(fixtureHtml).window.document;
    const ids = [...doc.querySelectorAll("[data-fixture-thread]")].map((b) => b.getAttribute("data-fixture-thread"));
    expect(ids).toEqual(sampleThreads.map((t) => t.id));
  });
});
