/**
 * Web push plumbing (batch-4).
 *
 * - registerServiceWorker(): install /sw.js (called from the App root once the
 *   user is authenticated).
 * - ensurePushSubscription(): GET /push/vapid-public-key → pushManager
 *   subscribe → POST /push/subscribe { subscription }. Idempotent; reuses an
 *   existing subscription when the applicationServerKey matches.
 * - requestPermissionAndSubscribe(): asks for Notification permission (only
 *   ever called from an explicit user gesture — the Calls-page banner or when
 *   the user starts a call) and then subscribes.
 * - unsubscribeFromPush(): POST /push/unsubscribe { endpoint } + local unsub.
 */

import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";

const SW_PATH = "/sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    return registration;
  } catch (err) {
    console.warn("[push] service worker registration failed:", err);
    return null;
  }
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration(SW_PATH)) || (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

let subscribePromise: Promise<boolean> | null = null;

/**
 * Subscribe the browser for push (permission must already be granted).
 * Safe to call repeatedly — concurrent calls share one promise.
 */
export function ensurePushSubscription(): Promise<boolean> {
  if (subscribePromise) return subscribePromise;
  subscribePromise = (async () => {
    try {
      if (!pushSupported()) return false;
      if (Notification.permission !== "granted") return false;
      const registration = (await getRegistration()) || (await registerServiceWorker());
      if (!registration) return false;

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        // Already subscribed — re-post it so the backend has the latest.
        await api.post("/push/subscribe", { subscription: existing.toJSON() }).catch(() => {});
        return true;
      }

      const res = await api.get("/push/vapid-public-key");
      const data = unwrapApiData<{ publicKey?: string }>(res.data, "");
      const publicKey = data?.publicKey;
      if (!publicKey) {
        console.warn("[push] no VAPID public key available");
        return false;
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
      await api.post("/push/subscribe", { subscription: subscription.toJSON() });
      return true;
    } catch (err) {
      console.warn("[push] subscription failed:", getApiMessage(err, "unknown error"));
      return false;
    } finally {
      subscribePromise = null;
    }
  })();
  return subscribePromise;
}

/** Ask for permission (user gesture required) then subscribe. */
export async function requestPermissionAndSubscribe(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await ensurePushSubscription();
  }
  return permission;
}

/** Best-effort unsubscribe (logout / settings toggle). Optional per spec. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api.post("/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
  } catch {
    /* non-fatal */
  }
}

/** Register + silently subscribe when the user already granted permission. */
export async function initPushAfterLogin(): Promise<void> {
  if (!pushSupported()) return;
  await registerServiceWorker();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    await ensurePushSubscription();
  }
}
