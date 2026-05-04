import { useState } from "react";
import { useAuth } from "@/lib/auth";

export function UsernameScreen() {
  const { completeProfile, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await completeProfile(username);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save username");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Pick a username</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Others will use this to find you. Your encryption keypair was generated locally.
        </p>
        <input
          required
          minLength={2}
          maxLength={32}
          pattern="[a-zA-Z0-9_]+"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="alice"
          className="mt-6 w-full rounded-full border border-input bg-[var(--bubble-theirs)] px-5 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-full bg-primary px-4 py-3.5 font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Saving…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 w-full rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
