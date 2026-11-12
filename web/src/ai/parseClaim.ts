import type { AskedAction, ClaimedRole, EmailClaim, EmailKind, NumberKind } from "@did-i-order-this/core";

const roles: ClaimedRole[] = ["carrier", "merchant", "bank", "subscription", "unknown"];
const actions: AskedAction[] = ["pay", "log_in", "confirm", "download", "none", "other"];
const kinds: NumberKind[] = ["tracking", "order", "invoice", "subscription", "account", "other"];
const emailKinds: EmailKind[] = [
  "shipment_notice",
  "carrier_update",
  "receipt",
  "renewal",
  "invoice",
  "refund",
  "delivery_problem",
  "other",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isEmailClaim(value: unknown): value is EmailClaim {
  if (!isObject(value)) return false;
  if (!isObject(value.claimed_party)) return false;
  const party = value.claimed_party;
  if (typeof party.name !== "string" || party.name.trim() === "") return false;
  if (!roles.includes(party.role as ClaimedRole)) return false;
  if (party.domain !== undefined && typeof party.domain !== "string") return false;
  if (!actions.includes(value.asked_action as AskedAction)) return false;
  if (!emailKinds.includes(value.email_kind as EmailKind)) return false;
  if (!Array.isArray(value.cited_numbers)) return false;
  return value.cited_numbers.every((item) => {
    if (!isObject(item)) return false;
    return kinds.includes(item.kind as NumberKind) && typeof item.value === "string" && item.value.trim() !== "";
  });
}

export function parseClaimResponse(raw: string): EmailClaim {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Structured claim is invalid or incomplete");
  }
  if (!isEmailClaim(parsed)) {
    throw new Error("Structured claim is invalid or incomplete");
  }
  return parsed;
}
