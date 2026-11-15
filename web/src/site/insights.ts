import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

/**
 * Vercel Web Analytics and Speed Insights. Both are cookie-free: no cookies and no
 * cross-site identifiers. They load only on the production host, never on local
 * builds or previews, and never see email text you paste (only the page path).
 */
export function mountInsights(): void {
  if (!import.meta.env.PROD) return;
  if (typeof location === "undefined" || location.hostname !== "did-i-order-this.vercel.app") return;
  inject({
    mode: "production",
    // Drop query strings so nothing but the page path is ever sent.
    beforeSend: (event) => ({ ...event, url: event.url.split("?")[0].split("#")[0] }),
  });
  injectSpeedInsights();
}
