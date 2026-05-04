import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import nacl from "tweetnacl";
import type { KeyPair } from "./crypto";

export function newRecoveryPhrase(): string {
  // 128-bit entropy => 12 words.
  return generateMnemonic(wordlist, 128);
}

export function isValidPhrase(phrase: string): boolean {
  try {
    return validateMnemonic(normalizePhrase(phrase), wordlist);
  } catch {
    return false;
  }
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}

export function keyPairFromPhrase(phrase: string): KeyPair {
  const seed = mnemonicToSeedSync(normalizePhrase(phrase));
  const secret = new Uint8Array(seed.subarray(0, 32));
  return nacl.box.keyPair.fromSecretKey(secret);
}
