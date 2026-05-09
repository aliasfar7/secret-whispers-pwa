import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cacheMessageText, getCachedMessageTexts } from "@/lib/messageCache";
import {
  decryptMessageForRoom,
  fetchMessages,
  getMyRoomKey,
  getRoomMembers,
  sendDirectMessage,
  sendGroupMessage,
  type DecryptedMessage,
  type RawMessage,
  type Room,
} from "@/lib/chat";
import { ArrowLeft, Check, CheckCheck, Clock, Lock, LockOpen, MoreVertical, Send, ShieldAlert, ShieldCheck, Smile, TriangleAlert, X } from "lucide-react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

type MsgStatus = "sending" | "sent" | "delivered" | "failed";
type UIMessage = DecryptedMessage & { status?: MsgStatus; tempId?: string };

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

function mergeRawMessages(current: RawMessage[], incoming: RawMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
  return Array.from(merged.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function StatusTick({ status }: { status?: MsgStatus }) {
  if (!status) return null;
  if (status === "sending") return <Clock className="h-3 w-3 opacity-70" />;
  if (status === "failed")
    return <TriangleAlert className="h-3 w-3 text-red-400" />;
  if (status === "sent") return <Check className="h-3 w-3 opacity-70" />;
  // delivered
  return <CheckCheck className="h-3 w-3 text-sky-300" />;
}

export function ChatRoom({ room, onBack }: { room: Room; onBack?: () => void }) {
  const { profile, keyPair } = useAuth();
  const [members, setMembers] = useState<
    { user_id: string; username: string; public_key: string }[]
  >([]);
  const [roomKey, setRoomKey] = useState<Uint8Array | null>(null);
  // Raw rows (re-decrypted on render so late-arriving keys/members recover msgs).
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  // Status overlay keyed by message id (for our own outgoing messages).
  const [statusById, setStatusById] = useState<Record<string, MsgStatus>>({});
  const [cachedTextById, setCachedTextById] = useState<Record<string, string>>({});
  // Optimistic, not-yet-saved outgoing messages.
  const [pending, setPending] = useState<UIMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const syncMessages = useCallback(async () => {
    if (!profile) return;

    const raw = await fetchMessages(room.id);
    console.info("[chat] syncMessages", {
      roomId: room.id,
      profileId: profile.id,
      fetchedCount: raw.length,
    });

    setRawMessages((prev) => {
      const next = mergeRawMessages(prev, raw);
      const unchanged =
        prev.length === next.length &&
        prev.every(
          (message, index) =>
            message.id === next[index]?.id &&
            message.encrypted_content === next[index]?.encrypted_content &&
            message.nonce === next[index]?.nonce &&
            message.created_at === next[index]?.created_at
        );

      return unchanged ? prev : next;
    });

    const cachedTexts = await getCachedMessageTexts(
      room.id,
      raw.map((message) => message.id)
    );

    setCachedTextById((prev) => {
      const hasChanges = Object.entries(cachedTexts).some(
        ([messageId, cachedText]) => prev[messageId] !== cachedText
      );
      return hasChanges ? { ...prev, ...cachedTexts } : prev;
    });

    setStatusById((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const message of raw) {
        if (message.sender_id === profile.id && !next[message.id]) {
          next[message.id] = "sent";
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [profile, room.id]);

  useEffect(() => {
    if (!profile || !keyPair) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const mems = await getRoomMembers(room.id);
        if (cancelled) return;
        setMembers(mems);
        if (room.is_group) {
          const rk = await getMyRoomKey(room.id, { id: profile.id, keyPair });
          if (cancelled) return;
          setRoomKey(rk);
        }

        await syncMessages();
        if (cancelled) return;
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load room");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id, room.is_group, profile?.id, keyPair, syncMessages]);

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
          console.info("[chat] realtime message insert", {
            roomId: room.id,
            messageId: raw.id,
            senderId: raw.sender_id,
            viewerId: profile.id,
          });
          setRawMessages((prev) =>
            prev.some((m) => m.id === raw.id) ? prev : [...prev, raw]
          );
          if (raw.sender_id === profile.id) {
            setStatusById((s) => (s[raw.id] ? s : { ...s, [raw.id]: "sent" }));
          }
        }
      )
      .subscribe((status) => {
        console.info("[chat] messages subscription status", { roomId: room.id, status });
        if (status === "SUBSCRIBED") {
          void syncMessages();
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [room.id, profile?.id, syncMessages]);

  useEffect(() => {
    if (!profile) return;

    const refresh = () => {
      void syncMessages();
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
  }, [profile, syncMessages]);

  // Decrypt raw messages on every render so late context updates recover them.
  const decryptedMessages: UIMessage[] = rawMessages.map((r) => ({
    ...(() => {
      const decrypted = decryptMessageForRoom(r, {
        isGroup: room.is_group,
        me: keyPair,
        myUserId: profile?.id,
        members,
        roomKey,
      });
      const cachedText = cachedTextById[r.id];
      if (!decrypted.text && cachedText) {
        return {
          ...decrypted,
          text: cachedText,
          failed: false,
        };
      }
      return decrypted;
    })(),
    status: r.sender_id === profile?.id ? statusById[r.id] ?? "sent" : undefined,
  }));

  useEffect(() => {
    const visibleMessages = decryptedMessages.filter((message) => message.text);
    if (visibleMessages.length === 0) return;

    void Promise.all(
      visibleMessages.map(async (message) => {
        if (cachedTextById[message.id] === message.text) return;
        await cacheMessageText(room.id, message.id, message.text);
      })
    ).then(() => {
      setCachedTextById((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const message of visibleMessages) {
          if (next[message.id] !== message.text) {
            next[message.id] = message.text;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, [cachedTextById, decryptedMessages, room.id]);

  const messages: UIMessage[] = [
    ...decryptedMessages.filter((message) => Boolean(message.text?.trim()) || Boolean(message.tempId)),
    ...pending,
  ];

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !keyPair || !text.trim()) return;
    setSending(true);
    setErr(null);
    setEmojiOpen(false);
    const body = text.trim();
    setText("");
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: UIMessage = {
      id: tempId,
      tempId,
      room_id: room.id,
      sender_id: profile.id,
      sender_username: profile.username,
      created_at: new Date().toISOString(),
      text: body,
      status: "sending",
    };
    setPending((prev) => [...prev, optimistic]);
    try {
      let saved: RawMessage;
      if (room.is_group) {
        if (!roomKey) throw new Error("No room key");
        saved = await sendGroupMessage(room.id, body, profile.id, roomKey);
      } else {
        const other = members.find((m) => m.user_id !== profile.id);
        if (!other) throw new Error("Recipient not found");
        saved = await sendDirectMessage(
          room.id,
          body,
          { id: profile.id, keyPair },
          { public_key: other.public_key }
        );
      }
      // Replace optimistic with real raw row, then drop the pending bubble.
      await cacheMessageText(room.id, saved.id, body);
      setRawMessages((prev) =>
        prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]
      );
      setStatusById((s) => ({ ...s, [saved.id]: "sent" }));
      setCachedTextById((prev) => ({ ...prev, [saved.id]: body }));
      setPending((prev) => prev.filter((m) => m.tempId !== tempId));
    } catch (e: any) {
      console.error("[chat] send failed in ChatRoom", {
        roomId: room.id,
        profileId: profile.id,
        error: e,
      });
      setErr(e?.message ?? "Failed to send");
      setPending((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, status: "failed" } : m))
      );
    } finally {
      setSending(false);
    }
  };

  const title = room.display_name ?? "Chat";

  // Swipe-back handlers (mobile only)
  const onTouchStart = (e: React.TouchEvent) => {
    if (!onBack) return;
    const t = e.touches[0];
    // Only start if swipe begins near left edge
    if (t.clientX > 40) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      touchStart.current = null;
      setDragging(false);
      setDragX(0);
      return;
    }
    if (dx > 0) setDragX(Math.min(dx, 240));
  };
  const onTouchEnd = () => {
    if (!touchStart.current) return;
    const shouldClose = dragX > 90;
    touchStart.current = null;
    setDragging(false);
    setDragX(0);
    if (shouldClose) onBack?.();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        transition: dragging ? "none" : "transform 200ms ease",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
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
          {messages.map((m, i, arr) => {
            const mine = m.sender_id === profile?.id;
            const prev = arr[i - 1];
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
                    tail ? (mine ? "rounded-tr-sm" : "rounded-tl-sm") : ""
                  }`}
                  style={{ minWidth: 64, paddingBottom: 22 }}
                >
                  {showName && (
                    <div className="mb-0.5 text-xs font-medium text-primary">
                      {m.sender_username ?? "unknown"}
                    </div>
                  )}
                  <span
                    className={`block whitespace-pre-wrap break-words leading-relaxed ${
                      mine ? "pr-20" : "pr-16"
                    }`}
                  >
                    {m.text}
                  </span>
                  <span
                    className={`pointer-events-none absolute bottom-1 right-2 flex items-center gap-1 text-[10px] ${
                      mine ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3 text-emerald-300" aria-label="Decrypted locally" />
                    {formatTime(m.created_at)}
                    {mine && <StatusTick status={m.status} />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {err && <div className="bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</div>}

      {/* Emoji picker */}
      {emojiOpen && (
        <div className="relative">
          <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-border bg-[var(--header-bg)]">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Emoji</span>
              <button
                onClick={() => setEmojiOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close emoji picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EmojiPicker
              onEmojiClick={(d) => {
                setText((t) => t + d.emoji);
                inputRef.current?.focus();
              }}
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              width="100%"
              height={340}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              searchDisabled={false}
              skinTonesDisabled
            />
          </div>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={send}
        className="flex items-end gap-2 bg-[var(--header-bg)] px-2 py-2 md:px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        <button
          type="button"
          onClick={() => setEmojiOpen((s) => !s)}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full hover:bg-accent ${
            emojiOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Emoji"
        >
          <Smile className="h-6 w-6" />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setEmojiOpen(false)}
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
