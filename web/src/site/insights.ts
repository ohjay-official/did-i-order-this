import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

/** Drop the query string and fragment, so only the page path is ever sent. */
export function stripQuery(url: string): string {
  return url.split("?")[0].split("#")[0];
}

/**
 * Vercel Web Analytics and Speed Insights. Both are cookie-free: no cookies and no
 * cross-site identifiers. They load only on the production host, never on local
 * builds or previews, and never see email text you paste (only the page path).
 * Both get the same beforeSend, so neither sends a query string.
 */
export function mountInsights(): void {
  if (!import.meta.env.PROD) return;
  if (typeof location === "undefined" || location.hostname !== "did-i-order-this.vercel.app") return;
  inject({
    mode: "production",
    beforeSend: (event) => ({ ...event, url: stripQuery(event.url) }),
  });
  injectSpeedInsights({
    beforeSend: (event) => ({ ...event, url: stripQuery(event.url) }),
  });
}
