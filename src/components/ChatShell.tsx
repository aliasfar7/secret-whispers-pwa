import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  decryptRoomName,
  getMyRoomKey,
  listRoomsForUser,
  type Room,
} from "@/lib/chat";
import { Sidebar } from "./Sidebar";
import { ChatRoom } from "./ChatRoom";
import { NewChatModal } from "./NewChatModal";
import { Lock, Plus, Menu } from "lucide-react";

export function ChatShell() {
  const { profile, keyPair, signOut } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!profile || !keyPair) return;
    const list = await listRoomsForUser(profile.id);
    // Hydrate display names
    const hydrated = await Promise.all(
      list.map(async (r) => {
        if (r.is_group && r.name) {
          const key = await getMyRoomKey(r.id, { id: profile.id, keyPair });
          r.display_name = key ? decryptRoomName(r.name, key) : "Encrypted group";
        } else if (!r.is_group) {
          // Fetch the other member's username
          const { data } = await supabase
            .from("room_members")
            .select("user_id")
            .eq("room_id", r.id)
            .neq("user_id", profile.id);
          const otherId = data?.[0]?.user_id;
          if (otherId) {
            const { data: u } = await supabase
              .from("users")
              .select("username")
              .eq("id", otherId)
              .maybeSingle();
            r.display_name = u?.username ?? "Direct chat";
          }
        }
        return r;
      })
    );
    setRooms(hydrated);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Subscribe to membership changes (new rooms added)
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`memberships:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_members",
          filter: `user_id=eq.${profile.id}`,
        },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const activeRoom = useMemo(() => rooms.find((r) => r.id === activeId), [rooms, activeId]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`absolute z-20 h-full w-80 transform border-r border-border bg-sidebar transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <span className="font-semibold">Cipher</span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-primary/15 p-2 text-primary hover:bg-primary/25"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>
        <div className="px-4 py-3 text-xs text-muted-foreground">
          Signed in as <span className="text-foreground">@{profile?.username}</span>
        </div>
        <Sidebar
          rooms={rooms}
          loading={loading}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
        />
        <div className="border-t border-border p-3">
          <button
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-card/40 px-3 py-2 md:hidden">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded-md p-2 hover:bg-accent"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium">{activeRoom?.display_name ?? "Cipher"}</span>
        </div>

        {activeRoom ? (
          <ChatRoom room={activeRoom} key={activeRoom.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-foreground">Select a conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Or start a new one with the + button.
              </p>
            </div>
          </div>
        )}
      </main>

      {modalOpen && (
        <NewChatModal
          onClose={() => setModalOpen(false)}
          onCreated={async (id) => {
            setModalOpen(false);
            await reload();
            setActiveId(id);
          }}
        />
      )}
    </div>
  );
}
