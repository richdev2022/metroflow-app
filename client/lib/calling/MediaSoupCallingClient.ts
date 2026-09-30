import { Device, types } from "mediasoup-client";
import type { Socket } from "socket.io-client";
import {
  CallingEmitter,
  emitParticipantsSnapshot,
  type CallingClient,
  type CallingClientEvents,
  type LocalMediaState,
  type RemoteParticipant,
} from "./types";
import { AudioUtils } from "../audio-utils";
import {
  applySinkToAll,
  loadPersistedSinkId,
  registerAudioElement,
  unregisterAudioElement,
} from "./audio-routing";

// Restore the user's last speaker-route choice so every audio element created
// afterwards inherits it.
loadPersistedSinkId();

/**
 * MediaSoup implementation of the Metricorex CallingClient.
 *
 * This is the original MediaSoup media path (device → transports →
 * produce/consume over the `mediasoup:*` Socket.IO protocol) extracted out of
 * the old 4.1k-line VideoCallRoom into a clean class. Signaling rides the
 * existing authenticated Socket.IO connection; media flows peer↔SFU directly.
 */

interface PeerRecord {
  participant: RemoteParticipant;
  producers: Map<string, { kind: types.MediaKind; appData: any }>;
  consumers: Map<string, types.Consumer>;
  audioEl?: HTMLAudioElement;
  gainNode?: GainNode;
}

const RECV_AUDIO_GAIN = 4.0;

export interface MediaSoupClientOptions {
  socket: Socket;
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  /** 'video' calls start with camera; audio calls mic only. */
  callType: "audio" | "video" | "meeting";
  startWithAudio?: boolean;
  startWithVideo?: boolean;
}

export class MediaSoupCallingClient implements CallingClient {
  private emitter = new CallingEmitter();
  private socket: Socket;
  private roomId: string;
  private opts: MediaSoupClientOptions;

  private device: Device | null = null;
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private localAudioProducer: types.Producer | null = null;
  private localVideoProducer: types.Producer | null = null;
  private localScreenProducer: types.Producer | null = null;
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;

  private peers = new Map<string, PeerRecord>();
  private playbackCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private audioLevelRaf = 0;
  private closed = false;
  private disposed = false;
  /** Wired socket media handlers — removed on destroy. */
  private socketMediaHandlers: Array<[string, (...args: any[]) => void]> = [];

  private localState: LocalMediaState = {
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
  };

  constructor(opts: MediaSoupClientOptions) {
    this.opts = opts;
    this.socket = opts.socket;
    this.roomId = opts.roomId;
    this.localState.audioEnabled = opts.startWithAudio !== false;
    this.localState.videoEnabled =
      opts.startWithVideo !== false && opts.callType !== "audio";
  }

  on<K extends keyof CallingClientEvents>(event: K, cb: (payload: CallingClientEvents[K]) => void) {
    return this.emitter.on(event, cb);
  }

  // ------------------------------------------------------------------
  // Connection lifecycle
  // ------------------------------------------------------------------

  async connect(): Promise<void> {
    this.emitter.emit("connection", "connecting");
    try {
      await this.loadDevice();
      await this.createTransports();
      this.wireSocketMediaEvents();
      await this.startLocalMedia();
      await this.consumeExistingProducers();
      this.emitter.emit("local:state", { ...this.localState });
      this.emitter.emit("connection", "connected");
      emitParticipantsSnapshot(this.emitter, this.getParticipants());
    } catch (err: any) {
      this.emitter.emit("connection", "failed");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    return this.destroy();
  }

  /**
   * Authoritative teardown — every leave path funnels here. Stops all local
   * tracks, closes producers/transports, detaches audio elements, removes the
   * socket media listeners and clears the audio-level loop. Idempotent.
   */
  async destroy(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.closed = true;

    // Close producers/transports first so no further media events act on us.
    try {
      this.localAudioProducer?.close();
      this.localVideoProducer?.close();
      this.localScreenProducer?.close();
      this.sendTransport?.close();
      this.recvTransport?.close();
    } catch {
      // transport close errors are non-actionable on teardown
    }
    this.localAudioProducer = null;
    this.localVideoProducer = null;
    this.localScreenProducer = null;
    this.sendTransport = null;
    this.recvTransport = null;

    // Stop every local track (camera light off even if transport close hung).
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.localScreenStream = null;

    // Detach remote audio + clear peers.
    for (const peer of this.peers.values()) {
      this.cleanupPeerAudio(peer);
    }
    this.peers.clear();

    // Remove socket media listeners + stop the audio-level loop.
    for (const [event, handler] of this.socketMediaHandlers) {
      try {
        this.socket.off(event, handler as any);
      } catch {
        // ignore
      }
    }
    this.socketMediaHandlers = [];
    if (this.audioLevelRaf) {
      cancelAnimationFrame(this.audioLevelRaf);
      this.audioLevelRaf = 0;
    }
    this.localAnalyser = null;
    try {
      await this.playbackCtx?.close();
    } catch {
      // ignore
    }
    this.playbackCtx = null;

    // Final state broadcast so stale UI clears immediately.
    this.emitter.emit("local:stream", null);
    this.emitter.emit("local:screen", null);
    emitParticipantsSnapshot(this.emitter, []);
    this.emitter.emit("connection", "disconnected");
  }

  /** Socket dropped — transports will re-handshake on socket reconnect. */
  markSocketReconnecting() {
    this.emitter.emit("connection", "reconnecting");
  }

  /** Socket came back — resume consumers and re-sync producer state. */
  resumeAfterSocketReconnect() {
    for (const peer of this.peers.values()) {
      for (const consumer of peer.consumers.values()) {
        try {
          if (consumer.paused) {
            this.socket.emit("mediasoup:resume", { consumerId: consumer.id, roomId: this.roomId });
            consumer.resume();
          }
        } catch {
          // best effort
        }
      }
    }
    this.emitter.emit("connection", "connected");
  }

  private loadDevice(): Promise<void> {
    return new Promise((resolve, reject) => {
      const device = new Device();
      let attempt = 0;
      const requestCaps = () => {
        if (this.disposed) return reject(new Error("disposed"));
        this.socket.emit(
          "mediasoup:getRouterRtpCapabilities",
          { roomId: this.roomId },
          (response: any) => {
            if (this.disposed) return;
            if (response?.error) {
              if (response.retryable && attempt < 5) {
                attempt += 1;
                setTimeout(requestCaps, 2000);
                return;
              }
              return reject(new Error(response.error || "Router capabilities unavailable"));
            }
            const caps = response.routerRtpCapabilities || response.rtpCapabilities;
            device
              .load({ routerRtpCapabilities: caps })
              .then(() => {
                this.device = device;
                resolve();
              })
              .catch((err) => reject(new Error("Unable to initialize media device: " + String(err?.message || err))));
          },
        );
      };
      requestCaps();
    });
  }

  private createTransports(): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending = 2;
      let settled = false;
      const done = () => {
        if (!settled && --pending === 0) {
          settled = true;
          resolve();
        }
      };
      const fail = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      for (const direction of ["send", "recv"] as const) {
        this.socket.emit(
          "mediasoup:createWebRtcTransport",
          { roomId: this.roomId, direction },
          (response: any) => {
            if (this.disposed) return fail(new Error("disposed"));
            if (response?.error) return fail(new Error(response.error));

            const options: types.TransportOptions = {
              id: response.id,
              iceParameters: response.iceParameters,
              iceCandidates: response.iceCandidates,
              dtlsParameters: response.dtlsParameters,
            };

            const transport =
              direction === "send"
                ? this.device!.createSendTransport(options)
                : this.device!.createRecvTransport(options);

            transport.on("connect", ({ dtlsParameters }, callback, errback) => {
              this.socket.emit(
                "mediasoup:connectWebRtcTransport",
                { transportId: transport.id, dtlsParameters, roomId: this.roomId },
                (res: any) => {
                  if (res?.error) return errback(new Error(res.error));
                  callback();
                },
              );
            });

            transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
              this.socket.emit(
                "mediasoup:produce",
                { transportId: transport.id, kind, rtpParameters, appData, roomId: this.roomId },
                (res: any) => {
                  if (res?.error) return errback(new Error(res.error));
                  callback({ id: res.id });
                },
              );
            });

            transport.on("connectionstatechange", (state) => {
              if (state === "connected") {
                // Audio resync: ensure producer pause state matches UI state
                if (direction === "send") {
                  try {
                    if (this.localAudioProducer) {
                      const shouldPause = !this.localState.audioEnabled;
                      if (shouldPause && !this.localAudioProducer.paused) {
                        this.localAudioProducer.pause();
                        this.socket.emit("mediasoup:pauseProducer", { producerId: this.localAudioProducer.id, roomId: this.roomId });
                      } else if (!shouldPause && this.localAudioProducer.paused) {
                        this.localAudioProducer.resume();
                        this.socket.emit("mediasoup:resumeProducer", { producerId: this.localAudioProducer.id, roomId: this.roomId });
                      }
                    }
                  } catch {
                    // best effort resync
                  }
                } else if (direction === "recv") {
                  for (const peer of this.peers.values()) {
                    for (const consumer of peer.consumers.values()) {
                      try {
                        if (consumer.paused) {
                          consumer.resume();
                          this.socket.emit("mediasoup:resume", { consumerId: consumer.id, roomId: this.roomId });
                        }
                      } catch {
                        // best effort
                      }
                    }
                  }
                }
                this.emitter.emit("connection", "connected");
              } else if (state === "failed" || state === "disconnected") {
                this.emitter.emit("connection", "reconnecting");
              }
            });

            if (direction === "send") this.sendTransport = transport;
            else this.recvTransport = transport;
            done();
          },
        );
      }
    });
  }

  private async startLocalMedia(): Promise<void> {
    if (!this.sendTransport || !this.device) return;
    try {
      await AudioUtils.ensureInitialized().catch(() => {});
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          this.opts.callType === "audio"
            ? false
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;

      const audioTrack = stream.getAudioTracks()[0] || null;
      const videoTrack = stream.getVideoTracks()[0] || null;

      if (audioTrack) {
        this.localAudioProducer = await this.sendTransport!.produce({
          track: audioTrack,
          appData: { userName: this.opts.userName, userId: this.opts.userId, source: "mic" },
        });
        if (!this.localState.audioEnabled) {
          this.localAudioProducer.pause();
          this.socket.emit("mediasoup:pauseProducer", { producerId: this.localAudioProducer.id, roomId: this.roomId });
        }
        this.setupLocalAudioLevel(stream);
      }

      if (videoTrack && this.localState.videoEnabled) {
        this.localVideoProducer = await this.sendTransport!.produce({
          track: videoTrack,
          appData: { userName: this.opts.userName, userId: this.opts.userId, source: "webcam" },
        });
        this.emitter.emit("local:stream", stream);
      } else {
        videoTrack?.stop();
        stream.removeTrack(videoTrack!);
        this.emitter.emit("local:stream", null);
      }
      this.emitter.emit("local:state", { ...this.localState });
    } catch (err: any) {
      const name = String(err?.name || "");
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.emitter.emit("media:error", {
          message: "Camera/microphone access was denied. Enable permissions in your browser settings to be seen and heard.",
        });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        this.emitter.emit("media:error", { message: "No camera or microphone was found on this device." });
      } else {
        this.emitter.emit("media:error", { message: "Unable to start your camera or microphone." });
      }
      // Join anyway — the participant can still listen and chat.
    }
  }

  private setupLocalAudioLevel(stream: MediaStream) {
    try {
      if (!this.playbackCtx) {
        this.playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = this.playbackCtx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.localAnalyser = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let talking = false;
      const loop = () => {
        if (this.disposed) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const level = sum / data.length;
        const nowTalking = this.localState.audioEnabled && level > 14;
        if (nowTalking !== talking) {
          talking = nowTalking;
          this.socket.emit("call:audio-level", {
            roomId: this.roomId,
            isTalking: talking,
            userName: this.opts.userName,
          });
        }
        this.audioLevelRaf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // analyser is an enhancement — proceed without it
    }
  }

  // ------------------------------------------------------------------
  // Consuming remote media
  // ------------------------------------------------------------------

  private wireSocketMediaEvents() {
    const onNewProducer = ({ producerId, kind, peerId, peerName, appData }: any) => {
      if (this.disposed || !producerId) return;
      this.ensurePeer(peerId || producerId, peerName);
      const peer = this.peers.get(peerId || producerId)!;
      if (!peer.producers.has(producerId)) {
        peer.producers.set(producerId, { kind, appData });
        if (appData?.screenShare) peer.participant.screenSharing = true;
        if (appData?.screenShare) {
          this.emitter.emit("participant:updated", { ...peer.participant });
          emitParticipantsSnapshot(this.emitter, this.getParticipants());
        }
      }
      if (!this.recvTransport) return;
      this.consume(producerId, kind, appData);
    };

    const onProducerClosed = ({ producerId }: any) => {
      if (this.disposed) return;
      this.removeProducer(producerId);
    };

    const onProducerPaused = ({ producerId }: any) => {
      const peer = this.findPeerByProducer(producerId);
      if (!peer) return;
      const rec = peer.producers.get(producerId);
      if (rec?.kind === "audio") {
        peer.participant.audioMuted = true;
        this.emitter.emit("participant:updated", { ...peer.participant });
      } else if (rec?.kind === "video" && !rec.appData?.screenShare) {
        peer.participant.videoMuted = true;
        this.emitter.emit("participant:updated", { ...peer.participant });
      }
      emitParticipantsSnapshot(this.emitter, this.getParticipants());
    };

    const onProducerResumed = ({ producerId }: any) => {
      const peer = this.findPeerByProducer(producerId);
      if (!peer) return;
      const rec = peer.producers.get(producerId);
      if (rec?.kind === "audio") {
        peer.participant.audioMuted = false;
        this.emitter.emit("participant:updated", { ...peer.participant });
      } else if (rec?.kind === "video" && !rec.appData?.screenShare) {
        peer.participant.videoMuted = false;
        this.emitter.emit("participant:updated", { ...peer.participant });
      }
      emitParticipantsSnapshot(this.emitter, this.getParticipants());
    };

    this.socketMediaHandlers = [
      ["mediasoup:newProducer", onNewProducer],
      ["mediasoup:producerClosed", onProducerClosed],
      ["mediasoup:producerPaused", onProducerPaused],
      ["mediasoup:producerResumed", onProducerResumed],
    ];
    for (const [event, handler] of this.socketMediaHandlers) {
      this.socket.on(event, handler as any);
    }
  }

  private findPeerByProducer(producerId: string): PeerRecord | null {
    for (const peer of this.peers.values()) {
      if (peer.producers.has(producerId)) return peer;
    }
    return null;
  }

  private ensurePeer(peerId: string, peerName?: string): PeerRecord {
    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = {
        participant: {
          id: peerId,
          name: peerName || peerId,
          isSpeaking: false,
          audioMuted: true,
          videoMuted: true,
          screenSharing: false,
          audioStream: null,
          videoStream: null,
          screenStream: null,
          connectionQuality: "unknown",
        },
        producers: new Map(),
        consumers: new Map(),
      };
      this.peers.set(peerId, peer);
      this.emitter.emit("participant:joined", { ...peer.participant });
    } else if (peerName && peer.participant.name !== peerName) {
      peer.participant.name = peerName;
    }
    return peer;
  }

  private async consume(producerId: string, kind: types.MediaKind, appData?: any) {
    const recvTransport = this.recvTransport;
    const device = this.device;
    if (!recvTransport || !device || this.disposed) return;
    try {
      this.socket.emit(
        "mediasoup:consume",
        {
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.recvRtpCapabilities,
          roomId: this.roomId,
        },
        async (response: any) => {
          if (this.disposed) return;
          if (response?.error) {
            console.warn("[mediasoup] consume error:", response.error);
            return;
          }
          const { id, rtpParameters, producerId: prodId, appData: respAppData, peerId, peerName } = response;
          const effectiveAppData = respAppData || appData;
          const peer = this.ensurePeer(peerId || prodId, peerName || effectiveAppData?.userName);
          if (peer.consumers.has(prodId)) return;
          try {
            const consumer = await recvTransport.consume({
              id,
              producerId: prodId,
              kind,
              rtpParameters,
              appData: effectiveAppData,
            });
            peer.consumers.set(prodId, consumer);
            const isScreen = !!(effectiveAppData?.screenShare || effectiveAppData?.source === "screen");

            if (kind === "audio") {
              peer.participant.audioMuted = false;
              this.attachPeerAudio(peer, prodId, consumer.track);
            } else if (kind === "video") {
              const stream = new MediaStream([consumer.track]);
              if (isScreen) {
                peer.participant.screenSharing = true;
                peer.participant.screenStream = stream;
              } else {
                peer.participant.videoMuted = false;
                peer.participant.videoStream = stream;
              }
            }

            this.emitter.emit("participant:updated", { ...peer.participant });
            emitParticipantsSnapshot(this.emitter, this.getParticipants());

            consumer.on("trackended", () => this.removeProducer(prodId));
            consumer.on("transportclose", () => this.removeProducer(prodId));

            this.socket.emit("mediasoup:resume", { consumerId: id, roomId: this.roomId }, (res: any) => {
              if (res?.error) console.warn("[mediasoup] resume error:", res.error);
              else consumer.resume();
            });
          } catch (err) {
            console.error("[mediasoup] consume failed:", err);
          }
        },
      );
    } catch (err) {
      console.error("[mediasoup] consume emit failed:", err);
    }
  }

  private attachPeerAudio(peer: PeerRecord, prodId: string, track: MediaStreamTrack) {
    const audioStream = new MediaStream([track]);
    try {
      if (!this.playbackCtx) {
        this.playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.playbackCtx.state === "suspended") {
        this.playbackCtx.resume().catch(() => {});
      }
      const ctx = this.playbackCtx!;
      const sourceNode = ctx.createMediaStreamSource(audioStream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = RECV_AUDIO_GAIN;
      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);
      peer.gainNode = gainNode;
    } catch (err) {
      console.warn("[mediasoup] Web Audio unavailable, using audio element only:", err);
    }
    const audioEl = document.createElement("audio");
    audioEl.srcObject = audioStream;
    audioEl.autoplay = true;
    (audioEl as any).playsInline = true;
    audioEl.volume = 1;
    audioEl.setAttribute("playsinline", "");
    document.body.appendChild(audioEl);
    registerAudioElement(audioEl);
    peer.audioEl = audioEl;
    audioEl.play().catch(() => {
      // Autoplay blocked — retry on the next user gesture.
      const retry = () => {
        this.playbackCtx?.resume().catch(() => {});
        audioEl.play().catch(() => {});
        document.removeEventListener("click", retry);
        document.removeEventListener("keydown", retry);
        document.removeEventListener("touchstart", retry);
      };
      document.addEventListener("click", retry, { once: true });
      document.addEventListener("keydown", retry, { once: true });
      document.addEventListener("touchstart", retry, { once: true });
      this.emitter.emit("error", { message: "Audio is blocked by the browser — click anywhere to enable participant audio." });
    });
  }

  private cleanupPeerAudio(peer: PeerRecord) {
    if (peer.gainNode) {
      try {
        peer.gainNode.disconnect();
      } catch {
        // ignore
      }
      peer.gainNode = undefined;
    }
    if (peer.audioEl) {
      try {
        peer.audioEl.pause();
        peer.audioEl.srcObject = null;
        unregisterAudioElement(peer.audioEl);
        peer.audioEl.parentNode?.removeChild(peer.audioEl);
      } catch {
        // ignore
      }
      peer.audioEl = undefined;
    }
  }

  private removeProducer(producerId: string) {
    for (const [peerId, peer] of this.peers.entries()) {
      const consumer = peer.consumers.get(producerId);
      if (!consumer) continue;
      try {
        consumer.close();
      } catch {
        // ignore
      }
      peer.consumers.delete(producerId);
      const rec = peer.producers.get(producerId);
      if (rec?.kind === "audio") {
        this.cleanupPeerAudio(peer);
        peer.participant.audioMuted = true;
        peer.participant.audioStream = null;
      } else if (rec?.kind === "video") {
        if (rec.appData?.screenShare) {
          peer.participant.screenSharing = false;
          peer.participant.screenStream = null;
        } else {
          peer.participant.videoMuted = true;
          peer.participant.videoStream = null;
        }
      }
      peer.producers.delete(producerId);
      this.emitter.emit("participant:updated", { ...peer.participant });
      if (peer.producers.size === 0 && peer.consumers.size === 0) {
        this.peers.delete(peerId);
        this.emitter.emit("participant:left", { id: peerId });
      }
      emitParticipantsSnapshot(this.emitter, this.getParticipants());
      return;
    }
  }

  private consumeExistingProducers(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.recvTransport) return resolve();
      this.socket.emit("mediasoup:getProducers", { roomId: this.roomId }, (response: any) => {
        if (response?.error) {
          console.warn("[mediasoup] getProducers error:", response.error);
          return resolve();
        }
        (response.producers || []).forEach(({ producerId, kind, peerId, peerName, appData }: any) => {
          this.ensurePeer(peerId || producerId, peerName);
          const peer = this.peers.get(peerId || producerId)!;
          if (!peer.producers.has(producerId)) {
            peer.producers.set(producerId, { kind, appData });
            if (appData?.screenShare) {
              peer.participant.screenSharing = true;
              this.emitter.emit("participant:updated", { ...peer.participant });
            }
          }
          this.consume(producerId, kind, appData);
        });
        emitParticipantsSnapshot(this.emitter, this.getParticipants());
        resolve();
      });
    });
  }

  // ------------------------------------------------------------------
  // Local controls
  // ------------------------------------------------------------------

  getParticipants(): RemoteParticipant[] {
    return Array.from(this.peers.values()).map((p) => ({ ...p.participant }));
  }

  getLocalState(): LocalMediaState {
    return { ...this.localState };
  }

  getLocalVideoStream(): MediaStream | null {
    return this.localStream;
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  /** Route every pooled audio element (and future ones) to the chosen output. */
  applyAudioSink(sinkId: string): void {
    applySinkToAll(sinkId);
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    this.localState.audioEnabled = enabled;
    this.emitter.emit("local:state", { ...this.localState });
    try {
      if (this.localAudioProducer) {
        if (enabled) {
          if (this.localAudioProducer.paused) this.localAudioProducer.resume();
          this.socket.emit("mediasoup:resumeProducer", { producerId: this.localAudioProducer.id, roomId: this.roomId });
        } else {
          if (!this.localAudioProducer.paused) this.localAudioProducer.pause();
          this.socket.emit("mediasoup:pauseProducer", { producerId: this.localAudioProducer.id, roomId: this.roomId });
        }
      } else if (enabled) {
        // Producer missing (e.g. media start failed) — try to acquire now.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.localStream = this.localStream || stream;
        if (this.sendTransport) {
          this.localAudioProducer = await this.sendTransport.produce({
            track: stream.getAudioTracks()[0],
            appData: { userName: this.opts.userName, userId: this.opts.userId, source: "mic" },
          });
          this.setupLocalAudioLevel(stream);
        }
      }
      this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
    } catch (err) {
      console.warn("[mediasoup] setAudioEnabled failed:", err);
      throw err;
    }
  }

  /**
   * Camera ON/OFF — deterministic.
   *
   * Production bug (same shape as the LiveKit path): when the video producer
   * had to be re-acquired (e.g. track stopped after join-with-video-off or a
   * device hiccup), the code kept the OLD audio-only `this.localStream` and
   * emitted it — the tile received a stream WITHOUT a video track and showed
   * the avatar forever. Fix: always build a merged stream (existing audio +
   * fresh video track), assign it, and emit a FRESH MediaStream so every tile
   * re-attaches the <video> element (also un-sticks iOS Safari after mute).
   */
  async setVideoEnabled(enabled: boolean): Promise<void> {
    this.localState.videoEnabled = enabled;
    this.emitter.emit("local:state", { ...this.localState });
    try {
      if (this.localVideoProducer) {
        if (enabled) {
          if (this.localVideoProducer.paused) this.localVideoProducer.resume();
          this.socket.emit("mediasoup:resumeProducer", { producerId: this.localVideoProducer.id, roomId: this.roomId });
        } else {
          if (!this.localVideoProducer.paused) this.localVideoProducer.pause();
          this.socket.emit("mediasoup:pauseProducer", { producerId: this.localVideoProducer.id, roomId: this.roomId });
        }
        const videoTracks = this.localStream?.getVideoTracks() || [];
        videoTracks.forEach((t) => (t.enabled = enabled));
        if (enabled) {
          // Re-emit a FRESH stream so tiles re-attach + play() (iOS un-stick).
          const vt = videoTracks.find((t) => t.readyState === "live");
          if (vt) {
            const fresh = new MediaStream([vt]);
            this.localStream?.getAudioTracks().forEach((at) => fresh.addTrack(at));
            this.localStream = fresh;
            this.emitter.emit("local:stream", fresh);
          }
        }
      } else if (enabled && this.sendTransport) {
        // Producer missing (video was off at join / track was lost) — acquire
        // the camera now, merge with the existing audio track and publish.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        this.localVideoProducer = await this.sendTransport.produce({
          track: videoTrack,
          appData: { userName: this.opts.userName, userId: this.opts.userId, source: "webcam" },
        });
        // MERGE: previous behaviour reused the stale audio-only stream here.
        const merged = new MediaStream([videoTrack]);
        this.localStream?.getAudioTracks().forEach((at) => merged.addTrack(at));
        this.localStream = merged;
        this.emitter.emit("local:stream", merged);
      }
    } catch (err) {
      console.warn("[mediasoup] setVideoEnabled failed:", err);
      throw err;
    }
  }

  async switchCamera(): Promise<void> {
    try {
      const track = this.localStream?.getVideoTracks()[0] as any;
      if (!track) return;
      const settings = track.getSettings?.() || {};
      if (settings.facingMode) {
        const next = settings.facingMode === "user" ? "environment" : "user";
        if (this.localVideoProducer) this.localVideoProducer.close();
        this.localVideoProducer = null;
        track.stop();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const newTrack = stream.getVideoTracks()[0];
        this.localStream?.removeTrack(track);
        this.localStream?.addTrack(newTrack);
        if (this.sendTransport) {
          this.localVideoProducer = await this.sendTransport.produce({
            track: newTrack,
            appData: { userName: this.opts.userName, userId: this.opts.userId, source: "webcam" },
          });
        }
        this.emitter.emit("local:stream", this.localStream);
      } else {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        if (cams.length < 2) return;
        const current = settings.deviceId;
        const next = cams.find((d) => d.deviceId !== current) || cams[0];
        if (this.localVideoProducer) this.localVideoProducer.close();
        this.localVideoProducer = null;
        track.stop();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } });
        const newTrack = stream.getVideoTracks()[0];
        this.localStream?.removeTrack(track);
        this.localStream?.addTrack(newTrack);
        if (this.sendTransport) {
          this.localVideoProducer = await this.sendTransport.produce({
            track: newTrack,
            appData: { userName: this.opts.userName, userId: this.opts.userId, source: "webcam" },
          });
        }
        this.emitter.emit("local:stream", this.localStream);
      }
    } catch (err) {
      console.warn("[mediasoup] switchCamera failed:", err);
    }
  }

  async startScreenShare(): Promise<void> {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });
      this.localScreenStream = stream;
      const track = stream.getVideoTracks()[0];
      if (this.sendTransport) {
        this.localScreenProducer = await this.sendTransport.produce({
          track,
          appData: { userName: this.opts.userName, userId: this.opts.userId, screenShare: true, source: "screen" },
        });
      }
      track.addEventListener("ended", () => {
        this.stopScreenShare().catch(() => {});
      });
      this.localState.screenSharing = true;
      this.emitter.emit("local:screen", stream);
      this.emitter.emit("local:state", { ...this.localState });
      this.socket.emit("screen-share:start", {
        roomId: this.roomId,
        ...(this.opts.callType === "meeting" ? { meetingId: this.roomId } : { callId: this.roomId }),
        userName: this.opts.userName,
      });
    } catch (err: any) {
      if (String(err?.name) !== "NotAllowedError") {
        this.emitter.emit("media:error", { message: "Screen sharing is not supported on this device." });
      }
      throw err;
    }
  }

  async stopScreenShare(): Promise<void> {
    try {
      this.localScreenProducer?.close();
      this.localScreenProducer = null;
      this.localScreenStream?.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
      this.localState.screenSharing = false;
      this.emitter.emit("local:screen", null);
      this.emitter.emit("local:state", { ...this.localState });
      this.socket.emit("screen-share:stop", {
        roomId: this.roomId,
        ...(this.opts.callType === "meeting" ? { meetingId: this.roomId } : { callId: this.roomId }),
        userName: this.opts.userName,
      });
    } catch (err) {
      console.warn("[mediasoup] stopScreenShare failed:", err);
    }
  }
}
