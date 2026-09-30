import type { Socket } from "socket.io-client";
import { LiveKitCallingClient } from "./LiveKitCallingClient";
import { MediaSoupCallingClient } from "./MediaSoupCallingClient";
import type { CallingClient, CallingCredentials } from "./types";

export * from "./types";
export { LiveKitCallingClient } from "./LiveKitCallingClient";
export { MediaSoupCallingClient, type MediaSoupClientOptions } from "./MediaSoupCallingClient";

export interface CreateClientOptions {
  credentials: CallingCredentials | null | undefined;
  socket: Socket;
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  callType: "audio" | "video" | "meeting";
  startWithAudio?: boolean;
  startWithVideo?: boolean;
}

/**
 * Create the right CallingClient from the credentials the backend handed us.
 * Missing credentials or provider "mediasoup" → the classic MediaSoup path.
 * Provider "livekit" with token+serverUrl → LiveKit. Anything invalid falls
 * back to MediaSoup so a misconfigured server can never strand the user.
 */
export function createCallingClient(opts: CreateClientOptions): CallingClient {
  const cred = opts.credentials;
  if (cred && cred.provider === "livekit" && cred.token && cred.serverUrl) {
    return new LiveKitCallingClient(cred);
  }
  if (cred && cred.provider === "livekit") {
    console.warn("[calling] livekit credentials incomplete — falling back to MediaSoup path");
  }
  return new MediaSoupCallingClient({
    socket: opts.socket,
    roomId: opts.roomId,
    userId: opts.userId,
    userName: opts.userName,
    isHost: opts.isHost,
    callType: opts.callType,
    startWithAudio: opts.startWithAudio,
    startWithVideo: opts.startWithVideo,
  });
}

/** True when the credentials select the LiveKit provider. */
export function isLiveKitCredentials(credentials: CallingCredentials | null | undefined): boolean {
  return !!credentials && credentials.provider === "livekit" && !!credentials.token && !!credentials.serverUrl;
}
