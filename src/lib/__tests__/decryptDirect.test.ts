import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import { b64, utf8, boxEncrypt, generateKeyPair } from "../crypto";
import { decryptDirect } from "../chat";
import type { RawMessage } from "../chat";

// Regression: in a 1:1 room, a user's OWN sent messages must still decrypt
// after a page reload (i.e. when the only state available is the ciphertext
// in the DB + both members' public keys + my secret key).
//
// NaCl `box` requires (counterpartyPublicKey, mySecretKey) to derive the
// shared secret. Using my own publicKey for self-sent messages produces a
// different shared secret and decryption silently fails — exactly the bug
// we just fixed.

describe("decryptDirect — self messages after reload", () => {
  it("decrypts a message I sent to the other party using THEIR public key", () => {
    const me = generateKeyPair();
    const other = generateKeyPair();
    const myId = "me-uuid";
    const otherId = "other-uuid";

    const plaintext = "hello from me 👋";

    // Simulate sendDirectMessage: encrypt to recipient's pub with my secret.
    const { ciphertext, nonce } = boxEncrypt(
      utf8.enc(plaintext),
      other.publicKey,
      me.secretKey
    );

    const raw: RawMessage = {
      id: "m1",
      room_id: "r1",
      sender_id: myId, // I am the sender
      encrypted_content: b64.enc(ciphertext),
      nonce: b64.enc(nonce),
      created_at: new Date().toISOString(),
    };

    const members = [
      { user_id: myId, public_key: b64.enc(me.publicKey) },
      { user_id: otherId, public_key: b64.enc(other.publicKey) },
    ];

    const result = decryptDirect(raw, me, members, myId);
    expect(result).toBe(plaintext);
  });

  it("decrypts an incoming message from the other party", () => {
    const me = generateKeyPair();
    const other = generateKeyPair();
    const myId = "me-uuid";
    const otherId = "other-uuid";

    const plaintext = "hi back!";
    const { ciphertext, nonce } = boxEncrypt(
      utf8.enc(plaintext),
      me.publicKey,
      other.secretKey
    );

    const raw: RawMessage = {
      id: "m2",
      room_id: "r1",
      sender_id: otherId,
      encrypted_content: b64.enc(ciphertext),
      nonce: b64.enc(nonce),
      created_at: new Date().toISOString(),
    };

    const members = [
      { user_id: myId, public_key: b64.enc(me.publicKey) },
      { user_id: otherId, public_key: b64.enc(other.publicKey) },
    ];

    expect(decryptDirect(raw, me, members, myId)).toBe(plaintext);
  });

  it("falls back to the other member key when legacy sender ids do not match member ids", () => {
    const me = generateKeyPair();
    const other = generateKeyPair();
    const myId = "me-uuid";
    const otherId = "other-uuid";

    const plaintext = "legacy sender id still decrypts";
    const { ciphertext, nonce } = boxEncrypt(
      utf8.enc(plaintext),
      me.publicKey,
      other.secretKey
    );

    const raw: RawMessage = {
      id: "m-legacy",
      room_id: "r1",
      sender_id: "legacy-auth-id",
      encrypted_content: b64.enc(ciphertext),
      nonce: b64.enc(nonce),
      created_at: new Date().toISOString(),
    };

    const members = [
      { user_id: myId, public_key: b64.enc(me.publicKey) },
      { user_id: otherId, public_key: b64.enc(other.publicKey) },
    ];

    expect(decryptDirect(raw, me, members, myId)).toBe(plaintext);
  });

  it("returns null on tampered ciphertext (failed decryption signal)", () => {
    const me = generateKeyPair();
    const other = generateKeyPair();
    const myId = "me-uuid";
    const otherId = "other-uuid";

    const { ciphertext, nonce } = boxEncrypt(
      utf8.enc("secret"),
      other.publicKey,
      me.secretKey
    );
    // Flip a byte
    const tampered = new Uint8Array(ciphertext);
    tampered[0] = tampered[0] ^ 0xff;

    const raw: RawMessage = {
      id: "m3",
      room_id: "r1",
      sender_id: myId,
      encrypted_content: b64.enc(tampered),
      nonce: b64.enc(nonce),
      created_at: new Date().toISOString(),
    };

    const members = [
      { user_id: myId, public_key: b64.enc(me.publicKey) },
      { user_id: otherId, public_key: b64.enc(other.publicKey) },
    ];

    expect(decryptDirect(raw, me, members, myId)).toBeNull();
  });

  it("sanity: nacl.box requires counterparty pubkey, not self pubkey", () => {
    // Locks in the underlying invariant so this regression can't sneak back.
    const me = generateKeyPair();
    const other = generateKeyPair();
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ct = nacl.box(utf8.enc("x"), nonce, other.publicKey, me.secretKey);
    expect(nacl.box.open(ct, nonce, other.publicKey, me.secretKey)).not.toBeNull();
    expect(nacl.box.open(ct, nonce, me.publicKey, me.secretKey)).toBeNull();
  });
});
