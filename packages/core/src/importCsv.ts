import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { inferCarrierFromTracking, isAsciiDomain, isFreeMailDomain, looksLikeTracking, normalizeDomain, normalizeOrderId, normalizeTracking } from "./normalize.ts";
import type { LedgerOrder, LedgerShipment } from "./types.ts";

export class OrderHistoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderHistoryParseError";
  }
}

export type OrderHistoryFile = { name: string; bytes: Uint8Array };

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function hasUtf16Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}

function decodeText(bytes: Uint8Array): string {
  if (hasUtf16Bom(bytes)) {
    const le = bytes[0] === 0xff;
    return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(bytes);
  }
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  if (rows.length === 0) {
    throw new OrderHistoryParseError("This file is empty or is not a recognised CSV.");
  }
  const headers = rows[0].map((header) => header.trim());
  return { headers, rows: rows.slice(1) };
}

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

function parseTrackingField(raw: string): { carrier?: string; trackingNumber?: string } {
  const value = raw.trim();
  if (!value) return {};
  const parenthetical = value.match(/^([A-Za-z][A-Za-z0-9 .-]*?)\s*\(([^)]+)\)\s*$/);
  if (parenthetical) {
    return {
      carrier: parenthetical[1].trim(),
      trackingNumber: normalizeTracking(parenthetical[2]),
    };
  }
  const prefixed = value.match(/^([A-Za-z][A-Za-z0-9 .-]*?)\s*[:-]\s*(.+)$/);
  if (prefixed && looksLikeTracking(prefixed[2])) {
    return { carrier: prefixed[1].trim(), trackingNumber: normalizeTracking(prefixed[2]) };
  }
  if (looksLikeTracking(value)) {
    return { trackingNumber: normalizeTracking(value), carrier: inferCarrierFromTracking(value) };
  }
  return {};
}

/** The domain part of an email address, or "" when the value is not one. */
function domainOfAddress(value: string): string {
  const at = value.lastIndexOf("@");
  return at >= 0 ? normalizeDomain(value.slice(at + 1).replace(/[>\s].*$/, "")) : "";
}

/**
 * A domain that can stand for a store: plain ASCII, not a free email domain
 * (anyone can send from gmail.com), and not the user's own address domain.
 */
function usableStoreDomain(domain: string, selfDomains: ReadonlySet<string> = new Set()): string {
  if (!domain || !isAsciiDomain(domain) || isFreeMailDomain(domain) || selfDomains.has(domain)) return "";
  return domain;
}

function placeholderDomain(merchant: string): string {
  return `${(merchant || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;
}

function domainFromWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return domainOfAddress(trimmed);
  try {
    if (trimmed.includes("://")) return normalizeDomain(new URL(trimmed).hostname);
  } catch {
    // Fall through and treat the value as a hostname or store name.
  }
  if (trimmed.includes(".")) return normalizeDomain(trimmed);
  return `${trimmed.toLowerCase().replace(/\s+/g, "")}.example`;
}

function detectFormat(headers: string[]): "amazon" | "paypal" | "generic" {
  const names = new Set(headers.map(normHeader));
  if (names.has("order id") && (names.has("website") || names.has("asin") || names.has("total owed"))) {
    return "amazon";
  }
  if (names.has("transaction id") && (names.has("gross") || names.has("from email address") || names.has("type"))) {
    return "paypal";
  }
  const hasOrder = findColumn(headers, ["order id", "orderid", "order number", "invoice number", "invoice id"]) >= 0;
  const hasMerchant = findColumn(headers, ["merchant", "store", "name", "seller"]) >= 0;
  if (hasOrder || hasMerchant) return "generic";
  throw new OrderHistoryParseError("This file is not a recognised Amazon, PayPal, or generic order-history CSV.");
}

function parseAmazon(headers: string[], rows: string[][]): { orders: LedgerOrder[]; shipments: LedgerShipment[] } {
  const orderIdCol = findColumn(headers, ["order id"]);
  const dateCol = findColumn(headers, ["order date"]);
  const statusCol = findColumn(headers, ["order status"]);
  const currencyCol = findColumn(headers, ["currency"]);
  const amountCol = findColumn(headers, ["total owed", "unit price"]);
  const websiteCol = findColumn(headers, ["website"]);
  const trackingCol = findColumn(headers, ["carrier name & tracking number", "carrier name and tracking number", "tracking number", "tracking id"]);
  const merchant = "Amazon";
  const ordersById = new Map<string, LedgerOrder>();
  const shipments: LedgerShipment[] = [];
  const seenTracking = new Set<string>();
  const confirmedAt = nowIso();

  for (const row of rows) {
    const orderIdRaw = cell(row, orderIdCol);
    if (!orderIdRaw) continue;
    const orderId = normalizeOrderId(orderIdRaw);
    if (!ordersById.has(orderId)) {
      const statusRaw = cell(row, statusCol).toLowerCase();
      const status =
        statusRaw.includes("refund")
          ? "refunded"
          : statusRaw.includes("deliver")
            ? "delivered"
            : statusRaw.includes("ship")
              ? "shipped"
              : statusRaw
                ? "placed"
                : "unknown";
      ordersById.set(orderId, {
        id: newId(),
        merchant,
        senderDomain: domainFromWebsite(cell(row, websiteCol)) || "amazon.com",
        orderId,
        amount: cell(row, amountCol) || undefined,
        currency: cell(row, currencyCol) || undefined,
        date: cell(row, dateCol) ? cell(row, dateCol).slice(0, 10) : undefined,
        status,
        source: "import",
        confirmedAt,
      });
    }
    const tracking = parseTrackingField(cell(row, trackingCol));
    if (tracking.trackingNumber && !seenTracking.has(tracking.trackingNumber)) {
      seenTracking.add(tracking.trackingNumber);
      shipments.push({
        id: newId(),
        trackingNumber: tracking.trackingNumber,
        carrier: tracking.carrier,
        orderId,
        merchant,
        expected: (ordersById.get(orderId)?.status ?? "") !== "delivered" && (ordersById.get(orderId)?.status ?? "") !== "refunded",
        source: "import",
        confirmedAt,
      });
    }
  }
  if (ordersById.size === 0) {
    throw new OrderHistoryParseError("The Amazon order-history file did not contain any orders.");
  }
  return { orders: [...ordersById.values()], shipments };
}

function parsePaypal(headers: string[], rows: string[][]): { orders: LedgerOrder[]; shipments: LedgerShipment[] } {
  const nameCol = findColumn(headers, ["name"]);
  const typeCol = findColumn(headers, ["type"]);
  const statusCol = findColumn(headers, ["status"]);
  const currencyCol = findColumn(headers, ["currency"]);
  const grossCol = findColumn(headers, ["gross"]);
  const dateCol = findColumn(headers, ["date"]);
  const txCol = findColumn(headers, ["transaction id"]);
  const invoiceCol = findColumn(headers, ["invoice number"]);
  const toCol = findColumn(headers, ["to email address"]);
  const fromCol = findColumn(headers, ["from email address"]);
  const confirmedAt = nowIso();
  const orders: LedgerOrder[] = [];

  // The user's own address domains: From on payments they sent, To on money
  // they received. Neither can stand for a store.
  const selfDomains = new Set<string>();
  for (const row of rows) {
    const gross = cell(row, grossCol).replace(/,/g, "");
    const self = gross.startsWith("-") ? cell(row, fromCol) : cell(row, toCol);
    const domain = domainOfAddress(self);
    if (domain) selfDomains.add(domain);
  }

  for (const row of rows) {
    const status = cell(row, statusCol).toLowerCase();
    if (status && status !== "completed") continue;
    const type = cell(row, typeCol).toLowerCase();
    if (type.includes("bank") || type.includes("withdraw") || type.includes("general currency conversion") || type.includes("hold")) continue;
    // Money the user received is not a purchase.
    if (type.includes("received")) continue;
    const merchant = cell(row, nameCol);
    const orderId = normalizeOrderId(cell(row, invoiceCol) || cell(row, txCol));
    if (!merchant || !orderId) continue;
    const gross = cell(row, grossCol).replace(/,/g, "");
    // A payment the user sent goes To the store; otherwise the store is in From.
    const storeAddress = gross.startsWith("-") || !gross ? cell(row, toCol) : cell(row, fromCol);
    const domain = usableStoreDomain(domainOfAddress(storeAddress), selfDomains);
    const amount = gross.startsWith("-") ? gross.slice(1) : gross || undefined;
    orders.push({
      id: newId(),
      merchant,
      senderDomain: domain || placeholderDomain(merchant),
      orderId,
      amount,
      currency: cell(row, currencyCol) || undefined,
      date: cell(row, dateCol) || undefined,
      status: "placed",
      source: "import",
      confirmedAt,
    });
  }
  if (orders.length === 0) {
    throw new OrderHistoryParseError("The PayPal activity file did not contain any completed payments.");
  }
  return { orders, shipments: [] };
}

function parseGeneric(headers: string[], rows: string[][]): { orders: LedgerOrder[]; shipments: LedgerShipment[] } {
  const orderCol = findColumn(headers, ["order id", "orderid", "order number", "invoice number", "invoice id"]);
  const merchantCol = findColumn(headers, ["merchant", "store", "name", "seller"]);
  const dateCol = findColumn(headers, ["date", "order date"]);
  const amountCol = findColumn(headers, ["amount", "total", "total owed"]);
  const currencyCol = findColumn(headers, ["currency"]);
  const trackingCol = findColumn(headers, ["tracking", "tracking number", "tracking id"]);
  const domainCol = findColumn(headers, ["domain", "sender", "sender domain", "website"]);
  const buyerCol = findColumn(headers, ["buyer email", "customer email", "email", "your email"]);
  const confirmedAt = nowIso();
  const selfDomains = new Set<string>();
  for (const row of rows) {
    const domain = domainOfAddress(cell(row, buyerCol));
    if (domain) selfDomains.add(domain);
  }
  const ordersById = new Map<string, LedgerOrder>();
  const shipments: LedgerShipment[] = [];
  const seenTracking = new Set<string>();

  for (const row of rows) {
    const merchant = cell(row, merchantCol);
    const orderRaw = cell(row, orderCol);
    if (!merchant && !orderRaw) continue;
    const orderId = normalizeOrderId(orderRaw || `imported-${newId().slice(0, 8)}`);
    if (!ordersById.has(orderId)) {
      ordersById.set(orderId, {
        id: newId(),
        merchant: merchant || "Unknown merchant",
        senderDomain: usableStoreDomain(domainFromWebsite(cell(row, domainCol)), selfDomains) || placeholderDomain(merchant),
        orderId,
        amount: cell(row, amountCol) || undefined,
        currency: cell(row, currencyCol) || undefined,
        date: cell(row, dateCol) || undefined,
        status: "unknown",
        source: "import",
        confirmedAt,
      });
    }
    const tracking = parseTrackingField(cell(row, trackingCol));
    if (tracking.trackingNumber && !seenTracking.has(tracking.trackingNumber)) {
      seenTracking.add(tracking.trackingNumber);
      shipments.push({
        id: newId(),
        trackingNumber: tracking.trackingNumber,
        carrier: tracking.carrier,
        orderId,
        merchant: ordersById.get(orderId)?.merchant,
        expected: true,
        source: "import",
        confirmedAt,
      });
    }
  }
  if (ordersById.size === 0) {
    throw new OrderHistoryParseError("The CSV did not contain any orders.");
  }
  return { orders: [...ordersById.values()], shipments };
}

function parseCsvText(text: string): { orders: LedgerOrder[]; shipments: LedgerShipment[] } {
  const { headers, rows } = parseCsv(text);
  const format = detectFormat(headers);
  if (format === "amazon") return parseAmazon(headers, rows);
  if (format === "paypal") return parsePaypal(headers, rows);
  return parseGeneric(headers, rows);
}

/** Order-history files are small. These caps keep a crafted file from filling the tab's memory. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_ENTRY_BYTES = 50 * 1024 * 1024;

class ZipEntryTooBig extends Error {}

/**
 * Inflate the CSV entries of a ZIP, checking the real inflated size as it
 * streams: the sizes a ZIP declares are written by whoever made the file and
 * can understate what an entry inflates to.
 */
function inflateCsvEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file: UnzipFile) => {
    if (!/\.csv$/i.test(file.name) || file.name.includes("__MACOSX") || file.name.endsWith("/")) return;
    if (file.originalSize !== undefined && file.originalSize > MAX_ZIP_ENTRY_BYTES) throw new ZipEntryTooBig();
    const chunks: Uint8Array[] = [];
    let total = 0;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      total += chunk.length;
      if (total > MAX_ZIP_ENTRY_BYTES) throw new ZipEntryTooBig();
      chunks.push(chunk);
      if (final) {
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of chunks) {
          out.set(part, offset);
          offset += part.length;
        }
        files[file.name] = out;
      }
    };
    file.start();
  };
  const step = 16 * 1024;
  for (let i = 0; i < bytes.length; i += step) {
    const end = Math.min(i + step, bytes.length);
    unzip.push(bytes.subarray(i, end), end === bytes.length);
  }
  return files;
}

function csvFromZip(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    // A ZIP starts with a local file header ("PK\x03\x04") or, when empty, an end record ("PK\x05\x06").
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("not a zip");
    files = inflateCsvEntries(bytes);
  } catch (error) {
    if (error instanceof ZipEntryTooBig) {
      throw new OrderHistoryParseError("A CSV in this ZIP inflates to more than 50 MB, which is too big for an order history. It was not imported.");
    }
    throw new OrderHistoryParseError("This ZIP file could not be read. It may be damaged or not a ZIP.");
  }
  const names = Object.keys(files);
  const preferred =
    names.find((name) => /retail\.orderhistory/i.test(name)) ||
    names.find((name) => /orderhistory/i.test(name)) ||
    names.find((name) => name.toLowerCase().endsWith(".csv"));
  if (!preferred) {
    throw new OrderHistoryParseError("The ZIP file does not contain a recognised order-history CSV.");
  }
  return decodeText(files[preferred]);
}

export function parseOrderHistoryFile(file: OrderHistoryFile): { orders: LedgerOrder[]; shipments: LedgerShipment[] } {
  const name = file.name.toLowerCase();
  if (file.bytes.length === 0) {
    throw new OrderHistoryParseError("This file is empty.");
  }
  if (file.bytes.length > MAX_IMPORT_BYTES) {
    throw new OrderHistoryParseError("This file is larger than 25 MB, which is too big for an order history. It was not imported.");
  }
  if (name.endsWith(".zip")) {
    return parseCsvText(csvFromZip(file.bytes));
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsvText(decodeText(file.bytes));
  }
  throw new OrderHistoryParseError("Import accepts an Amazon data-request ZIP or Retail.OrderHistory CSV, a PayPal activity CSV, or a generic CSV. This file type is not recognised.");
}
