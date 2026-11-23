import { describe, expect, it } from "vitest";
import {
  EXPECTED_WINDOW_DAYS,
  ManualTrackingError,
  expectedUntilFrom,
  importedExpectation,
  isExpectedShipment,
  makeExpectedShipment,
  parseOrderDate,
  parseOrderHistoryFile,
  type LedgerShipment,
} from "./index.ts";

const now = new Date("2026-11-23T12:00:00Z");
const DAY = 86_400_000;
const base: LedgerShipment = { id: "s", trackingNumber: "1Z999AA10123456784", expected: true, source: "import", confirmedAt: now.toISOString() };

describe("expected parcels expire (round 5, M1)", () => {
  it("a parcel with no expiry stays expected; one past its date does not", () => {
    expect(isExpectedShipment(base, now)).toBe(true);
    expect(isExpectedShipment({ ...base, expectedUntil: new Date(now.getTime() + DAY).toISOString() }, now)).toBe(true);
    expect(isExpectedShipment({ ...base, expectedUntil: new Date(now.getTime() - DAY).toISOString() }, now)).toBe(false);
    expect(isExpectedShipment({ ...base, expected: false }, now)).toBe(false);
    expect(isExpectedShipment({ ...base, expectedUntil: "not a date" }, now)).toBe(true);
  });
  it("an imported order older than the window is not expected; a recent one is, until the window ends", () => {
    expect(importedExpectation("2026-09-01", now)).toEqual({ expected: false });
    const recent = importedExpectation("2026-11-20", now);
    expect(recent.expected).toBe(true);
    expect(recent.expectedUntil).toBe(expectedUntilFrom(new Date("2026-11-20")));
    const noDate = importedExpectation(undefined, now);
    expect(noDate.expectedUntil).toBe(expectedUntilFrom(now));
    const future = importedExpectation("2027-05-01", now);
    expect(future.expectedUntil).toBe(expectedUntilFrom(now));
    expect(parseOrderDate("garbage")).toBeUndefined();
    expect(parseOrderDate("11/20/2026")?.getUTCFullYear()).toBe(2026);
  });
  it("Amazon: closed, cancelled, canceled, delivered and old orders are not expected", () => {
    const recent = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
    const old = new Date(Date.now() - (EXPECTED_WINDOW_DAYS + 5) * DAY).toISOString().slice(0, 10);
    const csv = [
      "Website,Order ID,Order Date,Currency,Unit Price,Order Status,Carrier Name & Tracking Number",
      `Amazon.com,111-0000001-0000001,${recent},USD,10.00,Closed,UPS(1Z999AA10000000001)`,
      `Amazon.com,111-0000001-0000002,${recent},USD,10.00,Cancelled,UPS(1Z999AA10000000002)`,
      `Amazon.com,111-0000001-0000003,${recent},USD,10.00,Canceled,UPS(1Z999AA10000000003)`,
      `Amazon.com,111-0000001-0000004,${recent},USD,10.00,Delivered,UPS(1Z999AA10000000004)`,
      `Amazon.com,111-0000001-0000005,${old},USD,10.00,Shipped,UPS(1Z999AA10000000005)`,
      `Amazon.com,111-0000001-0000006,${recent},USD,10.00,Shipped,UPS(1Z999AA10000000006)`,
    ].join("\n");
    const parsed = parseOrderHistoryFile({ name: "Retail.OrderHistory.1.csv", bytes: new TextEncoder().encode(csv) });
    const expected = parsed.shipments.filter((s) => isExpectedShipment(s)).map((s) => s.trackingNumber);
    expect(parsed.shipments).toHaveLength(6);
    expect(expected).toEqual(["1Z999AA10000000006"]);
  });
  it("generic CSV: the same age rule, and an expiry on every expected row", () => {
    const recent = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
    const old = new Date(Date.now() - (EXPECTED_WINDOW_DAYS + 5) * DAY).toISOString().slice(0, 10);
    const csv = [
      "order_id,merchant,date,amount,currency,tracking,domain",
      `A-1,Shop,${old},5.00,USD,1Z999AA10000000007,shop.example`,
      `A-2,Shop,${recent},5.00,USD,1Z999AA10000000008,shop.example`,
      `A-3,Shop,,5.00,USD,1Z999AA10000000009,shop.example`,
    ].join("\n");
    const parsed = parseOrderHistoryFile({ name: "orders.csv", bytes: new TextEncoder().encode(csv) });
    const byNumber = Object.fromEntries(parsed.shipments.map((s) => [s.trackingNumber, s]));
    expect(isExpectedShipment(byNumber["1Z999AA10000000007"])).toBe(false);
    expect(isExpectedShipment(byNumber["1Z999AA10000000008"])).toBe(true);
    expect(byNumber["1Z999AA10000000008"].expectedUntil).toBeTruthy();
    expect(isExpectedShipment(byNumber["1Z999AA10000000009"])).toBe(true);
    expect(byNumber["1Z999AA10000000009"].expectedUntil).toBeTruthy();
  });
});

describe("adding one tracking number by hand", () => {
  it("normalises the number, reads the carrier, and sets a 30-day window", () => {
    const s = makeExpectedShipment({ trackingNumber: " 1z999aa1-0123456784 " }, now, "id-1");
    expect(s).toEqual({
      id: "id-1",
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS",
      expected: true,
      expectedUntil: new Date(now.getTime() + EXPECTED_WINDOW_DAYS * DAY).toISOString(),
      source: "manual",
      confirmedAt: now.toISOString(),
    });
  });
  it("keeps a carrier the person named, and accepts letter-led numbers", () => {
    expect(makeExpectedShipment({ trackingNumber: "H01KTA0012345678", carrier: "Evri" }, now).carrier).toBe("Evri");
  });
  it("refuses empty, short, symbol and digit-poor input", () => {
    for (const bad of ["", "   ", "12345", "ABCDEFGHIJ", "1Z99!AA1012", "x".repeat(41)]) {
      expect(() => makeExpectedShipment({ trackingNumber: bad }, now)).toThrow(ManualTrackingError);
    }
  });
});
