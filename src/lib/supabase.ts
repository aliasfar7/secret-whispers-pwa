import { createClient } from "@supabase/supabase-js";

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://cdnaiouhhavlbitxljss.supabase.co";

const anon =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbmFpb3VoaGF2bGJpdHhsanNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDU1NDksImV4cCI6MjA5MzQ4MTU0OX0.sSfrrsrisU_GrzAZfQzJK0nLFCDtJ6T30N78E-njhO8";

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
