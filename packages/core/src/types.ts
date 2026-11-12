export type LedgerSource = "receipt_email" | "shipment_email" | "import" | "demo_seed";

export interface LedgerOrder {
  id: string;
  merchant: string;
  senderDomain: string;
  orderId: string;
  amount?: string;
  currency?: string;
  date?: string;
  status?: "placed" | "shipped" | "delivered" | "refunded" | "unknown";
  source: LedgerSource;
  confirmedAt: string;
}

export interface LedgerShipment {
  id: string;
  trackingNumber: string;
  carrier?: string;
  orderId?: string;
  merchant?: string;
  expected: boolean;
  source: LedgerSource;
  confirmedAt: string;
}

export interface LedgerSender {
  domain: string;
  displayName: string;
  role: "merchant" | "bank" | "subscription" | "other";
  firstSeenAt: string;
  confirmedAt: string;
}

export interface OfficialPack {
  version: string;
  officialDomains: {
    domain: string;
    name: string;
    role: "carrier" | "merchant" | "bank" | "other";
  }[];
  lureTemplates: { id: string; pattern: string; note: string }[];
}

export type ClaimedRole = "carrier" | "merchant" | "bank" | "subscription" | "unknown";
export type AskedAction = "pay" | "log_in" | "confirm" | "download" | "none" | "other";
export type NumberKind = "tracking" | "order" | "invoice" | "subscription" | "account" | "other";
export type EmailKind =
  | "shipment_notice"
  | "carrier_update"
  | "receipt"
  | "renewal"
  | "invoice"
  | "refund"
  | "delivery_problem"
  | "other";

export interface EmailClaim {
  claimed_party: {
    name: string;
    role: ClaimedRole;
    domain?: string;
  };
  asked_action: AskedAction;
  cited_numbers: { kind: NumberKind; value: string }[];
  email_kind: EmailKind;
}

export type Outcome = "safe" | "warning" | "neutral";

export type InferenceSourceValue = "on_device" | "in_cloud";

export type InferenceSourceLabel =
  | "Checked on this device"
  | "Checked in the cloud"
  | "Limited check (no AI)"
  | "Check not completed";

export interface Verdict {
  outcome: Outcome;
  headline: string;
  reasons: string[];
  inferenceSourceLabel: InferenceSourceLabel;
}

export interface LedgerSnapshot {
  orders: LedgerOrder[];
  shipments: LedgerShipment[];
  senders: LedgerSender[];
}

export const NOTHING_EXPECTED_HEADLINE = "You're not expecting any parcel right now.";
