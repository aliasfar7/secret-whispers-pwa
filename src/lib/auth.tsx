import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getOrCreateKeyPair } from "./keystore";
import { b64, type KeyPair } from "./crypto";

type Profile = { id: string; username: string; public_key: string };

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  keyPair: KeyPair | null;
  loading: boolean;
  needsUsername: boolean;
  signInAnonymously: () => Promise<void>;
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
      return;
    }
    (async () => {
      const userId = session.user.id;
      const kp = await getOrCreateKeyPair(userId);
      setKeyPair(kp);

      const { data: existing } = await supabase
        .from("users")
        .select("id, username, public_key")
        .eq("id", userId)
        .maybeSingle();

      if (existing) {
        setProfile(existing as Profile);
        setNeedsUsername(false);
      } else {
        setNeedsUsername(true);
      }
    })();
  }, [session]);

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const completeProfile = async (username: string) => {
    if (!session || !keyPair) throw new Error("No session");
    const row = {
      id: session.user.id,
      username: username.trim(),
      public_key: b64.enc(keyPair.publicKey),
    };
    const { error } = await supabase.from("users").insert(row);
    if (error) throw error;
    setProfile(row);
    setNeedsUsername(false);
  };

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
        signInWithMagicLink,
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
