import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Lock, Mail } from "lucide-react";

export function LoginScreen() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send link");
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

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <Mail className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="font-medium text-foreground">Check your email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a magic link to <span className="text-foreground">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-6 shadow-xl">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Your private key never leaves this device.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
