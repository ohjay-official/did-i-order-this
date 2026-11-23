import type { SenderCheck } from "@did-i-order-this/core";
import type { ExtractedEmail } from "./messages.ts";

/**
 * The extension reads the sender from Gmail's own record of the address, so a
 * one-sender thread counts as verified. A thread with more than one sender
 * domain does not: the first sender cannot vouch for the rest, so it never
 * gets Safe.
 */
export function senderCheckForEmail(email: Pick<ExtractedEmail, "mixedSenders">): SenderCheck {
  return email.mixedSenders ? "mixed_thread" : "verified";
}
