import { openDB, type IDBPDatabase } from "idb";
import { generateKeyPair, b64, type KeyPair } from "./crypto";

const DB_NAME = "cipher-keys";
const STORE = "keys";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

type StoredKey = { publicKey: string; secretKey: string };

export async function getOrCreateKeyPair(userId: string): Promise<KeyPair> {
  const d = await db();
  const existing = (await d.get(STORE, userId)) as StoredKey | undefined;
  if (existing) {
    return {
      publicKey: b64.dec(existing.publicKey),
      secretKey: b64.dec(existing.secretKey),
    };
  }
  const kp = generateKeyPair();
  await d.put(
    STORE,
    { publicKey: b64.enc(kp.publicKey), secretKey: b64.enc(kp.secretKey) },
    userId
  );
  return kp;
}

export async function loadKeyPair(userId: string): Promise<KeyPair | null> {
  const d = await db();
  const existing = (await d.get(STORE, userId)) as StoredKey | undefined;
  if (!existing) return null;
  return {
    publicKey: b64.dec(existing.publicKey),
    secretKey: b64.dec(existing.secretKey),
  };
}

export async function clearKeyPair(userId: string) {
  const d = await db();
  await d.delete(STORE, userId);
}
