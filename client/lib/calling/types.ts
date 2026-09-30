/**
 * Provider-agnostic calling client contract (web).
 *
 * The Call Room UI only ever talks to a CallingClient — never to LiveKit or
 * MediaSoup directly. Two implementations exist:
 *   - LiveKitCallingClient  (media provider: self-hosted LiveKit SFU)
 *   - MediaSoupCallingClient (media provider: MediaSoup over Socket.IO signaling)
 *
 * Credentials come from the Metricorex backend (see backend calling factory);
 * the client never sees provider secrets.
 */

export type ProviderName = "livekit" | "mediasoup";

/** `calling` block returned by join endpoints / socket join acks. */
export interface CallingCredentials {
  provider: ProviderName;
  serverUrl?: string;
  roomName: string;
  token?: string;
  tokenExpiresAt?: string;
  roomType: "call" | "meeting";
  roomId: string;
  fallback?: boolean;
  fallbackReason?: string;
}

export interface RemoteParticipant {
  id: string;
  name: string;
  isHost?: boolean;
  isSpeaking: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing: boolean;
  /** Remote microphone audio (attach to <audio> or let the client do it). */
  audioStream: MediaStream | null;
  /** Remote camera video. */
  videoStream: MediaStream | null;
  /** Remote screen share video. */
  screenStream: MediaStream | null;
  connectionQuality: "good" | "fair" | "poor" | "unknown";
}

export interface LocalMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
}

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

export interface CallingClientEvents {
  "participant:joined": RemoteParticipant;
  "participant:left": { id: string };
  "participant:updated": RemoteParticipant;
  "participants": RemoteParticipant[];
  "local:state": LocalMediaState;
  /** Local camera/mic preview stream (null until published). */
  "local:stream": MediaStream | null;
  /** Local screen share stream (null while not sharing). */
  "local:screen": MediaStream | null;
  "connection": ConnectionState;
  "active-speaker": { id: string | null };
  /** Raised when media could not start (permissions denied etc.). */
  "media:error": { message: string };
  "error": { message: string };
}

export interface CallingClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setAudioEnabled(enabled: boolean): Promise<void>;
  setVideoEnabled(enabled: boolean): Promise<void>;
  switchCamera(): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  getParticipants(): RemoteParticipant[];
  getLocalState(): LocalMediaState;
  getLocalVideoStream(): MediaStream | null;
  getLocalScreenStream(): MediaStream | null;
  on<K extends keyof CallingClientEvents>(event: K, cb: (payload: CallingClientEvents[K]) => void): () => void;
}

/** Tiny typed event emitter shared by both clients. */
export class CallingEmitter {
  private listeners = new Map<keyof CallingClientEvents, Set<(p: any) => void>>();

  on<K extends keyof CallingClientEvents>(event: K, cb: (payload: CallingClientEvents[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }

  emit<K extends keyof CallingClientEvents>(event: K, payload: CallingClientEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[calling] listener error for ${String(event)}:`, err);
      }
    }
  }
}

/** Snapshot helper — re-emits the full participant list. */
export function emitParticipantsSnapshot(client: CallingEmitter, participants: RemoteParticipant[]) {
  client.emit("participants", participants);
}
