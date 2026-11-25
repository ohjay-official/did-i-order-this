import type { OfficialPack } from "@did-i-order-this/core";
import pack from "./official.json";

// Rule: a domain goes on this list only if it publishes DMARC with p=reject,
// so mail that forges it is refused by receiving servers. Every entry was
// checked on 2026-11-23 (dns.google, _dmarc.<domain> TXT): dhl.com, ups.com,
// usps.com, fedex.com, dhl.de, royalmail.com, evri.com, dpd.co.uk and
// paypal.com all publish p=reject. dpd.com publishes no DMARC record, so it
// was removed on 2026-11-23.
//
// storeDomains: the only store domains whose exact-domain order match may give
// Safe. Each publishes DMARC p=reject (pct 100 or unset), checked on 2026-11-23
// via dns.google/resolve?name=_dmarc.<domain>&type=TXT: ikea.com, zara.com,
// asos.com, argos.co.uk, nike.com, adidas.com, costco.com, homedepot.com,
// chewy.com, tesco.com, marksandspencer.com, uniqlo.com, hm.com, zalando.com.
// Checked and left off because they publish p=quarantine: amazon.com,
// amazon.co.uk, amazon.de, apple.com, johnlewis.com, shein.com, wayfair.com.
// Left off as platforms that send for other sellers: shopify.com.
//
// Removed on 2026-11-23 (round 5) although they publish p=reject: ebay.com,
// ebay.co.uk, etsy.com, aliexpress.com, temu.com, jumia.com.ng, walmart.com and
// newegg.com. Removed on 2026-11-23 (round 6): target.com (Target Plus) and
// bestbuy.com (Best Buy Marketplace), both of which run third-party seller
// programs that can send from the exact domain. These are all marketplaces
// where third-party sellers or members write to buyers; DMARC proves the
// platform sent the email, not who wrote it, and a seller of your real order
// knows its order number. A subdomain of a listed store never counts.
//
// Sources for the official carrier domains in official.json (JSON cannot hold
// comments). Each was checked on 2026-11-23 against the operator's own site:
// - dhl.com, ups.com, usps.com, fedex.com: the carriers' own home domains.
// - dhl.de: DHL Paket Germany; its imprint (dhl.de/de/toolbar/footer/impressum/dhlpaket.html)
//   names Deutsche Post AG / DHL Paket GmbH, and the site links back to dhl.com.
// - royalmail.com: linked as Royal Mail from its parent group's site,
//   internationaldistributionservices.com (formerly royalmailgroup.com, which redirects there).
// - evri.com: the site of Evri Limited, formerly Hermes UK.
// - dpd.co.uk: linked as DPD UK from the DPD group site, dpd.com (dpd.com itself is not listed: no DMARC).
// Not added: dhl.co.uk (no verifiable response on 2026-11-23; DHL's UK pages live on dhl.com)
// and amazon.com (a store, so a carrier role would misroute Amazon order emails).
export function getOfficialPack(): OfficialPack {
  return pack as OfficialPack;
}
