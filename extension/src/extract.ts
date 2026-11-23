import { hostOfTarget } from "@did-i-order-this/core";
import type { ExtractedEmail, GmailFlag } from "./messages.ts";

function textContent(element: Element | null): string {
  return (element?.textContent ?? "").trim();
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK"]);
const BLOCK_TAGS = new Set([
  "P", "DIV", "BR", "LI", "UL", "OL", "TR", "TD", "TH", "TABLE", "TBODY", "THEAD", "SECTION", "ARTICLE",
  "HEADER", "FOOTER", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "CENTER", "FORM",
]);
/** Parts Gmail itself folds away (quoted replies, trimmed content). Not read, and not counted as a trick. */
const GMAIL_FOLDED = ".gmail_quote, .adL, .adm, .h5, .im, blockquote";

function px(value: string | null | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * True when an element is hidden from the reader: the hidden attribute, or a
 * style (inline or computed) of display:none, visibility:hidden, opacity 0,
 * a font size under 2px, a zero height or width with overflow hidden, or a
 * position far off screen. Text in such an element is not what the user sees.
 */
export function isHiddenElement(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true;
  const styles: { getPropertyValue(name: string): string }[] = [];
  const inline = (element as HTMLElement).style;
  if (inline) styles.push(inline);
  const view = element.ownerDocument?.defaultView;
  try {
    const computed = view?.getComputedStyle?.(element);
    if (computed) styles.push(computed);
  } catch {
    // A detached or foreign element has no computed style; the inline style still counts.
  }
  for (const style of styles) {
    const get = (name: string) => style.getPropertyValue(name).trim().toLowerCase();
    if (get("display") === "none") return true;
    if (get("visibility") === "hidden" || get("visibility") === "collapse") return true;
    const opacity = px(get("opacity"));
    if (get("opacity") !== "" && opacity === 0) return true;
    const font = get("font-size");
    if (font !== "" && px(font) < 2) return true;
    const overflowHidden = get("overflow") === "hidden" || get("overflow-x") === "hidden" || get("overflow-y") === "hidden";
    if (overflowHidden && (px(get("max-height")) === 0 || px(get("height")) === 0 || px(get("width")) === 0 || px(get("max-width")) === 0)) return true;
    for (const side of ["left", "top", "text-indent", "margin-left", "margin-top"]) {
      if (px(get(side)) <= -1000) return true;
    }
  }
  return false;
}

const LETTERS = /\p{L}/gu;

function letterCount(text: string): number {
  return (text.match(LETTERS) ?? []).length;
}

interface BodyRead {
  text: string;
  /** Hidden text that is not part of Gmail's own folding. */
  hiddenLetters: number;
  /** Hidden text with words in it appears after the visible text has started. */
  hiddenAfterVisible: boolean;
}

/** The text a reader sees in one message body, skipping hidden elements, plus what was hidden. */
function readVisible(root: Element): BodyRead {
  const parts: string[] = [];
  let visibleLetters = 0;
  let hiddenLetters = 0;
  let hiddenAfterVisible = false;
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const data = node.nodeValue ?? "";
      parts.push(data);
      visibleLetters += letterCount(data);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (SKIP_TAGS.has(element.tagName)) return;
    if (isHiddenElement(element)) {
      if (!element.matches(GMAIL_FOLDED) && !element.closest(GMAIL_FOLDED)) {
        const letters = letterCount(element.textContent ?? "");
        hiddenLetters += letters;
        if (letters >= 3 && visibleLetters > 0) hiddenAfterVisible = true;
      }
      return;
    }
    const block = BLOCK_TAGS.has(element.tagName);
    if (block) parts.push("\n");
    for (const child of [...element.childNodes]) walk(child);
    if (block) parts.push("\n");
  };
  walk(root);
  const text = parts
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, hiddenLetters, hiddenAfterVisible };
}

/** More hidden text than this, anywhere in the thread, counts as a trick even before any visible text. */
export const MAX_HIDDEN_LETTERS = 500;

function addHost(set: Set<string>, target: string | null) {
  if (target === null) return;
  const host = hostOfTarget(target);
  if (host) set.add(host);
}

/** Link and form targets, and image sources, under the message bodies. Gmail's redirects are unwrapped. */
function readTargets(bodies: Element[]): { linkHosts: string[]; imageHosts: string[] } {
  const links = new Set<string>();
  const images = new Set<string>();
  for (const body of bodies) {
    for (const el of body.querySelectorAll("a[href], area[href]")) addHost(links, el.getAttribute("href"));
    for (const el of body.querySelectorAll("form[action]")) addHost(links, el.getAttribute("action"));
    for (const el of body.querySelectorAll("[formaction]")) addHost(links, el.getAttribute("formaction"));
    for (const el of body.querySelectorAll("img[src], input[type=image][src]")) addHost(images, el.getAttribute("src"));
    for (const el of body.querySelectorAll("img[srcset], source[srcset]")) {
      for (const candidate of (el.getAttribute("srcset") ?? "").split(",")) addHost(images, candidate.trim().split(/\s+/)[0] ?? "");
    }
    for (const el of body.querySelectorAll("[background]")) addHost(images, el.getAttribute("background"));
    for (const el of body.querySelectorAll("[style*='url(' i]")) {
      for (const m of (el.getAttribute("style") ?? "").matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) addHost(images, m[1]);
    }
  }
  return { linkHosts: [...links].slice(0, 200), imageHosts: [...images].slice(0, 200) };
}

const WARNING_BANNERS = [
  /why is this message in spam/i,
  /be careful with this message/i,
  /this message seems dangerous/i,
  /similar to messages that were identified as spam/i,
  /this message might be suspicious/i,
  /gmail could not verify that it actually came from/i,
  /this could be a spoofed message/i,
];

/**
 * What Gmail itself says about the open message: it is in Spam (the URL or a
 * Spam label), it shows a warning banner, or the sender line says "via"
 * another domain. Any of these means the From line it shows cannot vouch for
 * the message. Only Gmail's own interface is read, never the message bodies.
 */
export function readGmailFlags(doc: Document, main: Element | Document, bodies: Element[]): GmailFlag[] {
  const flags = new Set<GmailFlag>();
  const hash = (doc.location?.hash ?? "").toLowerCase();
  if (hash.startsWith("#spam")) flags.add("spam");
  const outsideBodies = (el: Element) => !bodies.some((body) => body.contains(el));
  for (const el of main.querySelectorAll("div, span, td, a")) {
    if (!outsideBodies(el) || el.children.length > 3) continue;
    const own = (el.textContent ?? "").trim();
    if (!own || own.length > 400) continue;
    if (own === "Spam") flags.add("spam");
    if (WARNING_BANNERS.some((re) => re.test(own))) flags.add("warning");
  }
  const sender = main.querySelector("span.gD[email]");
  const header = sender?.closest("h3, .gE, tr, table") ?? sender?.parentElement;
  const headerText = header && outsideBodies(header) ? header.textContent ?? "" : "";
  if (/\bvia\s+[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(headerText)) flags.add("via");
  return [...flags];
}

export function extractOpenGmailThread(doc: Document): ExtractedEmail | null {
  const main = doc.querySelector('[role="main"]') ?? doc;
  const subject = textContent(
    main.querySelector("h2.hP") || main.querySelector("h2[data-thread-perm-id]") || main.querySelector("h2"),
  );
  // Only Gmail's sender element counts. A generic span[email] can be a recipient
  // chip ("to me"), so there is no fallback to it.
  const fromEl = main.querySelector("span.gD[email]");
  const fromEmail = (fromEl?.getAttribute("email") ?? "").trim();
  // The display name is chosen by the sender. Strip angle brackets and quotes so
  // a name like "UPS <alerts@ups.com>" cannot pose as the address on the From line.
  const fromName = textContent(fromEl).replace(/[<>"]/g, " ").replace(/\s+/g, " ").trim() || fromEmail;
  const dateEl = main.querySelector("span.g3");
  const date = dateEl?.getAttribute("title") || textContent(dateEl);
  // div.a3s.aiL is also a div.a3s; keep only outermost bodies so nothing is read twice.
  const all = [...main.querySelectorAll("div.a3s")];
  const bodies = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  const reads = bodies.map(readVisible);
  const body = reads
    .map((read) => read.text)
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
  const hiddenLetters = reads.reduce((sum, read) => sum + read.hiddenLetters, 0);
  const hiddenText = reads.some((read) => read.hiddenAfterVisible) || hiddenLetters > MAX_HIDDEN_LETTERS;
  const { linkHosts, imageHosts } = readTargets(bodies);
  const gmailFlags = readGmailFlags(doc, main, bodies);
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
    ...(linkHosts.length ? { linkHosts } : {}),
    ...(imageHosts.length ? { imageHosts } : {}),
    ...(hiddenText ? { hiddenText: true } : {}),
    ...(gmailFlags.length ? { gmailFlags } : {}),
  };
}
