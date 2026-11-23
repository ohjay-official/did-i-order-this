import type { OfficialPack } from "@did-i-order-this/core";
import pack from "./official.json";

// Sources for the official carrier domains in official.json (JSON cannot hold
// comments). Each was checked on 2026-11-23 against the operator's own site:
// - dhl.com, ups.com, usps.com, fedex.com: the carriers' own home domains.
// - dhl.de: DHL Paket Germany; its imprint (dhl.de/de/toolbar/footer/impressum/dhlpaket.html)
//   names Deutsche Post AG / DHL Paket GmbH, and the site links back to dhl.com.
// - royalmail.com: linked as Royal Mail from its parent group's site,
//   internationaldistributionservices.com (formerly royalmailgroup.com, which redirects there).
// - evri.com: the site of Evri Limited, formerly Hermes UK.
// - dpd.com and dpd.co.uk: dpd.com is the DPD group site and links to dpd.co.uk as DPD UK.
// Not added: dhl.co.uk (no verifiable response on 2026-11-23; DHL's UK pages live on dhl.com)
// and amazon.com (a store, so a carrier role would misroute Amazon order emails).
export function getOfficialPack(): OfficialPack {
  return pack as OfficialPack;
}
