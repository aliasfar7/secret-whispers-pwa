import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { createNewIdentity, getStored, importIdentity, clearKeyPair } from "./keystore";
import { b64, type KeyPair } from "./crypto";

type Profile = { id: string; username: string; public_key: string };

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  keyPair: KeyPair | null;
  loading: boolean;
  needsUsername: boolean;
  /** Phrase to display once after a brand-new identity is created. */
  pendingBackupPhrase: string | null;
  acknowledgeBackup: () => void;
  signInAnonymously: () => Promise<void>;
  /** Restore an existing account on this device using a recovery phrase. */
  restoreFromPhrase: (username: string, phrase: string) => Promise<void>;
  completeProfile: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [pendingBackupPhrase, setPendingBackupPhrase] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setKeyPair(null);
      setNeedsUsername(false);
      setPendingBackupPhrase(null);
      return;
    }
    (async () => {
      const authId = session.user.id;
      const stored = await getStored(authId);

      // Look up profile linked to this auth session.
      const { data: existing } = await supabase
        .from("users")
        .select("id, username, public_key")
        .eq("auth_user_id", authId)
        .maybeSingle();

      if (existing && stored) {
        setKeyPair(stored.keyPair);
        setProfile(existing as Profile);
        setNeedsUsername(false);
      } else if (existing && !stored) {
        // Auth session exists but local key vault was wiped — force restore.
        await supabase.auth.signOut();
      } else {
        // No profile yet — generate fresh identity + recovery phrase.
        if (!stored) {
          const { keyPair: kp, phrase } = await createNewIdentity(authId);
          setKeyPair(kp);
          setPendingBackupPhrase(phrase);
        } else {
          setKeyPair(stored.keyPair);
        }
        setNeedsUsername(true);
      }
    })();
  }, [session]);

  const signInAnonymously = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  };

  const completeProfile = async (username: string) => {
    if (!session || !keyPair) throw new Error("No session");
    const row = {
      id: crypto.randomUUID(),
      username: username.trim(),
      public_key: b64.enc(keyPair.publicKey),
      auth_user_id: session.user.id,
    };
    const { data, error } = await supabase
      .from("users")
      .insert(row)
      .select("id, username, public_key")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("That username is already taken. Please pick another.");
      }
      throw error;
    }
    setProfile(data as Profile);
    setNeedsUsername(false);
  };

  const restoreFromPhrase = async (username: string, phrase: string) => {
    // Need an auth session to call claim_account.
    let s = session;
    if (!s) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      s = data.session;
    }
    if (!s) throw new Error("Could not start session");

    const kp = await importIdentity(s.user.id, phrase);
    const publicKey = b64.enc(kp.publicKey);

    const { data, error } = await supabase.rpc("claim_account", {
      _username: username.trim(),
      _public_key: publicKey,
    });
    if (error) {
      await clearKeyPair(s.user.id);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setKeyPair(kp);
    setProfile({
      id: row.id,
      username: row.username,
      public_key: row.public_key,
    });
    setNeedsUsername(false);
    setPendingBackupPhrase(null);
  };

  const acknowledgeBackup = () => setPendingBackupPhrase(null);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        keyPair,
        loading,
        needsUsername,
        pendingBackupPhrase,
        acknowledgeBackup,
        signInAnonymously,
        restoreFromPhrase,
        completeProfile,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
