import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { isValidPhrase, normalizePhrase } from "@/lib/recovery";
import { Lock, MessageCircle } from "lucide-react";

export function LoginScreen() {
  const { signInAnonymously, restoreFromPhrase } = useAuth();
  const [mode, setMode] = useState<"start" | "restore" | "confirm">("start");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [phrase, setPhrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const start = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signInAnonymously();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const goConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!isValidPhrase(phrase)) {
      setErr("That doesn't look like a valid 12-word recovery phrase.");
      return;
    }
    setConfirmPhrase("");
    setMode("confirm");
  };

  const restore = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (normalizePhrase(confirmPhrase) !== normalizePhrase(phrase)) {
      setErr("The two phrases don't match. Check for typos.");
      return;
    }
    setLoading(true);
    try {
      await restoreFromPhrase(username, phrase);
    } catch (e: any) {
      setErr(e?.message ?? "Could not restore account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-between bg-background px-6 py-10">
      <div />
      <div className="flex flex-col items-center text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
          <MessageCircle className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Cipher</h1>
        <p className="mt-3 max-w-xs text-sm text-muted-foreground">
          Private messaging with end-to-end encryption. Your account is secured by a
          12-word recovery phrase generated on this device.
        </p>
      </div>

      <div className="w-full max-w-sm">
        {err && <p className="mb-3 text-center text-sm text-destructive">{err}</p>}

        {mode === "start" ? (
          <>
            <button
              onClick={start}
              disabled={loading}
              className="w-full rounded-full bg-primary px-4 py-3.5 text-base font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Starting…" : "Create new account"}
            </button>
            <button
              onClick={() => {
                setErr(null);
                setMode("restore");
              }}
              className="mt-3 w-full rounded-full border border-border px-4 py-3 text-sm text-foreground hover:bg-accent"
            >
              I have a recovery phrase
            </button>
          </>
        ) : (
          <form onSubmit={restore} className="flex flex-col gap-3">
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-full border border-input bg-[var(--bubble-theirs)] px-5 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              required
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="12-word recovery phrase, separated by spaces"
              rows={3}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-2xl border border-input bg-[var(--bubble-theirs)] px-5 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-primary px-4 py-3.5 text-base font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Restoring…" : "Restore account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setMode("start");
              }}
              className="w-full rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </form>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Without your recovery phrase, a wiped device means a lost account.
        </p>
      </div>
    </div>
  );
}
