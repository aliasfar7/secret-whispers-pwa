import type { Room } from "@/lib/chat";
import { Users, User } from "lucide-react";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export function Sidebar({
  rooms,
  loading,
  activeId,
  onSelect,
}: {
  rooms: Room[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }
  if (rooms.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-muted-foreground">
        No conversations yet.
        <br />
        Tap the green button to start one.
      </div>
    );
  }
  return (
    <ul className="flex-1 overflow-y-auto">
      {rooms.map((r) => {
        const active = r.id === activeId;
        const name = r.display_name ?? (r.is_group ? "Encrypted group" : "Direct chat");
        return (
          <li key={r.id}>
            <button
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-accent ${
                active ? "bg-accent/70" : "hover:bg-accent/40"
              }`}
            >
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  r.is_group
                    ? "bg-primary/25 text-primary"
                    : "bg-[var(--bubble-theirs)] text-foreground"
                }`}
              >
                {r.is_group ? <Users className="h-5 w-5" /> : initials(name) || <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1 border-b border-border/60 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-medium text-foreground">{name}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.is_group ? "Group · end-to-end encrypted" : "End-to-end encrypted"}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
