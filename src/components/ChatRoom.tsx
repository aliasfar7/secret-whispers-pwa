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
import { ArrowLeft, Lock, MoreVertical, Send, Smile } from "lucide-react";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

export function ChatRoom({ room, onBack }: { room: Room; onBack?: () => void }) {
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

  const title = room.display_name ?? "Chat";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 bg-[var(--header-bg)] px-2 py-2 md:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-full p-2 text-foreground hover:bg-accent md:hidden"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bubble-theirs)] text-sm font-semibold">
          {initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{title}</div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            end-to-end encrypted · {members.length} member{members.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="More"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollerRef} className="chat-doodle flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-1">
          <div className="mx-auto mb-3 rounded-md bg-yellow-500/10 px-3 py-1.5 text-center text-[11px] text-yellow-200/90 ring-1 ring-yellow-500/20">
            <Lock className="mr-1 inline h-3 w-3" />
            Messages are end-to-end encrypted. No one outside this chat can read them.
          </div>
          {messages.length === 0 && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              No messages yet. Say hi 👋
            </div>
          )}
          {messages.map((m, i) => {
            const mine = m.sender_id === profile?.id;
            const prev = messages[i - 1];
            const showName = room.is_group && !mine && prev?.sender_id !== m.sender_id;
            const tail = prev?.sender_id !== m.sender_id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[78%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${
                    mine
                      ? "bg-[var(--bubble-mine)] text-[var(--bubble-mine-fg)]"
                      : "bg-[var(--bubble-theirs)] text-[var(--bubble-theirs-fg)]"
                  } ${
                    tail
                      ? mine
                        ? "rounded-tr-sm"
                        : "rounded-tl-sm"
                      : ""
                  }`}
                  style={{ minWidth: 64 }}
                >
                  {showName && (
                    <div className="mb-0.5 text-xs font-medium text-primary">
                      {m.sender_username ?? "unknown"}
                    </div>
                  )}
                  {m.failed ? (
                    <span className="italic opacity-70">Unable to decrypt</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words pr-12">{m.text}</span>
                  )}
                  <span
                    className={`pointer-events-none absolute bottom-1 right-2 text-[10px] ${
                      mine ? "text-white/60" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(m.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {err && <div className="bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</div>}

      {/* Composer */}
      <form
        onSubmit={send}
        className="flex items-end gap-2 bg-[var(--header-bg)] px-2 py-2 md:px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        <button
          type="button"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Emoji"
        >
          <Smile className="h-6 w-6" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          placeholder="Message"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-[var(--bubble-theirs)] px-4 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-60"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
