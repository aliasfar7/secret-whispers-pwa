import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "bip39";
import nacl from "tweetnacl";
import type { KeyPair } from "./crypto";

export function newRecoveryPhrase(): string {
  // 128-bit entropy => 12 words.
  return generateMnemonic(128);
}

export function isValidPhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase));
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}

export function keyPairFromPhrase(phrase: string): KeyPair {
  const seed = mnemonicToSeedSync(normalizePhrase(phrase));
  // nacl.box uses Curve25519; derive 32-byte secret key from seed.
  const secret = new Uint8Array(seed.subarray(0, 32));
  return nacl.box.keyPair.fromSecretKey(secret);
}
