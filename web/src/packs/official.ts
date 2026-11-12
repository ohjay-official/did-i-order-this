import type { OfficialPack } from "@did-i-order-this/core";
import pack from "./official.json";

export function getOfficialPack(): OfficialPack {
  return pack as OfficialPack;
}
