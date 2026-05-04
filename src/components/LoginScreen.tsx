import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Lock, MessageCircle } from "lucide-react";

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
    <div className="flex min-h-[100dvh] flex-col items-center justify-between bg-background px-6 py-10">
      <div />
      <div className="flex flex-col items-center text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
          <MessageCircle className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Cipher</h1>
        <p className="mt-3 max-w-xs text-sm text-muted-foreground">
          Private messaging with end-to-end encryption. No email, no password — your
          identity and keys live only on this device.
        </p>
      </div>
      <div className="w-full max-w-sm">
        {err && <p className="mb-3 text-center text-sm text-destructive">{err}</p>}
        <button
          onClick={start}
          disabled={loading}
          className="w-full rounded-full bg-primary px-4 py-3.5 text-base font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Starting…" : "Continue"}
        </button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Clearing browser data will erase your account.
        </p>
      </div>
    </div>
  );
}
