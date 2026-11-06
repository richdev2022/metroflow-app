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
 *     → notification with Reply / Mark as read actions. Reply (and the
 *       default tap) focus or open /chat?conversation=<id>&reply=1; the
 *       app then selects the thread, focuses the composer and flashes it.
 *       "Mark as read" POSTs <apiBase>/chat/conversations/<id>/read with a
 *       token borrowed from an open client over a MessageChannel handshake
 *       ('sw-request-token'); with no client/token it falls back to just
 *       opening the thread (the app marks it read on load).
 *   anything else with title/body → generic notification.
 *
 * notificationclick:
 *   - accept → postMessage { type:'sw-call-action', action:'accept', callId }
 *     to the app (which opens /join-call?call=<id>&auto=1 and rings the UI),
 *     focusing an existing client when possible.
 *   - decline → postMessage { type:'sw-call-action', action:'decline', callId }.
 *   - chat 'reply' → same focus-or-open logic as the default tap, using the
 *     notification's deep link (/chat?conversation=<id>&reply=1).
 *   - chat 'mark-read' → POST <apiBase>/chat/conversations/<id>/read with a
 *     token borrowed from an open client; fallback = open the thread.
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

/**
 * Ask any open app window for the auth token (the SW cannot read
 * localStorage itself). PushManager replies over a MessageChannel with
 * { token, apiBase, userId, businessId }. Resolves null when no client is
 * open or nothing answers within the timeout — callers then fall back to
 * just opening the app (Chat marks the conversation read on load anyway).
 */
function requestAuthTokenFromClients() {
  return (async () => {
    let clientList = [];
    try {
      clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    } catch (e) {
      return null;
    }
    for (const client of clientList) {
      try {
        const token = await new Promise((resolve) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolve(null), 1500);
          channel.port1.onmessage = (ev) => {
            clearTimeout(timer);
            const d = ev && ev.data;
            resolve(d && d.token ? d : null);
          };
          client.postMessage({ type: "sw-request-token" }, [channel.port2]);
        });
        if (token) return token;
      } catch (e) { /* try the next client */ }
    }
    return null;
  })();
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

      // Chat: Mark as read → POST the conversation read endpoint with the
      // token borrowed from an open client (the SW cannot read localStorage
      // itself). No token available (app closed / handshake timeout) or the
      // fetch failed? Fall through to the default focus-or-open logic below
      // — opening the thread marks it read via the app's on-open read
      // cursor. NOTE: the read URL is built by string concatenation; a
      // leading slash via new URL(url, base) would DROP the /api prefix when
      // apiBase ends in /api (→ 404s).
      if (action === "mark-read" && data.type === "chat-message" && data.conversationId) {
        const auth = await requestAuthTokenFromClients();
        if (auth && auth.token) {
          try {
            const apiBase = (auth.apiBase || "/api").trim();
            const readUrl =
              apiBase.replace(/\/$/, "") +
              "/chat/conversations/" +
              encodeURIComponent(data.conversationId) +
              "/read";
            const headers = { "Authorization": "Bearer " + auth.token };
            // This app's API identifies requests via the x-user-id /
            // x-business-id headers — mirror what api-client.ts sends.
            if (auth.userId) headers["x-user-id"] = auth.userId;
            if (auth.businessId) headers["x-business-id"] = auth.businessId;
            const res = await fetch(readUrl, {
              method: "POST",
              headers: headers,
            });
            if (res.ok) return; // silently read — no window opened
          } catch (e) {
            /* fall through to the app-open fallback */
          }
        }
      }

      // Chat "reply" (and the default tap, plus a mark-read that couldn't
      // POST) → focus existing client or open the deep link
      // (/chat?conversation=<id>&reply=1).
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
