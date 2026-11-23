import { describe, expect, it } from "vitest";
import { stripQuery } from "./insights";

describe("stripQuery (analytics and Speed Insights beforeSend)", () => {
  it("keeps only the page path", () => {
    expect(stripQuery("https://did-i-order-this.vercel.app/app/?thread=thread-1#x")).toBe(
      "https://did-i-order-this.vercel.app/app/",
    );
    expect(stripQuery("https://did-i-order-this.vercel.app/faq/#who")).toBe("https://did-i-order-this.vercel.app/faq/");
    expect(stripQuery("https://did-i-order-this.vercel.app/")).toBe("https://did-i-order-this.vercel.app/");
  });
});
