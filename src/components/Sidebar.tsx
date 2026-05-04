import type { Room } from "@/lib/chat";
import { Hash, User } from "lucide-react";

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
      <div className="p-4 text-sm text-muted-foreground">
        No conversations yet. Tap + to start one.
      </div>
    );
  }
  return (
    <ul className="flex-1 overflow-y-auto px-2 py-1">
      {rooms.map((r) => {
        const active = r.id === activeId;
        return (
          <li key={r.id}>
            <button
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                active ? "bg-accent" : "hover:bg-accent/60"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  r.is_group ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.is_group ? <Hash className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {r.display_name ?? (r.is_group ? "Encrypted group" : "Direct chat")}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.is_group ? "Group" : "Direct"}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
