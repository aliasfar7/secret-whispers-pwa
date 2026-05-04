import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

export const b64 = {
  enc: (b: Uint8Array) => naclUtil.encodeBase64(b),
  dec: (s: string) => naclUtil.decodeBase64(s),
};

export const utf8 = {
  enc: (s: string) => naclUtil.decodeUTF8(s),
  dec: (b: Uint8Array) => naclUtil.encodeUTF8(b),
};

export function generateKeyPair(): KeyPair {
  return nacl.box.keyPair();
}

export function newNonce() {
  return nacl.randomBytes(nacl.box.nonceLength);
}

export function newSecretNonce() {
  return nacl.randomBytes(nacl.secretbox.nonceLength);
}

export function newRoomKey() {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

// Asymmetric (1:1 or for sealing room keys)
export function boxEncrypt(
  message: Uint8Array,
  recipientPub: Uint8Array,
  senderPriv: Uint8Array
) {
  const nonce = newNonce();
  const ct = nacl.box(message, nonce, recipientPub, senderPriv);
  return { ciphertext: ct, nonce };
}

export function boxDecrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPub: Uint8Array,
  recipientPriv: Uint8Array
): Uint8Array | null {
  return nacl.box.open(ciphertext, nonce, senderPub, recipientPriv);
}

// Symmetric (group messages)
export function secretEncrypt(message: Uint8Array, key: Uint8Array) {
  const nonce = newSecretNonce();
  const ct = nacl.secretbox(message, nonce, key);
  return { ciphertext: ct, nonce };
}

export function secretDecrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array
): Uint8Array | null {
  return nacl.secretbox.open(ciphertext, nonce, key);
}
