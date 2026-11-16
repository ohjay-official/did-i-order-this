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

export async function resetToDemoSeed(): Promise<LedgerSnapshot> {
  const seed = demoSeed();
  const db = await openDb();
  try {
    await runTransaction(db, ["orders", "shipments", "senders", "meta"], "readwrite", (tx) => {
      tx.objectStore("orders").clear();
      tx.objectStore("shipments").clear();
      tx.objectStore("senders").clear();
      for (const order of seed.orders) tx.objectStore("orders").put(order);
      for (const shipment of seed.shipments) tx.objectStore("shipments").put(shipment);
      for (const sender of seed.senders) tx.objectStore("senders").put(sender);
      tx.objectStore("meta").put(true, "seeded");
      return () => seed;
    });
    return seed;
  } finally {
    db.close();
  }
}

/**
 * Seeds the demo ledger if this device has never been seeded. Every write calls
 * this first: otherwise a write on a brand-new device (for example the homepage
 * Real UPS chip saving its demo shipment) would be wiped by the first
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
