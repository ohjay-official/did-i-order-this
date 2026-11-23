import { inferCarrierFromTracking, normalizeTracking } from "./normalize.ts";
import type { LedgerShipment } from "./types.ts";

/** How long a parcel counts as expected after its order date, an import, or a manual entry. */
export const EXPECTED_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a stored parcel is still expected: marked expected, and its
 * expectedUntil date (when it has one) is not past. An old parcel that never
 * arrived stops counting, so the "not expecting any parcel" check works again.
 */
export function isExpectedShipment(shipment: LedgerShipment, now: Date = new Date()): boolean {
  if (shipment.expected !== true) return false;
  // Round 6: a row with no end date or an unreadable one (saved before expectedUntil
  // existed) counts for EXPECTED_WINDOW_DAYS after confirmedAt, and never forever.
  const until = Date.parse(shipment.expectedUntil ?? "");
  if (Number.isFinite(until)) return until > now.getTime();
  const confirmed = Date.parse(shipment.confirmedAt ?? "");
  return Number.isFinite(confirmed) && confirmed + EXPECTED_WINDOW_DAYS * DAY_MS > now.getTime();
}

/** The end of the expected window that starts at `from` (an order date or now). */
export function expectedUntilFrom(from: Date): string {
  return new Date(from.getTime() + EXPECTED_WINDOW_DAYS * DAY_MS).toISOString();
}

/** A date from an order file ("2026-11-20", "11/20/2026", "20 Nov 2026"), or undefined. */
export function parseOrderDate(value: string | undefined): Date | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

/**
 * Expected or not for an imported parcel, from its order date: an order older
 * than EXPECTED_WINDOW_DAYS is history, not a parcel on its way.
 */
export function importedExpectation(orderDate: string | undefined, now: Date = new Date()): { expected: boolean; expectedUntil?: string } {
  const date = parseOrderDate(orderDate);
  const start = date && date.getTime() <= now.getTime() ? date : now;
  const until = expectedUntilFrom(start);
  if (Date.parse(until) <= now.getTime()) return { expected: false };
  return { expected: true, expectedUntil: until };
}

export class ManualTrackingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualTrackingError";
  }
}

export interface ManualTrackingInput {
  trackingNumber: string;
  /** Optional carrier name; otherwise read from the number's shape (1Z is UPS). */
  carrier?: string;
}

/**
 * One tracking number the person typed in because they are waiting for it.
 * Stored as expected for EXPECTED_WINDOW_DAYS. The number must look like a
 * tracking number (letters and digits, 8 to 40 long, at least 6 digits).
 */
export function makeExpectedShipment(input: ManualTrackingInput, now: Date = new Date(), id: string = crypto.randomUUID()): LedgerShipment {
  const trackingNumber = normalizeTracking(input.trackingNumber ?? "");
  if (!trackingNumber) throw new ManualTrackingError("Type the tracking number you are waiting for.");
  if (!/^[A-Z0-9]{8,40}$/.test(trackingNumber) || (trackingNumber.match(/\d/g) ?? []).length < 6) {
    throw new ManualTrackingError("That does not look like a tracking number. Copy it from the store's or carrier's own site.");
  }
  const carrier = input.carrier?.trim().slice(0, 60) || inferCarrierFromTracking(trackingNumber);
  return {
    id,
    trackingNumber,
    ...(carrier ? { carrier } : {}),
    expected: true,
    expectedUntil: expectedUntilFrom(now),
    source: "manual",
    confirmedAt: now.toISOString(),
  };
}
