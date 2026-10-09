import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { useToast } from "@/components/ui/use-toast";

type JoinedConversation = {
  id?: string;
  name?: string | null;
  displayName?: string | null;
  type?: string;
};

/**
 * Join-by-invite landing page (/chat/join/:code).
 *
 * Invite links look like https://app.metricorex.com/chat/join/<code> and are
 * generated in the group-info sheet. On mount (authenticated) we POST
 * /chat/join/:code and hand the hydrated conversation to /chat via
 * location.state.openConversationId (Chat selects it once its list loads).
 * Invalid/expired/wrong-workspace codes render a friendly error card.
 */
export default function JoinChat() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAuthenticated = !!localStorage.getItem("token");

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !code) return;
    let cancelled = false;

    api
      .post(`/chat/join/${encodeURIComponent(code)}`)
      .then((res) => {
        const conversation = unwrapApiData<JoinedConversation>(res.data, "");
        if (cancelled) return;
        const name = conversation?.displayName || conversation?.name || "the group";
        toast({ title: `Joined ${name}`, description: "Say hi to everyone 👋" });
        // Make sure the freshly joined conversation is in the list cache
        // before Chat mounts (refetchOnWindowFocus is off, staleTime 30s).
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        navigate("/chat", {
          replace: true,
          state: conversation?.id ? { openConversationId: conversation.id } : undefined,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(getApiMessage(err, "This invite link is invalid or has expired."));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [code, isAuthenticated, navigate, queryClient, toast]);

  // Same auth convention as TokenProtectedRoute / JoinCallRing: bounce to /login.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!code) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-500/5 to-violet-500/5 p-6">
      {status === "error" ? (
        <Card className="w-full max-w-sm rounded-2xl shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
              <Users className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Can't join this group</h1>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button className="mt-2 rounded-xl" onClick={() => navigate("/chat")}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Go to chats
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-sm rounded-2xl shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/15">
              <Users className="h-7 w-7 text-blue-500" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Joining group chat…</h1>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              One moment while we add you.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
