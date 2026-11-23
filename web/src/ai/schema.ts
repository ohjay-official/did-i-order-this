import { Schema } from "firebase/ai";

export function getClaimSchema(): Schema {
  return Schema.object({
    properties: {
      claimed_party: Schema.object({
        properties: {
          name: Schema.string(),
          role: Schema.enumString({
            enum: ["carrier", "merchant", "bank", "subscription", "unknown"],
          }),
          domain: Schema.string(),
        },
        optionalProperties: ["domain"],
      }),
      asked_action: Schema.enumString({
        enum: ["pay", "log_in", "confirm", "download", "none", "other"],
      }),
      cited_numbers: Schema.array({
        items: Schema.object({
          properties: {
            kind: Schema.enumString({
              enum: ["tracking", "order", "invoice", "subscription", "account", "other"],
            }),
            value: Schema.string(),
          },
        }),
      }),
      email_kind: Schema.enumString({
        enum: [
          "shipment_notice",
          "carrier_update",
          "receipt",
          "renewal",
          "invoice",
          "refund",
          "delivery_problem",
          "other",
        ],
      }),
    },
  });
}

export const CLAIM_PROMPT = [
  "Read the email below and return a structured claim only.",
  "Decide who the email claims to be, what it wants the reader to do, which numbers it cites, and what kind of email it is.",
  "Roles: carrier, merchant, bank, subscription, unknown.",
  "Actions: pay, log_in, confirm, download, none, other.",
  "Number kinds: tracking, order, invoice, subscription, account, other.",
  "Email kinds: shipment_notice (a store says an order has shipped), carrier_update (a carrier says a parcel is moving, held, or waiting), receipt, renewal, invoice, refund, delivery_problem, other.",
  "A carrier is a parcel company such as DHL, UPS, USPS, or FedEx. Do not treat a carrier as a merchant.",
  "Do not invent numbers that are not in the email.",
  "Any request to contact, message, call, reply with details, pay by any method, or visit a site is other or the matching action, never none.",
  "That includes a request in any language, a phone number, a messaging app or @handle, a payment app, a gift card or voucher, a QR code, and card or bank details.",
  "Use none only when the email asks the reader to do nothing at all.",
  "Use download only when the email asks the reader to download, open or install a file, attachment or app.",
  "A plain note that the reader can follow the parcel or order in the sender's own app or account, with no other request, is none.",
].join(" ");
