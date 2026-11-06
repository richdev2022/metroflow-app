/*
 * MetriCorex service worker — web push for incoming calls.
 *
 * push payloads (JSON):
 *   { type: 'incoming-call', callId, callerName?, url? }
 *     → persistent, vibrating "Incoming call" notification with
 *       Accept / Decline actions.
 *   { type: 'missed-call', callId?, callerName?, url? }
 *     → normal notification.
 *   { type: 'chat-message', conversationId?, senderName?, message? }
 *     → notification with Reply / Mark as read actions. Both actions (and
 *       the default tap) focus or open /chat?conversation=<id>&reply=1;
 *       the app then selects the thread, focuses the composer and flashes
 *       it. (The SW has no authenticated-fetch pattern, so "Mark as read"
 *       relies on the app's on-open read cursor instead of a raw fetch.)
 *   anything else with title/body → generic notification.
 *
 * notificationclick:
 *   - accept → postMessage { type:'sw-call-action', action:'accept', callId }
 *     to the app (which opens /join-call?call=<id>&auto=1 and rings the UI),
 *     focusing an existing client when possible.
 *   - decline → postMessage { type:'sw-call-action', action:'decline', callId }.
 *   - chat 'reply' / 'mark-read' → same focus-or-open logic as the default
 *     tap, using the notification's deep link.
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
    // Reply-friendly deep link: the app focuses the composer for this thread.
    const deepLink = convo
      ? "/chat?conversation=" + encodeURIComponent(convo) + "&reply=1"
      : "/chat";
    event.waitUntil(
      self.registration.showNotification(sender, {
        body: body,
        tag: data.tag || ("chat-" + (convo || Date.now())),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: deepLink, conversationId: convo, type: "chat-message" },
        actions: [
          { action: "reply", title: "Reply" },
          { action: "mark-read", title: "Mark as read" },
        ],
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

      // Chat message actions — "reply" opens /chat?conversation=<id>&reply=1
      // (the app focuses + flashes the composer); "mark-read" has no
      // authenticated-fetch pattern available inside the SW, so it also just
      // surfaces the thread (opening it marks it read via the app's normal
      // on-open read cursor). Both reuse the default focus-or-open logic
      // below via the notification's data.url deep link.

      // Default click (and chat reply / mark-read) → focus existing client
      // or open the deep link.
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
