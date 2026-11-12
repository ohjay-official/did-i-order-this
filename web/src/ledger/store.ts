import type { LedgerOrder, LedgerSender, LedgerShipment, LedgerSnapshot } from "@did-i-order-this/core";
import { demoSeed } from "../demo/seed.ts";

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

export async function saveOrder(order: LedgerOrder): Promise<void> {
  const db = await openDb();
  try {
    await runTransaction(db, ["orders"], "readwrite", (tx) => {
      tx.objectStore("orders").put(order);
      return () => undefined;
    });
  } finally {
    db.close();
  }
}

export async function saveShipment(shipment: LedgerShipment): Promise<void> {
  const db = await openDb();
  try {
    await runTransaction(db, ["shipments"], "readwrite", (tx) => {
      tx.objectStore("shipments").put(shipment);
      return () => undefined;
    });
  } finally {
    db.close();
  }
}

export async function saveSender(sender: LedgerSender): Promise<void> {
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
