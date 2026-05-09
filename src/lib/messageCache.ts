import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "cipher-message-cache";
const STORE = "messages";

type CachedMessage = {
  id: string;
  roomId: string;
  text: string;
  updatedAt: string;
};

const INVALID_CACHED_TEXT = [
  /^unable to decrypt$/i,
  /^message unavailable$/i,
  /^could not decrypt$/i,
];

function isValidCachedText(text?: string | null) {
  if (!text?.trim()) return false;
  return !INVALID_CACHED_TEXT.some((pattern) => pattern.test(text.trim()));
}

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

function cacheKey(roomId: string, messageId: string) {
  return `${roomId}:${messageId}`;
}

export async function cacheMessageText(roomId: string, messageId: string, text: string) {
  if (!isValidCachedText(text)) return;
  const d = await db();
  await d.put(
    STORE,
    {
      id: messageId,
      roomId,
      text,
      updatedAt: new Date().toISOString(),
    } as CachedMessage,
    cacheKey(roomId, messageId)
  );
}

export async function getCachedMessageTexts(roomId: string, messageIds: string[]) {
  const d = await db();
  const entries = await Promise.all(
    messageIds.map(async (messageId) => {
      const cached = (await d.get(STORE, cacheKey(roomId, messageId))) as
        | CachedMessage
        | undefined;
      if (!cached) return null;
      if (!isValidCachedText(cached.text)) {
        await d.delete(STORE, cacheKey(roomId, messageId));
        return null;
      }
      return [messageId, cached.text] as const;
    })
  );

  return Object.fromEntries(entries.filter(Boolean) as [string, string][]);
}