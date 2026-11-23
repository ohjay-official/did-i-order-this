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

/**
 * Whether text at this point of the tree is hidden, given what its ancestors
 * set. display:none, the hidden attribute, opacity 0 and a zero-size box with
 * overflow hidden hide everything inside them. visibility and font size are
 * inherited, so a child can set them back (a visible child of a
 * visibility:hidden parent is shown). Offsets add up along the tree, so a
 * child can move text back on screen.
 */
interface HideState {
  hidden: boolean;
  visible: boolean;
  fontPx: number;
  offX: number;
  offY: number;
}

const SHOWN: HideState = { hidden: false, visible: true, fontPx: 16, offX: 0, offY: 0 };

function styleValue(element: Element, name: string): string {
  const inline = (element as HTMLElement).style?.getPropertyValue?.(name)?.trim().toLowerCase() ?? "";
  if (inline) return inline;
  try {
    return element.ownerDocument?.defaultView?.getComputedStyle?.(element)?.getPropertyValue(name)?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function offset(element: Element, names: string[]): number {
  let sum = 0;
  for (const name of names) {
    const n = px(styleValue(element, name));
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

function nextHideState(element: Element, parent: HideState): HideState {
  let hidden = parent.hidden || element.hasAttribute("hidden");
  if (styleValue(element, "display") === "none") hidden = true;
  const opacity = styleValue(element, "opacity");
  if (opacity !== "" && px(opacity) === 0) hidden = true;
  const overflowHidden = ["overflow", "overflow-x", "overflow-y"].some((name) => styleValue(element, name) === "hidden");
  if (overflowHidden && ["max-height", "height", "width", "max-width"].some((name) => px(styleValue(element, name)) === 0)) hidden = true;
  // A real browser also knows about rules this walk cannot see.
  const check = (element as Element & { checkVisibility?: (options?: object) => boolean }).checkVisibility;
  if (typeof check === "function") {
    try {
      if (!check.call(element, { opacityProperty: true, visibilityProperty: true })) hidden = true;
    } catch {
      // Older browsers: the style rules above still apply.
    }
  }
  const visibility = styleValue(element, "visibility");
  const visible = visibility ? !(visibility === "hidden" || visibility === "collapse") : parent.visible;
  const font = styleValue(element, "font-size");
  let fontPx = parent.fontPx;
  const size = px(font);
  if (font && Number.isFinite(size)) {
    if (/(?:r?em)$/.test(font)) fontPx = parent.fontPx * size;
    else if (font.endsWith("%")) fontPx = (parent.fontPx * size) / 100;
    else fontPx = size;
  }
  return {
    hidden,
    visible,
    fontPx,
    offX: parent.offX + offset(element, ["left", "margin-left", "text-indent"]),
    offY: parent.offY + offset(element, ["top", "margin-top"]),
  };
}

function isHiddenState(state: HideState): boolean {
  return state.hidden || !state.visible || state.fontPx < 2 || state.offX <= -1000 || state.offY <= -1000;
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

/**
 * The text a reader sees in one message body, plus what was hidden. The walk
 * goes into hidden elements too and tests every text node against the styles
 * of all its ancestors, so a visible child inside a hidden parent is read.
 */
function inFoldOf(element: Element, folded: boolean): boolean {
  return folded || element.matches(GMAIL_FOLDED);
}

function readVisible(root: Element): BodyRead {
  const parts: string[] = [];
  let visibleLetters = 0;
  let hiddenLetters = 0;
  let hiddenAfterVisible = false;
  const walk = (node: Node, state: HideState, folded: boolean) => {
    if (node.nodeType === 3) {
      const data = node.nodeValue ?? "";
      const letters = letterCount(data);
      if (!isHiddenState(state)) {
        parts.push(data);
        visibleLetters += letters;
      } else if (!folded) {
        hiddenLetters += letters;
        if (letters >= 3 && visibleLetters > 0) hiddenAfterVisible = true;
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (SKIP_TAGS.has(element.tagName)) return;
    const next = nextHideState(element, state);
    // Round 6: an image's alt and title text is shown to the reader (or read
    // aloud) and can carry a lure, so it is read like text.
    if (element.tagName === "IMG" || element.tagName === "AREA" || (element.tagName === "INPUT" && element.getAttribute("type") === "image")) {
      const said = [element.getAttribute("alt"), element.getAttribute("title")].filter(Boolean).join(" ");
      if (said.trim()) walk(element.ownerDocument.createTextNode(` ${said} `), next, inFoldOf(element, folded));
      return;
    }
    const inFold = folded || element.matches(GMAIL_FOLDED);
    const block = BLOCK_TAGS.has(element.tagName);
    if (block) parts.push("\n");
    for (const child of [...element.childNodes]) walk(child, next, inFold);
    if (block) parts.push("\n");
  };
  walk(root, SHOWN, false);
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
  // The Spam, banner and "via" checks read English. In Gmail shown in another
  // language they could miss a warning, so the message can't be Safe.
  const lang = (doc.documentElement?.getAttribute("lang") ?? "").trim().toLowerCase();
  const onGmail = (doc.location?.hostname ?? "") === "mail.google.com";
  if (lang ? !lang.startsWith("en") : onGmail) flags.add("foreign_ui");

  return [...flags];
}

/**
 * The domain of a plain address: the part after its only "@". An address with
 * more than one "@", a quote, a space or brackets (a quoted local part such as
 * "alerts@ups.com"@evil.example) gives no domain, so it is never official.
 */
export function domainOfAddress(address: string): string {
  const value = address.trim();
  if ((value.match(/@/g) ?? []).length !== 1) return "";
  if (/["'\s<>()[\]\\,;:]/.test(value)) return "";
  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) ? domain : "";
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
  const fromDomain = domainOfAddress(fromEmail);
  // An expanded thread can hold messages from more than one sender. The first
  // sender cannot vouch for a later one's text, so such a thread is marked.
  const senderDomains = new Set(
    [...main.querySelectorAll("span.gD[email]")]
      .map((element) => (element.getAttribute("email") ?? "").trim().toLowerCase())
      .filter((address) => address.includes("@"))
      .map((address) => domainOfAddress(address) || `unreadable:${address}`),
  );
  const mixedSenders = [...senderDomains].some((domain) => domain !== fromDomain);
  const hiddenLetters = reads.reduce((sum, read) => sum + read.hiddenLetters, 0);
  const hiddenText = reads.some((read) => read.hiddenAfterVisible) || hiddenLetters > MAX_HIDDEN_LETTERS;
  // Any hidden words at all (a preheader too) stop Safe; only a mismatch counts as a risky ask.
  const hiddenAny = hiddenLetters > 0;
  const { linkHosts, imageHosts } = readTargets(bodies);
  const gmailFlags = readGmailFlags(doc, main, bodies);
  // Round 6: attachments and embedded frames are not read, so they could hold
  // the real ask. A message with either can't be Safe.
  const unreadContent = Boolean(main.querySelector(".aQH, [download_url], .aZo")) || bodies.some((el) => el.querySelector("iframe, object, embed, frame") !== null);
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
    ...(hiddenAny ? { hiddenAny: true } : {}),
    ...(unreadContent ? { unreadContent: true } : {}),
    ...(gmailFlags.length ? { gmailFlags } : {}),
  };
}
