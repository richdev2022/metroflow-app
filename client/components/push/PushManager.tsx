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
 * - Handles service-worker messages:
 *     'sw-call-action'   accept  → route to /join-call?call=<id>&auto=1 (the ringing UI)
 *     'sw-call-action'   decline → emit call:reject on the socket
 *     'sw-request-token'         → hand the SW the auth token + API base over
 *                               its MessageChannel so notification actions
 *                               (e.g. chat "Mark as read") can call the API
 *                               — the SW itself cannot read localStorage.
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
      if (!data || typeof data !== "object") return;
      if (data.type === "sw-request-token") {
        // Reply over the SW's MessageChannel — one-shot auth handoff for
        // notification action buttons (chat mark-as-read). userId/businessId
        // ride along because this app's API identifies requests via the
        // x-user-id / x-business-id headers (see api-client.ts).
        const port = event.ports && event.ports[0];
        if (port) {
          try {
            port.postMessage({
              token: localStorage.getItem("token") || "",
              apiBase: (import.meta.env.VITE_API_BASE_URL || "/api").trim(),
              userId: localStorage.getItem("userId") || "",
              businessId: localStorage.getItem("businessId") || "",
            });
          } catch {
            /* port closed — the SW falls back to opening the app */
          }
        }
        return;
      }
      if (data.type !== "sw-call-action") return;
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
