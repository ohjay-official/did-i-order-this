import type { LedgerOrder, LedgerSender, LedgerShipment, LedgerSnapshot } from "@did-i-order-this/core";
import { demoSeed } from "../demo/seed.ts";
import { findSameOrder, findSameShipment } from "./dedupe.ts";

const DB_NAME = "did-i-order-this";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("orders")) db.createObjectStore("orders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("shipments")) db.createObjectStore("shipments", { keyPath: "id" });
      if (!db.objectStoreNames.contains("senders")) db.createObjectStore("senders", { keyPath: "domain" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  setup: (tx: IDBTransaction) => () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const getResult = setup(tx);
    tx.oncomplete = () => resolve(getResult());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadLedger(): Promise<LedgerSnapshot> {
  const db = await openDb();
  try {
    const loaded = await runTransaction(db, ["orders", "shipments", "senders", "meta"], "readonly", (tx) => {
      const seededReq = tx.objectStore("meta").get("seeded");
      const ordersReq = tx.objectStore("orders").getAll();
      const shipmentsReq = tx.objectStore("shipments").getAll();
      const sendersReq = tx.objectStore("senders").getAll();
      return () => ({
        seeded: Boolean(seededReq.result),
        snapshot: {
          orders: (ordersReq.result ?? []) as LedgerOrder[],
          shipments: (shipmentsReq.result ?? []) as LedgerShipment[],
          senders: (sendersReq.result ?? []) as LedgerSender[],
        },
      });
    });
    if (!loaded.seeded) return resetToDemoSeed();
    return loaded.snapshot;
  } finally {
    db.close();
  }
}

/** Demo rows: the seed order and sender, and the demo parcel the sample inbox and the home page chip store. */
export function isDemoRow(row: { source?: string; confirmedAt?: string }): boolean {
  return row.source === "demo_seed" || row.confirmedAt === "demo_seed";
}

/**
 * The ledger a check should use. The fictional sample emails are checked
 * against everything, demo rows included. Someone's own pasted mail is checked
 * against their own rows only, so the public demo order and demo parcel never
 * match a real email.
 */
export function ledgerForCheck(ledger: LedgerSnapshot, isSample: boolean): LedgerSnapshot {
  if (isSample) return ledger;
  return {
    orders: ledger.orders.filter((row) => !isDemoRow(row)),
    shipments: ledger.shipments.filter((row) => !isDemoRow(row)),
    senders: ledger.senders.filter((row) => !isDemoRow(row)),
  };
}

/**
 * Puts the demo data back as it started. Only demo rows are removed; orders,
 * parcels and senders the person imported or saved are kept.
 */
export async function resetToDemoSeed(): Promise<LedgerSnapshot> {
  const seed = demoSeed();
  const db = await openDb();
  try {
    return await runTransaction(db, ["orders", "shipments", "senders", "meta"], "readwrite", (tx) => {
      const kept: LedgerSnapshot = { orders: [], shipments: [], senders: [] };
      const names = ["orders", "shipments", "senders"] as const;
      for (const name of names) {
        const store = tx.objectStore(name);
        const all = store.getAll();
        all.onsuccess = () => {
          for (const row of (all.result ?? []) as Array<{ id?: string; domain?: string; source?: string; confirmedAt?: string }>) {
            if (isDemoRow(row)) {
              store.delete((name === "senders" ? row.domain : row.id) as IDBValidKey);
            } else {
              (kept[name] as unknown[]).push(row);
            }
          }
          const fresh = seed[name] as Array<{ id?: string; domain?: string }>;
          for (const row of fresh) {
            // A real sender with the same domain as the demo sender is kept as it is.
            if (name === "senders" && kept.senders.some((item) => item.domain === row.domain)) continue;
            store.put(row);
            (kept[name] as unknown[]).push(row);
          }
        };
      }
      tx.objectStore("meta").put(true, "seeded");
      return () => kept;
    });
  } finally {
    db.close();
  }
}

/**
 * Seeds the demo ledger if this device has never been seeded. Every write calls
 * this first: otherwise a write on a brand-new device (for example the homepage
 * UPS chip saving its demo shipment) would be wiped by the first
 * loadLedger(), which seeds by clearing every store.
 */
export async function ensureSeeded(): Promise<void> {
  const db = await openDb();
  let seeded = false;
  try {
    seeded = await runTransaction(db, ["meta"], "readonly", (tx) => {
      const req = tx.objectStore("meta").get("seeded");
      return () => Boolean(req.result);
    });
  } finally {
    db.close();
  }
  if (!seeded) await resetToDemoSeed();
}

/** Stores an order. The same order (same order id from the same sender) is updated, not added twice. Returns true if it was new. */
export async function saveOrder(order: LedgerOrder): Promise<boolean> {
  await ensureSeeded();
  const db = await openDb();
  try {
    return await runTransaction(db, ["orders"], "readwrite", (tx) => {
      const store = tx.objectStore("orders");
      let added = true;
      const all = store.getAll();
      all.onsuccess = () => {
        const same = findSameOrder((all.result ?? []) as LedgerOrder[], order);
        if (same) added = false;
        store.put(same ? { ...order, id: same.id } : order);
      };
      return () => added;
    });
  } finally {
    db.close();
  }
}

/** Stores a shipment. A shipment with the same tracking number is updated, not added twice. Returns true if it was new. */
export async function saveShipment(shipment: LedgerShipment): Promise<boolean> {
  await ensureSeeded();
  const db = await openDb();
  try {
    return await runTransaction(db, ["shipments"], "readwrite", (tx) => {
      const store = tx.objectStore("shipments");
      let added = true;
      const all = store.getAll();
      all.onsuccess = () => {
        const same = findSameShipment((all.result ?? []) as LedgerShipment[], shipment);
        if (same) added = false;
        store.put(same ? { ...shipment, id: same.id } : shipment);
      };
      return () => added;
    });
  } finally {
    db.close();
  }
}

export async function saveSender(sender: LedgerSender): Promise<void> {
  await ensureSeeded();
  const db = await openDb();
  try {
    await runTransaction(db, ["senders"], "readwrite", (tx) => {
      tx.objectStore("senders").put(sender);
      return () => undefined;
    });
  } finally {
    db.close();
  }
}
