import { useCallback, useEffect, useMemo, useState } from "react";
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
import { RecoveryPhraseDialog } from "./RecoveryPhraseDialog";
import { MessageSquarePlus, MoreVertical, Search } from "lucide-react";

export function ChatShell() {
  const { profile, keyPair, signOut } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!profile || !keyPair) return;
    const list = await listRoomsForUser(profile.id);
    const hydrated = await Promise.all(
      list.map(async (r) => {
        if (r.is_group && r.name) {
          const key = await getMyRoomKey(r.id, { id: profile.id, keyPair });
          r.display_name = key ? decryptRoomName(r.name, key) : "Encrypted group";
        } else if (!r.is_group) {
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
  }, [keyPair, profile]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!profile) return;
    const membershipsChannel = supabase
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reload();
      });

    const messagesChannel = supabase
      .channel(`rooms:${profile.id}:messages`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => reload()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membershipsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [profile, reload]);

  useEffect(() => {
    if (!profile || !keyPair) return;

    const refresh = () => {
      void reload();
    };

    const intervalId = window.setInterval(refresh, 2500);
    window.addEventListener("focus", refresh);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [keyPair, profile, reload]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeId),
    [rooms, activeId]
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Chat list — full screen on mobile, fixed pane on md+ */}
      <aside
        className={`flex h-full w-full flex-col border-r border-border bg-sidebar md:w-[360px] lg:w-[400px] ${
          activeRoom ? "hidden md:flex" : "flex"
        }`}
      >
        <header className="flex items-center justify-between bg-[var(--header-bg)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/25 text-sm font-semibold text-primary">
              {profile?.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-base font-medium">Chats</span>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => setMenuOpen((s) => !s)}
              className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Menu"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
                onClick={() => setMenuOpen(false)}
              >
                <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                  @{profile?.username}
                </div>
                <button
                  onClick={() => setRecoveryOpen(true)}
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  Recovery phrase
                </button>
                <button
                  onClick={signOut}
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <Sidebar
          rooms={rooms}
          loading={loading}
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
        />

        <button
          onClick={() => setModalOpen(true)}
          className="absolute bottom-5 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 md:bottom-6 md:right-auto md:left-[calc(360px-72px)] lg:left-[calc(400px-72px)]"
          aria-label="New chat"
        >
          <MessageSquarePlus className="h-6 w-6" />
        </button>
      </aside>

      {/* Conversation pane */}
      <main
        className={`h-full flex-1 ${activeRoom ? "flex" : "hidden md:flex"} flex-col`}
      >
        {activeRoom ? (
          <ChatRoom
            room={activeRoom}
            key={activeRoom.id}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="chat-doodle flex flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-xs">
              <p className="text-foreground">Select a chat to start messaging</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your messages are end-to-end encrypted.
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

      {recoveryOpen && <RecoveryPhraseDialog onClose={() => setRecoveryOpen(false)} />}
    </div>
  );
}
