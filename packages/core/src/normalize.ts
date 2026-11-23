import type { OfficialPack } from "./types.ts";

export function normalizeTracking(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeOrderId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Lower case, no "www.", no trailing dot. A Unicode (IDN) domain is turned into
 * its punycode form where the runtime can do that, so a lookalike written in
 * another script is compared as the ASCII name it really is.
 */
export function normalizeDomain(value: string): string {
  let domain = value.trim().toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(domain)) {
    try {
      domain = new URL(`http://${domain}`).hostname;
    } catch {
      // Leave it as it is: it will fail the domain check and be treated as unofficial.
    }
  }
  return domain;
}

/** Conservative patterns used only as a cross-check on cited numbers. */
export function looksLikeTracking(value: string): boolean {
  const n = normalizeTracking(value);
  if (/^1Z[A-Z0-9]{16}$/.test(n)) return true;
  if (/^[0-9]{12,22}$/.test(n)) return true;
  if (/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(n)) return true;
  if (/^[A-Z]{2}[0-9]{8,20}$/.test(n)) return true;
  if (/^[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}$/.test(value.trim())) return true;
  return false;
}

export function inferCarrierFromTracking(value: string): string | undefined {
  const n = normalizeTracking(value);
  if (/^1Z[A-Z0-9]{16}$/.test(n)) return "UPS";
  if (/^[0-9]{12}$/.test(n) || /^[0-9]{15}$/.test(n) || /^[0-9]{20}$/.test(n) || /^[0-9]{22}$/.test(n)) {
    return undefined;
  }
  return undefined;
}

/**
 * Tracking shapes that carriers use and that rarely appear as anything else:
 * UPS 1Z numbers, UPU-style two letters + nine digits + two letters, and two
 * letters followed by a long run of digits (DHL and postal numbers). Plain digit
 * runs are left out here, because invoices and phone numbers look the same.
 */
export function looksLikeCarrierTracking(value: string): boolean {
  const n = normalizeTracking(value);
  return /^1Z[A-Z0-9]{16}$/.test(n) || /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(n) || /^[A-Z]{2,3}[0-9]{10,20}$/.test(n);
}

/**
 * The official-pack entry for a domain. A subdomain of an official domain
 * (alerts.ups.com) counts; a lookalike that only contains it
 * (ups.com.parcel-desk.example) does not.
 */
export function findOfficialDomain(pack: OfficialPack, domain: string): OfficialPack["officialDomains"][number] | undefined {
  const normalized = normalizeDomain(domain);
  if (!normalized) return undefined;
  return pack.officialDomains.find((entry) => {
    const official = normalizeDomain(entry.domain);
    return normalized === official || normalized.endsWith(`.${official}`);
  });
}
