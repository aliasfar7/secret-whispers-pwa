import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  decryptDirect,
  decryptGroup,
  fetchMessages,
  getMyRoomKey,
  getRoomMembers,
  sendDirectMessage,
  sendGroupMessage,
  type DecryptedMessage,
  type RawMessage,
  type Room,
} from "@/lib/chat";
import { Send, Lock } from "lucide-react";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatRoom({ room }: { room: Room }) {
  const { profile, keyPair } = useAuth();
  const [members, setMembers] = useState<
    { user_id: string; username: string; public_key: string }[]
  >([]);
  const [roomKey, setRoomKey] = useState<Uint8Array | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const decryptOne = (
    raw: RawMessage,
    mems: typeof members,
    rk: Uint8Array | null
  ): DecryptedMessage => {
    const sender = mems.find((m) => m.user_id === raw.sender_id);
    let pt: string | null = null;
    if (room.is_group && rk) pt = decryptGroup(raw, rk);
    else if (!room.is_group && keyPair) pt = decryptDirect(raw, keyPair, mems);
    return {
      id: raw.id,
      room_id: raw.room_id,
      sender_id: raw.sender_id,
      sender_username: sender?.username,
      created_at: raw.created_at,
      text: pt ?? "",
      failed: pt === null,
    };
  };

  useEffect(() => {
    if (!profile || !keyPair) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const mems = await getRoomMembers(room.id);
        if (cancelled) return;
        setMembers(mems);
        let rk: Uint8Array | null = null;
        if (room.is_group) {
          rk = await getMyRoomKey(room.id, { id: profile.id, keyPair });
          if (cancelled) return;
          setRoomKey(rk);
        }
        const raw = await fetchMessages(room.id);
        if (cancelled) return;
        setMessages(raw.map((r) => decryptOne(r, mems, rk)));
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load room");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, profile?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`messages:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const raw = payload.new as RawMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === raw.id)) return prev;
            return [...prev, decryptOne(raw, members, roomKey)];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, members, roomKey, profile?.id]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !keyPair || !text.trim()) return;
    setSending(true);
    setErr(null);
    const body = text.trim();
    setText("");
    try {
      if (room.is_group) {
        if (!roomKey) throw new Error("No room key");
        await sendGroupMessage(room.id, body, profile.id, roomKey);
      } else {
        const other = members.find((m) => m.user_id !== profile.id);
        if (!other) throw new Error("Recipient not found");
        await sendDirectMessage(
          room.id,
          body,
          { id: profile.id, keyPair },
          { public_key: other.public_key }
        );
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send");
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="hidden items-center justify-between border-b border-border bg-card/40 px-5 py-3 md:flex">
        <div>
          <h2 className="font-semibold text-foreground">{room.display_name ?? "Chat"}</h2>
          <p className="text-xs text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" />
            End-to-end encrypted · {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            No messages yet. Say hi 👋
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === profile?.id;
          const prev = messages[i - 1];
          const showName = room.is_group && !mine && prev?.sender_id !== m.sender_id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%]">
                {showName && (
                  <div className="mb-0.5 ml-3 text-xs text-muted-foreground">
                    {m.sender_username ?? "unknown"}
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                    mine
                      ? "rounded-br-md bg-[var(--bubble-mine)] text-[var(--bubble-mine-fg)]"
                      : "rounded-bl-md bg-[var(--bubble-theirs)] text-[var(--bubble-theirs-fg)]"
                  }`}
                >
                  {m.failed ? (
                    <span className="italic opacity-70">Unable to decrypt message</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.text}</span>
                  )}
                  <div
                    className={`mt-1 text-[10px] ${
                      mine ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(m.created_at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <div className="px-4 pb-2 text-sm text-destructive">{err}</div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border bg-card/40 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
