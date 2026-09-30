import {
  Room,
  RoomEvent,
  Track,
  ConnectionState as LkConnectionState,
  ParticipantEvent,
  type RemoteParticipant as LkRemoteParticipant,
  type RemoteTrackPublication,
  type LocalTrackPublication,
} from "livekit-client";
import {
  CallingEmitter,
  emitParticipantsSnapshot,
  type CallingClient,
  type CallingClientEvents,
  type CallingCredentials,
  type ConnectionState,
  type LocalMediaState,
  type RemoteParticipant,
} from "./types";

/**
 * LiveKit implementation of the Metricorex CallingClient.
 *
 * LiveKit handles its own signaling/reconnection over its own WebSocket —
 * Socket.IO is never used for LiveKit media. Credentials were minted by the
 * Metricorex backend (short-lived JWT scoped to this room).
 */

function qualityToUi(q: any): RemoteParticipant["connectionQuality"] {
  switch (String(q)) {
    case "excellent":
    case "good":
      return "good";
    case "degraded":
    case "fair":
      return "fair";
    case "poor":
    case "lost":
      return "poor";
    default:
      return "unknown";
  }
}

export class LiveKitCallingClient implements CallingClient {
  private emitter = new CallingEmitter();
  private room: Room;
  private credentials: CallingCredentials;
  private participants = new Map<string, RemoteParticipant>();
  private localState: LocalMediaState = {
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
  };
  private localVideoStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private activeSpeakerId: string | null = null;
  private disconnected = false;

  constructor(credentials: CallingCredentials) {
    this.credentials = credentials;
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
  }

  on<K extends keyof CallingClientEvents>(event: K, cb: (payload: CallingClientEvents[K]) => void) {
    return this.emitter.on(event, cb);
  }

  async connect(): Promise<void> {
    const { serverUrl, token } = this.credentials;
    if (!serverUrl || !token) {
      throw new Error("Missing LiveKit credentials from server");
    }
    this.wireRoomEvents();
    this.emitter.emit("connection", "connecting");
    try {
      await this.room.connect(serverUrl, token);
      // Sync local state from what the server granted/started us with.
      const lp = this.room.localParticipant;
      this.localState.audioEnabled = !!lp.getTrackPublication(Track.Source.Microphone)?.isMuted === false;
      this.localState.videoEnabled = !lp.getTrackPublication(Track.Source.Camera)?.isMuted;
      this.emitter.emit("local:state", { ...this.localState });
      this.emitter.emit("connection", "connected");
      this.syncAllParticipants();
    } catch (err: any) {
      this.emitter.emit("connection", "failed");
      throw new Error(String(err?.message || "Failed to connect to the call server"));
    }
  }

  async disconnect(): Promise<void> {
    if (this.disconnected) return;
    this.disconnected = true;
    try {
      await this.room.disconnect();
    } catch {
      // ignore — disconnecting anyway
    }
    this.emitter.emit("connection", "disconnected");
  }

  private wireRoomEvents() {
    const room = this.room;

    room.on(RoomEvent.ParticipantConnected, (p: LkRemoteParticipant) => {
      this.ensureParticipant(p);
      this.emitter.emit("participant:joined", this.participants.get(p.identity)!);
      this.syncAllParticipants();
    });

    room.on(RoomEvent.ParticipantDisconnected, (p: LkRemoteParticipant) => {
      const id = p.identity;
      this.participants.delete(id);
      this.emitter.emit("participant:left", { id });
      this.syncAllParticipants();
    });

    room.on(RoomEvent.TrackSubscribed, (track, pub: RemoteTrackPublication, p: LkRemoteParticipant) => {
      this.ensureParticipant(p);
      const participant = this.participants.get(p.identity)!;
      const stream = track.mediaStream ?? new MediaStream([track.mediaStreamTrack]);
      if (pub.source === Track.Source.Microphone) {
        participant.audioStream = stream;
      } else if (pub.source === Track.Source.Camera) {
        participant.videoStream = stream;
        participant.videoMuted = false;
      } else if (pub.source === Track.Source.ScreenShare) {
        participant.screenStream = stream;
        participant.screenSharing = true;
      }
      this.emitter.emit("participant:updated", { ...participant });
      this.syncAllParticipants();
    });

    room.on(RoomEvent.TrackUnsubscribed, (_track, pub: RemoteTrackPublication, p: LkRemoteParticipant) => {
      const participant = this.participants.get(p.identity);
      if (!participant) return;
      if (pub.source === Track.Source.Microphone) {
        participant.audioStream = null;
      } else if (pub.source === Track.Source.Camera) {
        participant.videoStream = null;
      } else if (pub.source === Track.Source.ScreenShare) {
        participant.screenStream = null;
        participant.screenSharing = false;
      }
      this.emitter.emit("participant:updated", { ...participant });
      this.syncAllParticipants();
    });

    room.on(RoomEvent.TrackMuted, (pub: any, p: any) => {
      if (!p || p.identity === room.localParticipant.identity) {
        if (pub.source === Track.Source.Microphone) this.localState.audioEnabled = false;
        if (pub.source === Track.Source.Camera) this.localState.videoEnabled = false;
        this.emitter.emit("local:state", { ...this.localState });
        return;
      }
      this.updateMediaFlags(p as LkRemoteParticipant);
    });

    room.on(RoomEvent.TrackUnmuted, (pub: any, p: any) => {
      if (!p || p.identity === room.localParticipant.identity) {
        if (pub.source === Track.Source.Microphone) this.localState.audioEnabled = true;
        if (pub.source === Track.Source.Camera) this.localState.videoEnabled = true;
        this.emitter.emit("local:state", { ...this.localState });
        return;
      }
      this.updateMediaFlags(p as LkRemoteParticipant);
    });

    room.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        this.localVideoStream = pub.videoTrack?.mediaStream ?? null;
        this.localState.videoEnabled = true;
        this.emitter.emit("local:stream", this.localVideoStream);
      } else if (pub.source === Track.Source.ScreenShare) {
        this.localScreenStream = pub.videoTrack?.mediaStream ?? null;
        this.localState.screenSharing = true;
        this.emitter.emit("local:screen", this.localScreenStream);
      } else if (pub.source === Track.Source.Microphone) {
        this.localState.audioEnabled = true;
      }
      this.emitter.emit("local:state", { ...this.localState });
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        this.localVideoStream = null;
        this.localState.videoEnabled = false;
        this.emitter.emit("local:stream", null);
      } else if (pub.source === Track.Source.ScreenShare) {
        this.localScreenStream = null;
        this.localState.screenSharing = false;
        this.emitter.emit("local:screen", null);
      } else if (pub.source === Track.Source.Microphone) {
        this.localState.audioEnabled = false;
      }
      this.emitter.emit("local:state", { ...this.localState });
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
      const id = speakers && speakers.length > 0 ? speakers[0].identity : null;
      this.activeSpeakerId = id;
      this.emitter.emit("active-speaker", { id });
      for (const p of this.participants.values()) {
        const speaking = p.id === id;
        if (p.isSpeaking !== speaking) {
          p.isSpeaking = speaking;
          this.emitter.emit("participant:updated", { ...p });
        }
      }
    });

    room.on(RoomEvent.Reconnecting, () => this.emitter.emit("connection", "reconnecting"));
    room.on(RoomEvent.SignalReconnecting, () => this.emitter.emit("connection", "reconnecting"));
    room.on(RoomEvent.Reconnected, () => {
      this.emitter.emit("connection", "connected");
      this.syncAllParticipants();
    });

    room.on(RoomEvent.Disconnected, (reason?: any) => {
      if (this.disconnected) return;
      this.emitter.emit("connection", reason != null ? "disconnected" : "disconnected");
    });

    room.on(RoomEvent.ConnectionQualityChanged, (quality: any, p: any) => {
      if (!p || p.identity === room.localParticipant.identity) return;
      const participant = this.participants.get(p.identity);
      if (participant) {
        participant.connectionQuality = qualityToUi(quality);
        this.emitter.emit("participant:updated", { ...participant });
      }
    });

    // Track subscription failures (e.g. participant hit max publishes)
    room.on(RoomEvent.TrackSubscriptionFailed, (_trackSid: string, p: any) => {
      console.warn("[livekit] subscription failed for", p?.identity);
    });

    // Remote participant media flags change with publications even without
    // mute events (e.g. track removed).
    room.on(RoomEvent.TrackUnpublished, (_pub: any, p: any) => {
      if (p && p.identity !== room.localParticipant.identity) this.updateMediaFlags(p as LkRemoteParticipant);
      this.syncAllParticipants();
    });
  }

  private ensureParticipant(p: LkRemoteParticipant): RemoteParticipant {
    let existing = this.participants.get(p.identity);
    if (!existing) {
      existing = {
        id: p.identity,
        name: p.name || p.identity,
        isSpeaking: false,
        audioMuted: true,
        videoMuted: true,
        screenSharing: false,
        audioStream: null,
        videoStream: null,
        screenStream: null,
        connectionQuality: "unknown",
      };
      this.participants.set(p.identity, existing);
      p.trackPublications.forEach((pub) => this.applyPublication(existing!, pub));
    }
    return existing;
  }

  private applyPublication(participant: RemoteParticipant, pub: RemoteTrackPublication) {
    if (pub.source === Track.Source.Microphone) {
      participant.audioMuted = pub.isMuted || !pub.track;
    } else if (pub.source === Track.Source.Camera) {
      participant.videoMuted = pub.isMuted || !pub.track;
    } else if (pub.source === Track.Source.ScreenShare) {
      participant.screenSharing = !pub.isMuted && !!pub.track;
    }
  }

  private updateMediaFlags(p: LkRemoteParticipant) {
    const participant = this.ensureParticipant(p);
    p.trackPublications.forEach((pub) => this.applyPublication(participant, pub));
    this.emitter.emit("participant:updated", { ...participant });
    this.syncAllParticipants();
  }

  private syncAllParticipants() {
    emitParticipantsSnapshot(this.emitter, this.getParticipants());
  }

  getParticipants(): RemoteParticipant[] {
    return Array.from(this.participants.values()).map((p) => ({ ...p }));
  }

  getLocalState(): LocalMediaState {
    return { ...this.localState };
  }

  getLocalVideoStream(): MediaStream | null {
    return this.localVideoStream;
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
    this.localState.audioEnabled = enabled;
    this.emitter.emit("local:state", { ...this.localState });
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.localState.videoEnabled = enabled;
    this.emitter.emit("local:state", { ...this.localState });
  }

  async switchCamera(): Promise<void> {
    const lp = this.room.localParticipant;
    try {
      // Preferred: cycle via facing mode on mobile.
      const track = lp.getTrackPublication(Track.Source.Camera)?.videoTrack as any;
      if (track && typeof track.setDeviceId === "function") {
        // livekit handles flip; fallback below covers desktop multi-cam.
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length < 2) {
        if (track && typeof track.restartTrack === "function") {
          const currentFacing = (track.mediaStreamTrack as any)?.getSettings?.().facingMode;
          await track.restartTrack({ facingMode: currentFacing === "user" ? "environment" : "user" });
          return;
        }
        return;
      }
      const current = (track?.mediaStreamTrack as any)?.getSettings?.().deviceId;
      const next = cams.find((d) => d.deviceId !== current) || cams[0];
      await this.room.switchActiveDevice("videoinput", next.deviceId);
    } catch (err) {
      console.warn("[livekit] switchCamera failed:", err);
    }
  }

  async startScreenShare(): Promise<void> {
    try {
      await this.room.localParticipant.setScreenShareEnabled(true, { audio: true });
    } catch (err: any) {
      this.emitter.emit("media:error", { message: String(err?.message || "Screen share was cancelled or is unsupported") });
      throw err;
    }
  }

  async stopScreenShare(): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(false);
  }
}

// Re-export for consumers that want the enum type without importing livekit directly.
export { LkConnectionState, ParticipantEvent };
