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

export type RoomMember = {
  user_id: string;
  username?: string;
  public_key: string;
  canonical_user_id?: string;
  auth_user_id?: string | null;
};

type MessageDecryptContext = {
  isGroup: boolean;
  me: KeyPair | null;
   myUserId?: string | string[];
   members: RoomMember[];
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

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter(Boolean) as string[]));
}

function quotePostgrestList(ids: string[]) {
  return ids.map((id) => JSON.stringify(id)).join(",");
}

function memberHasIdentity(member: RoomMember, ids: string[]) {
  return ids.some(
    (id) =>
      member.user_id === id ||
      member.canonical_user_id === id ||
      member.auth_user_id === id
  );
}

function memberMatchesSender(member: RoomMember, senderId: string) {
  return (
    member.user_id === senderId ||
    member.canonical_user_id === senderId ||
    member.auth_user_id === senderId
  );
}

async function getUsersByAnyId(ids: string[]) {
  const lookupIds = uniqueIds(ids);
  if (lookupIds.length === 0) return [];

  const inList = quotePostgrestList(lookupIds);
  const { data, error } = await supabase
    .from("users")
    .select("id, username, public_key, auth_user_id")
    .or(`id.in.(${inList}),auth_user_id.in.(${inList})`);

  if (error) throw error;

  return (data ?? []) as {
    id: string;
    username: string;
    public_key: string;
    auth_user_id?: string | null;
  }[];
}

export async function listRoomsForUser(userId: string | string[]): Promise<Room[]> {
  const userIds = uniqueIds(Array.isArray(userId) ? userId : [userId]);
  if (userIds.length === 0) return [];

  const membershipQuery = supabase
    .from("room_members")
    .select("room_id")
    .order("joined_at", { ascending: false });

  const { data: memberships, error } =
    userIds.length === 1
      ? await membershipQuery.eq("user_id", userIds[0])
      : await membershipQuery.in("user_id", userIds);

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
  const users = await getUsersByAnyId(ids);
  return ids
    .map((memberId) => {
      const user = users.find(
        (candidate) => candidate.id === memberId || candidate.auth_user_id === memberId
      );
      if (!user) return null;
      return {
        user_id: memberId,
        username: user.username,
        public_key: user.public_key,
        canonical_user_id: user.id,
        auth_user_id: user.auth_user_id ?? null,
      } satisfies RoomMember;
    })
    .filter(Boolean) as RoomMember[];
}

// Get this user's sealed copy of the room key (group rooms only).
export async function getMyRoomKey(
  roomId: string,
  me: { id: string; keyPair: KeyPair; authUserId?: string }
): Promise<Uint8Array | null> {
  const myIds = uniqueIds([me.id, me.authUserId]);
  const query = supabase
    .from("room_members")
    .select("encrypted_room_key, ek_nonce, ek_sender_key")
    .eq("room_id", roomId)
    .limit(1);
  const { data, error } =
    myIds.length === 1
      ? await query.eq("user_id", myIds[0]).maybeSingle()
      : await query.in("user_id", myIds);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const m = row as Membership;
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
async function findDirectRoom(a: string | string[], b: string | string[]): Promise<string | null> {
  const aIds = uniqueIds(Array.isArray(a) ? a : [a]);
  const bIds = uniqueIds(Array.isArray(b) ? b : [b]);
  if (aIds.length === 0 || bIds.length === 0) return null;

  const memberQuery = supabase
    .from("room_members")
    .select("room_id, rooms!inner(is_group)")
    .order("joined_at", { ascending: false });

  const { data, error } =
    aIds.length === 1
      ? await memberQuery.eq("user_id", aIds[0])
      : await memberQuery.in("user_id", aIds);
  if (error) throw error;
  const roomIds = (data ?? [])
    .filter((r: any) => r.rooms?.is_group === false)
    .map((r: any) => r.room_id as string);
  if (roomIds.length === 0) return null;

  const sharedQuery = supabase
    .from("room_members")
    .select("room_id")
    .in("room_id", roomIds);
  const { data: shared, error: e2 } =
    bIds.length === 1
      ? await sharedQuery.eq("user_id", bIds[0])
      : await sharedQuery.in("user_id", bIds);
  if (e2) throw e2;
  return shared && shared.length > 0 ? (shared[0].room_id as string) : null;
}

// Create or fetch a 1:1 room.
// In 1:1 mode we encrypt each message asymmetrically so we don't need a shared
// room key — we still create a sealed marker for membership.
export async function getOrCreateDirectRoom(
  me: { id: string; keyPair: KeyPair; authUserId?: string },
  other: { id: string; public_key: string; auth_user_id?: string | null }
): Promise<string> {
  const existing = await findDirectRoom(
    uniqueIds([me.id, me.authUserId]),
    uniqueIds([other.id, other.auth_user_id])
  );
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
  me: { id: string; keyPair: KeyPair; authUserId?: string },
  name: string,
  members: { id: string; public_key: string; auth_user_id?: string | null }[]
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
  if (error) {
    console.error("[chat] fetchMessages failed", { roomId, error });
    throw error;
  }
  console.info("[chat] fetchMessages result", { roomId, count: data?.length ?? 0 });
  return (data ?? []) as RawMessage[];
}

export async function sendDirectMessage(
  roomId: string,
  text: string,
  me: { id: string; keyPair: KeyPair; authUserId?: string },
  recipient: { public_key: string }
): Promise<RawMessage> {
  const plaintext = utf8.enc(text);
  // Encrypt twice: once for the recipient and once for the sender (box-to-self).
  // This guarantees the sender can ALWAYS decrypt their own outgoing messages
  // from the server, even after a refresh, new device, or lost local cache.
  // Packed as "<recipient_ct>|<sender_ct>" / "<recipient_nonce>|<sender_nonce>".
  const forRecipient = boxEncrypt(
    plaintext,
    b64.dec(recipient.public_key),
    me.keyPair.secretKey
  );
  const forSender = boxEncrypt(
    plaintext,
    me.keyPair.publicKey,
    me.keyPair.secretKey
  );
  const packedCiphertext = `${b64.enc(forRecipient.ciphertext)}|${b64.enc(forSender.ciphertext)}`;
  const packedNonce = `${b64.enc(forRecipient.nonce)}|${b64.enc(forSender.nonce)}`;
  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: me.id,
      encrypted_content: packedCiphertext,
      nonce: packedNonce,
    })
    .select()
    .single();
  if (error) {
    console.error("[chat] sendDirectMessage failed", {
      roomId,
      senderId: me.id,
      recipientKeyPrefix: recipient.public_key.slice(0, 16),
      error,
    });
    throw error;
  }
  console.info("[chat] sendDirectMessage inserted", { roomId, messageId: data.id, senderId: me.id });
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
  members: RoomMember[],
  myUserId?: string | string[]
): string | null {
  const myIds = uniqueIds(Array.isArray(myUserId) ? myUserId : [myUserId]);

  // Messages can be packed as "<recipient_ct>|<sender_ct>" with matching
  // packed nonces, so the sender can always decrypt their own outgoing copy
  // even on a fresh device. Legacy single-ciphertext rows still decrypt.
  const ctParts = raw.encrypted_content.split("|");
  const nParts = raw.nonce.split("|");
  const recipientCt = b64.dec(ctParts[0]);
  const recipientNonce = b64.dec(nParts[0]);
  const senderCt = ctParts[1] ? b64.dec(ctParts[1]) : null;
  const senderNonce = nParts[1] ? b64.dec(nParts[1]) : null;

  // 1) If we are the sender and the message has a sender-self copy, decrypt
  //    it directly with our own keypair (box-to-self).
  if (senderCt && senderNonce && myIds.includes(raw.sender_id)) {
    const pt = boxDecrypt(senderCt, senderNonce, me.publicKey, me.secretKey);
    if (pt) return utf8.dec(pt);
  }

  // 2) Try every plausible counterparty key against the recipient ciphertext.
  const candidates: { user_id: string; public_key: string }[] = [];
  const pushCandidate = (candidate?: { user_id: string; public_key: string }) => {
    if (!candidate) return;
    if (candidates.some((m) => m.user_id === candidate.user_id)) return;
    candidates.push(candidate);
  };

  if (myIds.includes(raw.sender_id)) {
    pushCandidate(members.find((m) => !memberHasIdentity(m, myIds)));
  }
  pushCandidate(members.find((m) => memberMatchesSender(m, raw.sender_id)));
  for (const member of members) {
    if (!memberHasIdentity(member, myIds)) pushCandidate(member);
  }

  for (const counterparty of candidates) {
    const pt = boxDecrypt(
      recipientCt,
      recipientNonce,
      b64.dec(counterparty.public_key),
      me.secretKey
    );
    if (pt) return utf8.dec(pt);
  }

  console.warn("[chat] decryptDirect failed", {
    messageId: raw.id,
    senderId: raw.sender_id,
    myUserId: myIds,
    memberIds: members.map((member) => member.user_id),
    ciphertextParts: ctParts.length,
    nonceParts: nParts.length,
  });

  // 3) Last-ditch: if we are the recipient and there's a sender-self half,
  //    we can't read it (we don't have the sender's secret), so nothing to do.
  return null;
}

export function decryptGroup(raw: RawMessage, roomKey: Uint8Array): string | null {
  const pt = secretDecrypt(b64.dec(raw.encrypted_content), b64.dec(raw.nonce), roomKey);
  return pt ? utf8.dec(pt) : null;
}

export function decryptMessageForRoom(
  raw: RawMessage,
  ctx: MessageDecryptContext
): DecryptedMessage {
  const sender = ctx.members.find((m) => memberMatchesSender(m, raw.sender_id));

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
