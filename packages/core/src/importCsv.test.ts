import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OrderHistoryParseError, parseOrderHistoryFile } from "./importCsv.ts";

const testdata = join(dirname(fileURLToPath(import.meta.url)), "../../../testdata");

function load(name: string): { name: string; bytes: Uint8Array } {
  const path = join(testdata, name);
  return { name, bytes: new Uint8Array(readFileSync(path)) };
}

describe("parseOrderHistoryFile", () => {
  it("parses an Amazon-style Retail.OrderHistory CSV", () => {
    const result = parseOrderHistoryFile(load("amazon-order-history.sample.csv"));
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]?.orderId).toBe("111-1111111-1111111");
    expect(result.orders[0]?.merchant).toBe("Amazon");
    expect(result.orders[0]?.source).toBe("import");
    expect(result.shipments.some((item) => item.trackingNumber === "1Z999AA10111111111" && item.carrier === "UPS")).toBe(
      true,
    );
    const delivered = result.orders.find((item) => item.orderId === "111-2222222-2222222");
    expect(delivered?.status).toBe("delivered");
    const deliveredShipment = result.shipments.find((item) => item.orderId === "111-2222222-2222222");
    expect(deliveredShipment?.expected).toBe(false);
  });

  it("parses the same Amazon file from a ZIP", () => {
    const result = parseOrderHistoryFile(load("amazon-order-history.sample.zip"));
    expect(result.orders).toHaveLength(2);
    expect(result.shipments).toHaveLength(2);
  });

  it("parses a PayPal-style activity CSV and skips withdrawals", () => {
    const result = parseOrderHistoryFile(load("paypal-activity.sample.csv"));
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.merchant).toBe("Northwind Outfitters");
    expect(result.orders[0]?.orderId).toBe("NW-20001");
    expect(result.orders[0]?.amount).toBe("42.00");
    expect(result.shipments).toHaveLength(0);
  });

  it("parses a generic CSV with common columns", () => {
    const result = parseOrderHistoryFile(load("generic-orders.sample.csv"));
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]?.merchant).toBe("Harbor Goods");
    expect(result.shipments[0]?.trackingNumber).toBe("9400111899562537874999");
  });

  it("returns a clear error for a garbage file and does not upload", () => {
    expect(() => parseOrderHistoryFile(load("not-an-order-file.txt"))).toThrow(OrderHistoryParseError);
    expect(() => parseOrderHistoryFile({ name: "notes.pdf", bytes: new Uint8Array([1, 2, 3, 4]) })).toThrow(
      /not recognised/,
    );
    expect(() => parseOrderHistoryFile({ name: "empty.csv", bytes: new Uint8Array() })).toThrow(/empty/);
  });
});
