import type { SenderCheck } from "@did-i-order-this/core";
import type { ExtractedEmail } from "./messages.ts";

/**
 * The extension reads the sender from Gmail's own record of the address, so a
 * one-sender thread counts as verified, unless:
 * - the page is not Gmail (the extension's test page): "fixture";
 * - Gmail shows the message in Spam, with a warning banner, or with a "via"
 *   sender, or Gmail is shown in a language those checks can't read: "flagged";
 * - the thread has more than one sender domain: "mixed_thread".
 * Each of these caps a match at Neutral.
 */
export function senderCheckForEmail(email: Pick<ExtractedEmail, "mixedSenders" | "gmailFlags" | "fixture">): SenderCheck {
  if (email.fixture) return "fixture";
  if (email.gmailFlags?.length) return "flagged";
  return email.mixedSenders ? "mixed_thread" : "verified";
}

/** Everything the verdict needs from the extracted email besides the text. */
export function verdictOptionsForEmail(email: ExtractedEmail) {
  return {
    emailText: email.text,
    senderCheck: senderCheckForEmail(email),
    linkHosts: email.linkHosts ?? [],
    imageHosts: email.imageHosts ?? [],
    hiddenText: email.hiddenText === true,
    hiddenAny: email.hiddenAny === true,
    truncated: email.truncated === true,
    unreadContent: email.unreadContent === true,
  };
}
