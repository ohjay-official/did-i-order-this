import type { OfficialPack } from "./types.ts";

export function normalizeTracking(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeOrderId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Lower case, no "www.", no trailing dot. Only plain ASCII names are
 * normalised. A name with any other character (full-width letters, a soft
 * hyphen, an ideographic full stop, a non-breaking space, Cyrillic or Greek
 * letters, zero-width or other hidden characters) is returned unchanged, so it
 * never equals an official domain: a lookalike stays a lookalike instead of
 * being folded into the real brand. Punycode (xn--) names are ASCII and are
 * kept as they are, so they never match an official name either.
 */
export function normalizeDomain(value: string): string {
  const trimmed = value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (!isPlainAscii(trimmed)) return trimmed;
  return trimmed.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
}

function isPlainAscii(value: string): boolean {
  return /^[\x21-\x7e]*$/.test(value);
}

/** True for a normalised name made only of ASCII letters, digits, dots and hyphens. */
export function isAsciiDomain(value: string): boolean {
  return /^[a-z0-9.-]+$/.test(value) && !value.startsWith(".") && !value.includes("..");
}

/**
 * Free email services anyone can sign up to. Such a domain never proves which
 * store or seller sent an email, so it is never kept as a store domain on
 * import and never gives Safe for an order match.
 */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "rocketmail.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "protonmail.ch", "pm.me",
  "aol.com", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com", "zoho.com", "zohomail.com", "yandex.com",
  "yandex.ru", "mail.ru", "tutanota.com", "tuta.io", "fastmail.com", "hey.com", "qq.com", "163.com",
]);

export function isFreeMailDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (FREE_MAIL.has(d)) return true;
  // Country variants such as yahoo.co.uk, hotmail.fr or outlook.de.
  return /^(?:yahoo|hotmail|outlook|live|gmx|aol)\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(d);
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
  // Any character outside plain ASCII letters, digits, dots and hyphens means never official.
  if (!normalized || !isAsciiDomain(normalized)) return undefined;
  return pack.officialDomains.find((entry) => {
    const official = normalizeDomain(entry.domain);
    return normalized === official || normalized.endsWith(`.${official}`);
  });
}
