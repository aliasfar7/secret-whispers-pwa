import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Lock } from "lucide-react";

export function LoginScreen() {
  const { signInAnonymously } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Cipher</h1>
          <p className="text-sm text-muted-foreground">
            Zero-knowledge end-to-end encrypted messaging.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <p className="text-sm text-muted-foreground">
            No email, no password. Your identity and private key live only on this device.
          </p>
          {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
          <button
            onClick={start}
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Starting…" : "Continue"}
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Clearing browser data will erase your account and keys.
          </p>
        </div>
      </div>
    </div>
  );
}
