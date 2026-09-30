import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { initPushAfterLogin } from "@/lib/push";
import { getSingletonSocket } from "@/hooks/useSocket";

/**
 * App-root push bridge.
 *
 * - Registers /sw.js and (silently) subscribes to push once the user is
 *   authenticated — permission is NEVER requested here (no spam); the prompt
 *   lives on the Calls page banner and on call start.
 * - Handles 'sw-call-action' messages from the service worker:
 *     accept  → route to /join-call?call=<id>&auto=1 (the ringing UI)
 *     decline → emit call:reject on the socket
 */
export default function PushManager() {
  const navigate = useNavigate();
  const location = useLocation();

  // Register + silent subscribe after login.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    initPushAfterLogin();
  }, []);

  // SW notification actions → app behavior.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "sw-call-action") return;
      if (data.action === "accept" && data.callId) {
        navigate(`/join-call?call=${encodeURIComponent(data.callId)}&auto=1`, {
          replace: location.pathname === "/join-call",
        });
      } else if (data.action === "decline" && data.callId) {
        try {
          getSingletonSocket()?.emit("call:reject", { callId: data.callId });
        } catch {
          /* socket not ready — nothing else to do */
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [navigate, location.pathname]);

  return null;
}
