# Cipher — E2EE Group Messaging

Zero-knowledge end-to-end encrypted messaging built on React + TweetNaCl + an external Supabase project. The server stores only ciphertext and public keys.

## Setup

1. Create a Supabase project (external to Lovable).
2. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
4. In Supabase Auth settings, enable **Email** provider with magic links.
5. Run the app.

## Crypto

- X25519 keypair generated client-side on first login (TweetNaCl `box.keyPair`).
- Private key stored only in IndexedDB (`idb`); never sent to server.
- 1:1 messages: `nacl.box(msg, nonce, recipientPub, senderPriv)`.
- Group messages: random 32-byte symmetric room key. Sealed for each member with `nacl.box`. Messages encrypted with `nacl.secretbox` using room key.

## Scope

This MVP covers Phases 1–3: auth, 1:1 messaging, group messaging. PWA/offline, typing indicators, read receipts are intentionally not included.
