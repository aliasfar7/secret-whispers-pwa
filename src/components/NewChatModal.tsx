import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createGroupRoom,
  getOrCreateDirectRoom,
  searchUsers,
} from "@/lib/chat";
import { friendlyError } from "@/lib/errors";
import { X, Users, User as UserIcon, Search, AlertTriangle } from "lucide-react";

type Found = { id: string; username: string; public_key: string };

export function NewChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const { profile, keyPair } = useAuth();
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [selected, setSelected] = useState<Found[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(query, profile.id);
        setResults(r);
      } catch (e: any) {
        setErr(e?.message ?? "Search failed");
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, profile]);

  const startDirect = async (u: Found) => {
    if (!profile || !keyPair) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await getOrCreateDirectRoom(
        { id: profile.id, keyPair },
        { id: u.id, public_key: u.public_key }
      );
      onCreated(id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create chat");
      setBusy(false);
    }
  };

  const toggleSelect = (u: Found) => {
    setSelected((s) =>
      s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]
    );
  };

  const createGroup = async () => {
    if (!profile || !keyPair) return;
    if (!groupName.trim() || selected.length === 0) {
      setErr("Pick a name and at least one member");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const id = await createGroupRoom(
        { id: profile.id, keyPair },
        groupName.trim(),
        selected.map((s) => ({ id: s.id, public_key: s.public_key }))
      );
      onCreated(id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create group");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">New conversation</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2 px-5 pt-4">
          <button
            onClick={() => setMode("direct")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              mode === "direct"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <UserIcon className="h-4 w-4" /> Direct
          </button>
          <button
            onClick={() => setMode("group")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              mode === "group"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <Users className="h-4 w-4" /> Group
          </button>
        </div>

        <div className="space-y-3 p-5">
          {mode === "group" && (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {mode === "group" && selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleSelect(s)}
                  className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary"
                >
                  @{s.username} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <ul className="max-h-64 overflow-y-auto">
            {results.length === 0 && query && (
              <li className="px-2 py-3 text-sm text-muted-foreground">No matches</li>
            )}
            {results.map((u) => {
              const sel = selected.some((s) => s.id === u.id);
              return (
                <li key={u.id}>
                  <button
                    disabled={busy}
                    onClick={() => (mode === "direct" ? startDirect(u) : toggleSelect(u))}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent ${
                      sel ? "bg-accent" : ""
                    }`}
                  >
                    <span className="text-foreground">@{u.username}</span>
                    {mode === "group" && sel && (
                      <span className="text-xs text-primary">Selected</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {err && <p className="text-sm text-destructive">{err}</p>}

          {mode === "group" && (
            <button
              onClick={createGroup}
              disabled={busy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : `Create group (${selected.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
