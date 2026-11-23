import { senderDomainFromHeader } from "@did-i-order-this/core";

/**
 * The sender's domain, read from the real address on the From line of the
 * header block (never the display name, and never an address in the body).
 */
export function extractFromDomain(emailText: string): string {
  return senderDomainFromHeader(emailText);
}
