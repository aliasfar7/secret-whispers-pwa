import { supabase } from "./supabase";
import {
  b64,
  utf8,
  boxDecrypt,
  boxEncrypt,
  newRoomKey,
  secretDecrypt,
  secretEncrypt,
  type KeyPair,
} from "./crypto";

export type Room = {
  id: string;
  name: string | null;
  is_group: boolean;
  created_at: string;
  // Hydrated client-side:
  display_name?: string;
  members?: { user_id: string; username: string; public_key: string }[];
  room_key?: Uint8Array | null; // null for 1:1, sym key for groups
};

export type DecryptedMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_username?: string;
  created_at: string;
  text: string;
  failed?: boolean;
};

type MessageDecryptContext = {
  isGroup: boolean;
  me: KeyPair | null;
  myUserId?: string;
  members: { user_id: string; username?: string; public_key: string }[];
  roomKey: Uint8Array | null;
};

export type RawMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  encrypted_content: string;
  nonce: string;
  created_at: string;
};

type Membership = {
  room_id: string;
  encrypted_room_key: string;
  ek_nonce: string;
  ek_sender_key: string;
};

export async function listRoomsForUser(userId: string): Promise<Room[]> {
  const { data: memberships, error } = await supabase
    .from("room_members")
    .select("room_id")
    .eq("user_id", userId);
  if (error) throw error;
  const ids = (memberships ?? []).map((m) => m.room_id);
  if (ids.length === 0) return [];

  const { data: rooms, error: e2 } = await supabase
    .from("rooms")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (e2) throw e2;
  return rooms as Room[];
}

export async function getRoomMembers(roomId: string) {
  const { data: mems, error } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId);
  if (error) throw error;
  const ids = (mems ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: users, error: e2 } = await supabase
    .from("users")
    .select("id, username, public_key")
    .in("id", ids);
  if (e2) throw e2;
  return (users ?? []).map((u) => ({
    user_id: u.id,
    username: u.username,
    public_key: u.public_key,
  }));
}

// Get this user's sealed copy of the room key (group rooms only).
export async function getMyRoomKey(
  roomId: string,
  me: { id: string; keyPair: KeyPair }
): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from("room_members")
    .select("encrypted_room_key, ek_nonce, ek_sender_key")
    .eq("room_id", roomId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const m = data as Membership;
  return boxDecrypt(
    b64.dec(m.encrypted_room_key),
    b64.dec(m.ek_nonce),
    b64.dec(m.ek_sender_key),
    me.keyPair.secretKey
  );
}

export async function findUserByUsername(username: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, public_key")
    .ilike("username", username.trim())
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; username: string; public_key: string } | null;
}

export async function searchUsers(query: string, excludeId?: string) {
  let q = supabase
    .from("users")
    .select("id, username, public_key")
    .ilike("username", `%${query.trim()}%`)
    .limit(10);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { id: string; username: string; public_key: string }[];
}

// Find existing 1:1 room between two users.
async function findDirectRoom(a: string, b: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("room_members")
    .select("room_id, rooms!inner(is_group)")
    .eq("user_id", a);
  if (error) throw error;
  const roomIds = (data ?? [])
    .filter((r: any) => r.rooms?.is_group === false)
    .map((r: any) => r.room_id as string);
  if (roomIds.length === 0) return null;

  const { data: shared, error: e2 } = await supabase
    .from("room_members")
    .select("room_id")
    .eq("user_id", b)
    .in("room_id", roomIds);
  if (e2) throw e2;
  return shared && shared.length > 0 ? (shared[0].room_id as string) : null;
}

// Create or fetch a 1:1 room.
// In 1:1 mode we encrypt each message asymmetrically so we don't need a shared
// room key — we still create a sealed marker for membership.
export async function getOrCreateDirectRoom(
  me: { id: string; keyPair: KeyPair },
  other: { id: string; public_key: string }
): Promise<string> {
  const existing = await findDirectRoom(me.id, other.id);
  if (existing) return existing;

  // Seal a placeholder "room key" (random bytes) for both members so the
  // membership row schema is satisfied; not used to decrypt 1:1 messages.
  const placeholder = newRoomKey();
  const otherPub = b64.dec(other.public_key);

  const sealForMe = boxEncrypt(placeholder, me.keyPair.publicKey, me.keyPair.secretKey);
  const sealForOther = boxEncrypt(placeholder, otherPub, me.keyPair.secretKey);

  const members = [
    {
      user_id: me.id,
      encrypted_room_key: b64.enc(sealForMe.ciphertext),
      ek_nonce: b64.enc(sealForMe.nonce),
      ek_sender_key: b64.enc(me.keyPair.publicKey),
    },
    {
      user_id: other.id,
      encrypted_room_key: b64.enc(sealForOther.ciphertext),
      ek_nonce: b64.enc(sealForOther.nonce),
      ek_sender_key: b64.enc(me.keyPair.publicKey),
    },
  ];

  const { data, error } = await supabase.rpc("create_room_with_members", {
    _is_group: false,
    _name: null,
    _members: members,
  });
  if (error) throw error;
  return data as string;
}

export async function createGroupRoom(
  me: { id: string; keyPair: KeyPair },
  name: string,
  members: { id: string; public_key: string }[]
): Promise<string> {
  const roomKey = newRoomKey();

  // Encrypt name with the room key
  const enc = secretEncrypt(utf8.enc(name), roomKey);
  const encryptedName = `${b64.enc(enc.ciphertext)}.${b64.enc(enc.nonce)}`;

  const all = [
    { id: me.id, public_key: b64.enc(me.keyPair.publicKey) },
    ...members.filter((m) => m.id !== me.id),
  ];

  const rows = all.map((m) => {
    const sealed = boxEncrypt(roomKey, b64.dec(m.public_key), me.keyPair.secretKey);
    return {
      user_id: m.id,
      encrypted_room_key: b64.enc(sealed.ciphertext),
      ek_nonce: b64.enc(sealed.nonce),
      ek_sender_key: b64.enc(me.keyPair.publicKey),
    };
  });

  const { data, error } = await supabase.rpc("create_room_with_members", {
    _is_group: true,
    _name: encryptedName,
    _members: rows,
  });
  if (error) throw error;
  return data as string;
}

export function decryptRoomName(encrypted: string, key: Uint8Array): string {
  try {
    const [ctB, nB] = encrypted.split(".");
    const pt = secretDecrypt(b64.dec(ctB), b64.dec(nB), key);
    return pt ? utf8.dec(pt) : "(encrypted)";
  } catch {
    return "(encrypted)";
  }
}

export async function fetchMessages(roomId: string, limit = 100) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RawMessage[];
}

export async function sendDirectMessage(
  roomId: string,
  text: string,
  me: { id: string; keyPair: KeyPair },
  recipient: { public_key: string }
): Promise<RawMessage> {
  const { ciphertext, nonce } = boxEncrypt(
    utf8.enc(text),
    b64.dec(recipient.public_key),
    me.keyPair.secretKey
  );
  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: me.id,
      encrypted_content: b64.enc(ciphertext),
      nonce: b64.enc(nonce),
    })
    .select()
    .single();
  if (error) throw error;
  return data as RawMessage;
}

export async function sendGroupMessage(
  roomId: string,
  text: string,
  meId: string,
  roomKey: Uint8Array
): Promise<RawMessage> {
  const { ciphertext, nonce } = secretEncrypt(utf8.enc(text), roomKey);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: meId,
      encrypted_content: b64.enc(ciphertext),
      nonce: b64.enc(nonce),
    })
    .select()
    .single();
  if (error) throw error;
  return data as RawMessage;
}

export function decryptDirect(
  raw: RawMessage,
  me: KeyPair,
  members: { user_id: string; public_key: string }[],
  myUserId?: string
): string | null {
  // NaCl box uses a shared secret derived from (theirPub, mySecret).
  // For incoming messages: counterparty = sender.
  // For our own sent messages: counterparty = the OTHER member, because we
  // encrypted to their public key with our secret key.
  let counterparty: { user_id: string; public_key: string } | undefined;
  if (myUserId && raw.sender_id === myUserId) {
    counterparty = members.find((m) => m.user_id !== myUserId);
  } else {
    counterparty = members.find((m) => m.user_id === raw.sender_id);
  }
  if (!counterparty) return null;
  const pt = boxDecrypt(
    b64.dec(raw.encrypted_content),
    b64.dec(raw.nonce),
    b64.dec(counterparty.public_key),
    me.secretKey
  );
  return pt ? utf8.dec(pt) : null;
}

export function decryptGroup(raw: RawMessage, roomKey: Uint8Array): string | null {
  const pt = secretDecrypt(b64.dec(raw.encrypted_content), b64.dec(raw.nonce), roomKey);
  return pt ? utf8.dec(pt) : null;
}

export function decryptMessageForRoom(
  raw: RawMessage,
  ctx: MessageDecryptContext
): DecryptedMessage {
  const sender = ctx.members.find((m) => m.user_id === raw.sender_id);

  let text: string | null | undefined;
  if (ctx.isGroup) {
    text = ctx.roomKey ? decryptGroup(raw, ctx.roomKey) : undefined;
  } else if (ctx.me && ctx.myUserId && ctx.members.length >= 2) {
    text = decryptDirect(raw, ctx.me, ctx.members, ctx.myUserId);
  }

  return {
    id: raw.id,
    room_id: raw.room_id,
    sender_id: raw.sender_id,
    sender_username: sender?.username,
    created_at: raw.created_at,
    text: typeof text === "string" ? text : "",
    failed: text === null,
  };
}
