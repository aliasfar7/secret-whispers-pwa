import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { LoginScreen } from "./LoginScreen";
import { UsernameScreen } from "./UsernameScreen";
import { BackupPhraseScreen } from "./BackupPhraseScreen";
import { ChatShell } from "./ChatShell";
import { Lock } from "lucide-react";

export function App() {
  const { session, profile, loading, needsUsername, pendingBackupPhrase } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
          <Lock className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Configure Supabase</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> in your{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">.env</code> file, then run the SQL in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">supabase/schema.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  if (needsUsername || !profile) return <UsernameScreen />;
  if (pendingBackupPhrase) return <BackupPhraseScreen />;
  return <ChatShell />;
}
