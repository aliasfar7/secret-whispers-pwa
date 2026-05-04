import { openDB, type IDBPDatabase } from "idb";
import { b64, type KeyPair } from "./crypto";
import { keyPairFromPhrase, newRecoveryPhrase } from "./recovery";

const DB_NAME = "cipher-keys";
const STORE = "keys";
// Single-slot store: identity is per-device, keyed by auth user id.

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

type StoredKey = { publicKey: string; secretKey: string; phrase?: string };

export async function getStored(authUserId: string): Promise<{ keyPair: KeyPair; phrase?: string } | null> {
  const d = await db();
  const v = (await d.get(STORE, authUserId)) as StoredKey | undefined;
  if (!v) return null;
  return {
    keyPair: { publicKey: b64.dec(v.publicKey), secretKey: b64.dec(v.secretKey) },
    phrase: v.phrase,
  };
}

export async function createNewIdentity(authUserId: string): Promise<{ keyPair: KeyPair; phrase: string }> {
  const phrase = newRecoveryPhrase();
  const kp = keyPairFromPhrase(phrase);
  await put(authUserId, kp, phrase);
  return { keyPair: kp, phrase };
}

export async function importIdentity(authUserId: string, phrase: string): Promise<KeyPair> {
  const kp = keyPairFromPhrase(phrase);
  await put(authUserId, kp, phrase);
  return kp;
}

async function put(authUserId: string, kp: KeyPair, phrase?: string) {
  const d = await db();
  await d.put(
    STORE,
    {
      publicKey: b64.enc(kp.publicKey),
      secretKey: b64.enc(kp.secretKey),
      phrase,
    } as StoredKey,
    authUserId
  );
}

export async function clearKeyPair(authUserId: string) {
  const d = await db();
  await d.delete(STORE, authUserId);
}
