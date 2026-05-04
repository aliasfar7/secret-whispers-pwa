import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getStored } from "@/lib/keystore";
import { Check, Copy, ShieldAlert, X } from "lucide-react";

export function RecoveryPhraseDialog({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const [phrase, setPhrase] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    (async () => {
      if (!session) return;
      const s = await getStored(session.user.id);
      setPhrase(s?.phrase ?? null);
    })();
  }, [session]);

  const copy = async () => {
    if (!phrase) return;
    await navigator.clipboard.writeText(phrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recovery phrase</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Anyone with this phrase can take over your account. Keep it secret.</span>
        </div>

        {phrase == null ? (
          <p className="text-sm text-muted-foreground">
            No recovery phrase is stored on this device. You may have restored your
            account using one — keep that copy safe.
          </p>
        ) : !reveal ? (
          <button
            onClick={() => setReveal(true)}
            className="w-full rounded-full bg-primary px-4 py-3 font-medium text-primary-foreground"
          >
            Tap to reveal
          </button>
        ) : (
          <>
            <ol className="grid grid-cols-2 gap-2 text-sm">
              {phrase.split(" ").map((w, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-[var(--bubble-theirs)] px-3 py-2 font-mono"
                >
                  <span className="w-5 text-right text-xs text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span>{w}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={copy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:bg-accent"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy phrase"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
