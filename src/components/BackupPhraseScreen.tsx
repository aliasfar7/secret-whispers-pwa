import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Check, Copy, ShieldAlert } from "lucide-react";

export function BackupPhraseScreen() {
  const { pendingBackupPhrase, acknowledgeBackup } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!pendingBackupPhrase) return null;
  const words = pendingBackupPhrase.split(" ");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pendingBackupPhrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
          <ShieldAlert className="h-7 w-7 text-amber-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Save your recovery phrase</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          These 12 words are the <strong>only</strong> way to recover your account on a new
          device or after clearing browser data. Write them down or store them in a password
          manager. Never share them.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-[var(--bubble-theirs)] p-4">
          <ol className="grid grid-cols-2 gap-2 text-sm">
            {words.map((w, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-background/40 px-3 py-2 font-mono"
              >
                <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
                <span className="text-foreground">{w}</span>
              </li>
            ))}
          </ol>
          <button
            onClick={copy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-foreground hover:bg-accent"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy phrase"}
          </button>
        </div>

        <label className="mt-6 flex items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>I have saved my recovery phrase somewhere safe.</span>
        </label>

        <button
          disabled={!confirmed}
          onClick={acknowledgeBackup}
          className="mt-6 w-full rounded-full bg-primary px-4 py-3.5 font-medium text-primary-foreground active:scale-[0.98] disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
