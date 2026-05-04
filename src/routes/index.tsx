import { createFileRoute } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { App } from "@/components/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cipher — End-to-End Encrypted Messaging" },
      {
        name: "description",
        content:
          "Zero-knowledge end-to-end encrypted group messaging. Built with TweetNaCl and Supabase.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
