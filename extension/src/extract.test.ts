import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extractOpenGmailThread } from "./extract.ts";

describe("extractOpenGmailThread", () => {
  it("passes the open thread text only, including From and Subject", () => {
    const dom = new JSDOM(`<!doctype html><div role="main">
      <h2 class="hP">Your parcel is held. Pay the release fee.</h2>
      <span class="gD" email="alerts@dhl-parcel-desk.example">DHL Express Desk</span>
      <span class="g3" title="12 Nov 2026">12 Nov</span>
      <div class="a3s aiL">Tracking number: GM123456789012345. Pay a fee to release it.</div>
    </div>`);
    const extracted = extractOpenGmailThread(dom.window.document);
    expect(extracted).not.toBeNull();
    expect(extracted?.subject).toBe("Your parcel is held. Pay the release fee.");
    expect(extracted?.fromEmail).toBe("alerts@dhl-parcel-desk.example");
    expect(extracted?.fromDomain).toBe("dhl-parcel-desk.example");
    expect(extracted?.text).toContain("GM123456789012345");
    expect(extracted?.text).toContain("From: DHL Express Desk <alerts@dhl-parcel-desk.example>");
  });

  it("returns null when no thread is open", () => {
    const dom = new JSDOM(`<!doctype html><div role="main"><div>Inbox</div></div>`);
    expect(extractOpenGmailThread(dom.window.document)).toBeNull();
  });
});
