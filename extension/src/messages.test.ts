import { describe, expect, it } from "vitest";
import { MAX_EMAIL_CHARS, isTrustedSender, matchPrefixes, sanitizeEmail } from "./messages.ts";

describe("extension messaging", () => {
  it("accepts only this extension on a declared page", () => {
    expect(isTrustedSender({ id: "me", tab: { url: "https://mail.google.com/mail/u/0/#inbox/abc" } }, "me")).toBe(true);
    expect(isTrustedSender({ id: "other", tab: { url: "https://mail.google.com/mail/u/0/" } }, "me")).toBe(false);
    expect(isTrustedSender({ id: "me", tab: { url: "https://evil.example/mail.google.com/" } }, "me")).toBe(false);
    expect(isTrustedSender({ id: "me", tab: { url: "http://127.0.0.1:8123/fixture" } }, "me", ["http://127.0.0.1:8123/"])).toBe(true);
  });

  it("turns match patterns into prefixes and drops wildcards hosts", () => {
    expect(matchPrefixes(["https://mail.google.com/*", "http://127.0.0.1:8123/*", "<all_urls>", "https://*.example.com/*"])).toEqual([
      "https://mail.google.com/",
      "http://127.0.0.1:8123/",
    ]);
  });

  it("sanitizes payloads and caps text length", () => {
    expect(sanitizeEmail(null)).toBeNull();
    expect(sanitizeEmail({ text: 1, fromDomain: "a", subject: "b" })).toBeNull();
    const big = sanitizeEmail({ text: "x".repeat(MAX_EMAIL_CHARS + 50), fromDomain: "DHL.example", subject: "Hi", extra: true });
    expect(big?.text.length).toBe(MAX_EMAIL_CHARS);
    expect(big?.fromDomain).toBe("dhl.example");
    expect(big && "extra" in big).toBe(false);
  });
});
