import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { OrderHistoryParseError, parseCsv, parseOrderHistoryFile } from "./importCsv.ts";

const enc = (text: string) => new TextEncoder().encode(text);

describe("order history import edge cases", () => {
  it("handles quoted commas, escaped quotes, CRLF and blank lines", () => {
    const { headers, rows } = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n,\nlast,row');
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["x, y", 'say "hi"'], ["last", "row"]]);
  });

  it("rejects empty input with a plain message", () => {
    expect(() => parseCsv("\n\n")).toThrow(OrderHistoryParseError);
    expect(() => parseOrderHistoryFile({ name: "a.csv", bytes: new Uint8Array() })).toThrow("This file is empty.");
    expect(() => parseOrderHistoryFile({ name: "a.pdf", bytes: enc("x") })).toThrow("not recognised");
  });

  it("decodes UTF-16 little-endian files from spreadsheet exports", () => {
    const text = "Order ID,Merchant,Tracking\nG-1,Shop,UPS (1Z999AA10123456784)\n";
    const body = new Uint8Array(text.length * 2 + 2);
    body[0] = 0xff;
    body[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) body[2 + i * 2] = text.charCodeAt(i);
    const result = parseOrderHistoryFile({ name: "orders.csv", bytes: body });
    expect(result.orders[0].orderId).toBe("G-1");
    expect(result.shipments[0]).toMatchObject({ carrier: "UPS", trackingNumber: "1Z999AA10123456784" });
  });

  it("reads tracking written as 'Carrier: number' or a bare number, and dedupes", () => {
    const csv = [
      "Order ID,Merchant,Tracking Number,Website",
      "A-1,Shop,DHL: GM123456789012345,https://www.shop.example/orders",
      "A-1,Shop,DHL: GM123456789012345,shop.example",
      "A-2,Other Store,1Z999AA10123456784,",
      "A-3,,not a number,",
    ].join("\n");
    const result = parseOrderHistoryFile({ name: "orders.txt", bytes: enc(csv) });
    expect(result.orders.map((order) => order.orderId)).toEqual(["A-1", "A-2", "A-3"]);
    expect(result.orders[0].senderDomain).toBe("shop.example");
    expect(result.shipments).toHaveLength(2);
    expect(result.shipments[0]).toMatchObject({ carrier: "DHL", trackingNumber: "GM123456789012345", expected: true });
    expect(result.shipments[1].carrier).toBe("UPS");
  });

  it("explains a ZIP with no order CSV and a damaged ZIP", () => {
    const zip = zipSync({ "readme.txt": strToU8("nothing here") });
    expect(() => parseOrderHistoryFile({ name: "data.zip", bytes: zip })).toThrow("does not contain a recognised");
    expect(() => parseOrderHistoryFile({ name: "data.zip", bytes: enc("not a zip") })).toThrow("could not be read");
  });

  it("refuses a CSV that has headers but no orders", () => {
    expect(() => parseOrderHistoryFile({ name: "x.csv", bytes: enc("Order ID,Merchant\n") })).toThrow(OrderHistoryParseError);
  });
});
