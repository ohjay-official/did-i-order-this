export function normalizeTracking(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeOrderId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

/** Conservative patterns used only as a cross-check on cited numbers. */
export function looksLikeTracking(value: string): boolean {
  const n = normalizeTracking(value);
  if (/^1Z[A-Z0-9]{16}$/.test(n)) return true;
  if (/^[0-9]{12,22}$/.test(n)) return true;
  if (/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(n)) return true;
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
