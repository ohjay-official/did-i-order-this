import { unzipSync } from "fflate";
import { inferCarrierFromTracking, looksLikeTracking, normalizeDomain, normalizeOrderId, normalizeTracking } from "./normalize.ts";
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
  const prefixed = value.match(/^([A-Za-z][A-Za-z0-9 .-]*?)\s*[:\-]\s*(.+)$/);
  if (prefixed && looksLikeTracking(prefixed[2])) {
    return { carrier: prefixed[1].trim(), trackingNumber: normalizeTracking(prefixed[2]) };
  }
  if (looksLikeTracking(value)) {
    return { trackingNumber: normalizeTracking(value), carrier: inferCarrierFromTracking(value) };
  }
  return {};
}

function domainFromWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
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
  const emailCol = findColumn(headers, ["to email address", "from email address"]);
  const confirmedAt = nowIso();
  const orders: LedgerOrder[] = [];

  for (const row of rows) {
    const status = cell(row, statusCol).toLowerCase();
    if (status && status !== "completed") continue;
    const type = cell(row, typeCol).toLowerCase();
    if (type.includes("bank") || type.includes("withdraw") || type.includes("general currency conversion") || type.includes("hold")) continue;
    const merchant = cell(row, nameCol);
    const orderId = normalizeOrderId(cell(row, invoiceCol) || cell(row, txCol));
    if (!merchant || !orderId) continue;
    const email = cell(row, emailCol);
    const domain = email.includes("@") ? normalizeDomain(email.split("@")[1] ?? "") : "";
    const gross = cell(row, grossCol).replace(/,/g, "");
    const amount = gross.startsWith("-") ? gross.slice(1) : gross || undefined;
    orders.push({
      id: newId(),
      merchant,
      senderDomain: domain || `${merchant.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
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
  const confirmedAt = nowIso();
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
        senderDomain: domainFromWebsite(cell(row, domainCol)) || `${(merchant || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
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

function csvFromZip(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new OrderHistoryParseError("This ZIP file could not be read. It may be damaged or not a ZIP.");
  }
  const names = Object.keys(files).filter((name) => !name.endsWith("/") && !name.includes("__MACOSX"));
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
  if (name.endsWith(".zip")) {
    return parseCsvText(csvFromZip(file.bytes));
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsvText(decodeText(file.bytes));
  }
  throw new OrderHistoryParseError("Import accepts an Amazon data-request ZIP or Retail.OrderHistory CSV, a PayPal activity CSV, or a generic CSV. This file type is not recognised.");
}
