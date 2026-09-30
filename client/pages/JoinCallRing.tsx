import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import IncomingCallModal, { IncomingCallData } from "@/components/IncomingCallModal";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";

interface CallLookup {
  call?: {
    id?: string;
    type?: string;
    callCode?: string | null;
    status?: string;
    hostId?: string | null;
    createdById?: string | null;
    waitingRoomEnabled?: boolean;
    hasPassword?: boolean;
    participants?: Array<{ userId?: string; userName?: string | null }>;
  } | null;
}

/**
 * Deep-link landing for push notifications: /join-call?call=<callId>&auto=1.
 *
 * When the app is opened from an "Incoming call" notification (or the SW
 * 'accept' action), this page triggers the SAME incoming-call UI the socket
 * uses — the full-screen modal ringing with /sounds/ringtone.mp3 — reusing
 * IncomingCallModal with the call details fetched from GET /calls/:id.
 */
export default function JoinCallRing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callParam = searchParams.get("call") || searchParams.get("callId") || "";
  const isAuthenticated = !!localStorage.getItem("token");

  const [call, setCall] = useState<IncomingCallData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !callParam) return;
    let cancelled = false;

    // Show a usable modal immediately (callId is enough to accept/reject);
    // details upgrade it when the lookup resolves.
    setCall({
      callId: callParam,
      from: "",
      fromName: "Incoming call",
      type: "video",
      roomId: callParam,
    });

    api
      .get(`/calls/${callParam}`)
      .then((res) => {
        if (cancelled) return;
        const data = unwrapApiData<CallLookup>(res.data, "");
        const c = data?.call || (data as any);
        const myId = localStorage.getItem("userId") || "";
        const other = (c?.participants || []).find(
          (p: any) => p?.userId && p.userId !== myId && p?.userName,
        );
        setCall({
          callId: c?.id || callParam,
          callCode: c?.callCode || undefined,
          from: c?.hostId || c?.createdById || other?.userId || "",
          fromName: other?.userName || "Incoming call",
          type: c?.type === "audio" ? "audio" : "video",
          roomId: c?.callCode || callParam,
          waitingRoomEnabled: !!c?.waitingRoomEnabled,
          hasPassword: !!c?.hasPassword,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiMessage(err, "This call is no longer available."));
      });

    return () => {
      cancelled = true;
    };
  }, [callParam, isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!callParam) {
    return <Navigate to="/calls" replace />;
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      {error ? (
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            onClick={() => navigate("/calls")}
          >
            Back to Calls
          </button>
        </div>
      ) : (
        <>
          {/* Ambient loading hint behind the ringing modal */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting…
          </div>
          <IncomingCallModal call={call} onClose={() => navigate("/calls", { replace: true })} />
        </>
      )}
    </div>
  );
}
