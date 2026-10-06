/*
 * MetriCorex service worker — web push for incoming calls.
 *
 * push payloads (JSON):
 *   { type: 'incoming-call', callId, callerName?, url? }
 *     → persistent, vibrating "Incoming call" notification with
 *       Accept / Decline actions.
 *   { type: 'missed-call', callId?, callerName?, url? }
 *     → normal notification.
 *   anything else with title/body → generic notification.
 *
 * notificationclick:
 *   - accept → postMessage { type:'sw-call-action', action:'accept', callId }
 *     to the app (which opens /join-call?call=<id>&auto=1 and rings the UI),
 *     focusing an existing client when possible.
 *   - decline → postMessage { type:'sw-call-action', action:'decline', callId }.
 *   - default → focus or open notification.data.url.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch (e) {
    try {
      return { body: event.data ? event.data.text() : "" };
    } catch (e2) {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  const data = parsePushPayload(event);
  const type = data.type || data.kind || "";
  const callId = data.callId || data.call_id || null;
  const callerName = data.callerName || data.caller_name || data.title || "Someone";

  if (type === "incoming-call") {
    const deepLink = data.url || "/join-call?call=" + encodeURIComponent(callId || "") + "&auto=1";
    event.waitUntil(
      self.registration.showNotification("Incoming call", {
        body: callerName + " is calling you…",
        tag: "incoming-call",
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400, 200, 400],
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: deepLink, callId: callId, type: "incoming-call" },
        actions: [
          { action: "accept", title: "Accept" },
          { action: "decline", title: "Decline" },
        ],
      }),
    );
    return;
  }

  if (type === "missed-call") {
    const deepLink = data.url || "/calls";
    event.waitUntil(
      self.registration.showNotification("Missed call", {
        body: callerName + (callerName.endsWith("s") ? "'" : "'s") + " call was missed.",
        tag: "missed-call-" + (callId || Date.now()),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: deepLink, callId: callId, type: "missed-call" },
      }),
    );
    return;
  }

  if (type === "chat-message") {
    const sender = data.senderName || data.sender_name || data.title || "New message";
    const convo = data.conversationId || data.conversation_id || "";
    const body = data.message || data.body || "";
    const deepLink = "/chat" + (convo ? "?conversation=" + encodeURIComponent(convo) : "");
    event.waitUntil(
      self.registration.showNotification(sender, {
        body: body,
        tag: data.tag || ("chat-" + (convo || Date.now())),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: deepLink, conversationId: convo, type: "chat-message" },
      }),
    );
    return;
  }

  // Generic fallback (chat messages, etc. — payload { title?, body?, url? }).
  if (data.title || data.body) {
    event.waitUntil(
      self.registration.showNotification(data.title || "MetriCorex", {
        body: data.body || "",
        tag: data.tag || undefined,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/", type: type || "generic" },
      }),
    );
  }
});

async function postActionToClients(action, callId) {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: "sw-call-action", action: action, callId: callId });
  }
  return clientList;
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  notification.close();

  event.waitUntil(
    (async () => {
      if (action === "accept" || action === "decline") {
        const clientList = await postActionToClients(action, data.callId);
        // Ensure the app window is visible so the ringing UI can take over.
        const visible = clientList.find((c) => c.visibilityState === "visible") || clientList[0];
        if (visible) {
          try {
            await visible.focus();
          } catch (e) {
            /* focus may be blocked — the notification is already handled */
          }
        } else if (action === "accept" && data.url) {
          await self.clients.openWindow(data.url);
        }
        return;
      }

      // Default click → focus existing client or open the deep link.
      const urlToOpen = new URL(data.url || "/", self.location.origin).href;
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientList.find((c) => c.url === urlToOpen);
      if (existing) {
        await existing.focus();
      } else if (clientList.length > 0) {
        const anyClient = clientList[0];
        await anyClient.focus();
        try {
          anyClient.navigate(urlToOpen);
        } catch (e) {
          /* older browsers — focus is good enough */
        }
      } else {
        await self.clients.openWindow(urlToOpen);
      }
    })(),
  );
});
