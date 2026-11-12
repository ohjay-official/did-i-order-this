import { describe, expect, it } from "vitest";
import { recaptchaProviderTypeFromEnv } from "./app.ts";

describe("recaptchaProviderTypeFromEnv", () => {
  it("selects enterprise or v3 from the env value", () => {
    expect(recaptchaProviderTypeFromEnv("enterprise")).toBe("enterprise");
    expect(recaptchaProviderTypeFromEnv("reCAPTCHA-Enterprise")).toBe("enterprise");
    expect(recaptchaProviderTypeFromEnv("v3")).toBe("v3");
    expect(recaptchaProviderTypeFromEnv(undefined)).toBe("v3");
  });
});
