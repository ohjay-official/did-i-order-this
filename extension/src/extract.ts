import type { ExtractedEmail } from "./messages.ts";

function textContent(element: Element | null): string {
  return (element?.textContent ?? "").trim();
}

function extractEmail(raw: string): string {
  const match = raw.replace(/[<>()]/g, " ").match(/[^\s@]+@[^\s@]+/);
  return match?.[0] ?? "";
}

export function extractOpenGmailThread(doc: Document): ExtractedEmail | null {
  const main = doc.querySelector('[role="main"]') ?? doc;
  const subject = textContent(
    main.querySelector("h2.hP") || main.querySelector("h2[data-thread-perm-id]") || main.querySelector("h2"),
  );
  const fromEl =
    main.querySelector("span.gD[email]") ||
    main.querySelector("span[email]") ||
    main.querySelector("span.gD");
  const fromEmail = (fromEl?.getAttribute("email") ?? "").trim() || extractEmail(textContent(main.querySelector("span.go")));
  // The display name is chosen by the sender. Strip angle brackets and quotes so
  // a name like "UPS <alerts@ups.com>" cannot pose as the address on the From line.
  const fromName = (textContent(fromEl).replace(/[<>"]/g, " ").replace(/\s+/g, " ").trim()) || fromEmail;
  const dateEl = main.querySelector("span.g3");
  const date = dateEl?.getAttribute("title") || textContent(dateEl);
  const bodies = [...main.querySelectorAll("div.a3s.aiL, div.a3s")];
  const body = bodies
    .map((element) => textContent(element))
    .filter(Boolean)
    .join("\n\n");
  if (!subject && !body) return null;
  const fromDomain = fromEmail.includes("@") ? (fromEmail.split("@")[1] ?? "").toLowerCase() : "";
  // An expanded thread can hold messages from more than one sender. The first
  // sender cannot vouch for a later one's text, so such a thread is marked.
  const senderDomains = new Set(
    [...main.querySelectorAll("span.gD[email]")]
      .map((element) => (element.getAttribute("email") ?? "").trim().toLowerCase())
      .filter((address) => address.includes("@"))
      .map((address) => address.slice(address.lastIndexOf("@") + 1)),
  );
  const mixedSenders = [...senderDomains].some((domain) => domain !== fromDomain);
  const lines = [
    `From: ${fromName}${fromEmail ? ` <${fromEmail}>` : ""}`,
    `Subject: ${subject}`,
    date ? `Date: ${date}` : "",
    "",
    body,
  ].filter((line, index, all) => line !== "" || all[index - 1] === "");
  return {
    text: lines.join("\n").trim(),
    fromDomain,
    subject,
    fromEmail,
    fromName,
    ...(mixedSenders ? { mixedSenders: true } : {}),
  };
}
