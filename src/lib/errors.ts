/**
 * Convert Supabase/Postgres errors — especially RLS violations — into
 * user-friendly messages.
 */
type AnyErr = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
} | null | undefined;

const RLS_HINTS: Record<string, string> = {
  rooms:
    "You don't have permission to start this conversation. Your session may have expired — try signing out and back in.",
  room_members:
    "You can't join this conversation. You may have been removed, or the invite is no longer valid.",
  messages:
    "You can't post in this conversation. You may no longer be a member.",
  users:
    "You can't modify this profile.",
};

export function friendlyError(e: AnyErr, fallback = "Something went wrong"): string {
  if (!e) return fallback;
  const msg = e.message ?? "";

  // PostgREST / Postgres RLS violation
  if (
    e.code === "42501" ||
    /row-level security/i.test(msg) ||
    /violates row-level security policy/i.test(msg)
  ) {
    const m = msg.match(/for table "?([a-z_]+)"?/i);
    const table = m?.[1]?.toLowerCase();
    if (table && RLS_HINTS[table]) return RLS_HINTS[table];
    return "You don't have permission to do that.";
  }

  // Unique constraint
  if (e.code === "23505") {
    if (/users_username_key/.test(msg)) {
      return "That username is already taken.";
    }
    return "That already exists.";
  }

  // FK violation
  if (e.code === "23503") {
    return "Referenced item no longer exists.";
  }

  // Not authenticated / JWT
  if (e.status === 401 || /jwt|not authenticated|invalid token/i.test(msg)) {
    return "Your session expired. Please sign in again.";
  }

  // Network
  if (/failed to fetch|networkerror/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }

  return msg || fallback;
}
