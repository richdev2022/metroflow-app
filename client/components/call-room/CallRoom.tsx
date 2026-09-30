import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { getSingletonSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api-client";
import { AudioUtils } from "@/lib/audio-utils";
import { reportLocalStream, minimizeCall } from "@/lib/active-call";
import {
  createCallingClient,
  isLiveKitCredentials,
  applyCaptionSegment,
  listAudioOutputDevices,
  loadPersistedSinkId,
  nextCaptionId,
  selectAudioOutput,
  supportsSinkId,
  type AudioOutputDevice,
  type CallingClient,
  type CallingCredentials,
  type CaptionItem,
  type ConnectionState,
  type LocalMediaState,
  type RemoteParticipant,
} from "@/lib/calling";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/BrandLogo";
import { AlertCircle, CheckCircle2, Loader2, Radio, Timer, Wifi, WifiOff, Users, Info, PictureInPicture2, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParticipantTile } from "./ParticipantTile";
import { ControlBar } from "./ControlBar";
import {
  CaptionsOverlay,
  ChatPanel,
  MeetingInfoPanel,
  ParticipantsPanel,
  type RoomAppParticipant,
  type RoomChatMessage,
  type RoomWaitingEntry,
} from "./SidePanels";

export interface CallRoomProps {
  /** Legacy prop: call/meeting code (socket join accepts code or UUID). */
  roomId?: string;
  callId?: string;
  meetingId?: string;
  callType?: "audio" | "video";
  onLeave: () => void;
  userName?: string;
  isHost?: boolean;
  waitingRoomEnabled?: boolean;
  /** Provider credentials from the join endpoint (backend decides). */
  calling?: CallingCredentials | null;
  teamMembers?: any[];
  currentParticipantIds?: string[];
  initialParticipants?: Array<{
    userId: string;
    status: "invited" | "joined" | "left";
    joinedAt?: string;
    leftAt?: string;
  }>;
  inviteDetails?: {
    title?: string;
    code?: string;
    password?: string | null;
    waitingRoomEnabled?: boolean;
    startTime?: string;
  } | null;
  /** Live label shown in the top bar (meeting title / call code). */
  title?: string;
  /** Legacy hooks used by the Calls page to track roster changes. */
  onParticipantsAdded?: (participantIds: string[]) => void;
  onParticipantStatusChange?: (payload: { userId: string; status: "invited" | "joined" | "left" }) => void;
}

type Phase = "joining" | "waiting" | "connected" | "error" | "ended";

const ROOM_BG = "bg-[#0B0F1A]";

/** Captions on/off preference survives reloads. */
const CAPTIONS_STORAGE_KEY = "metricorex:captions-enabled";

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

type GridTile = { key: string; kind: "screen" | "camera"; participant: RemoteParticipant | null; name?: string };

/**
 * The Metricorex Call Room.
 *
 * Provider-agnostic: media is owned by a CallingClient (LiveKit or MediaSoup —
 * chosen from the backend's `calling` credentials), while presence, waiting
 * room, chat, captions, duration limits and moderation stay app-level on
 * Socket.IO. Users never see provider names.
 *
 * UX: Google Meet-style stage — tap any tile to pin it big; screen shares
 * auto-stage; the speaker's card glows; the whole call can minimize into a
 * floating bubble while media keeps running.
 */
export function CallRoom({
  roomId,
  callId,
  meetingId,
  callType = "video",
  onLeave,
  userName,
  isHost = false,
  waitingRoomEnabled = false,
  calling,
  initialParticipants,
  inviteDetails,
  title,
  onParticipantsAdded,
  onParticipantStatusChange,
}: CallRoomProps) {
  void onParticipantStatusChange;
  const { toast } = useToast();
  const identity = callId || meetingId || roomId || "";
  const isMeeting = !!meetingId;
  const prefix = isMeeting ? "meeting" : "call";
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isGuest = !token;
  const localUserId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("userId") || (isGuest ? `guest-local-${Math.random().toString(36).slice(2, 10)}` : "");
  }, [isGuest]);
  const displayName = userName || (typeof window !== "undefined" ? localStorage.getItem("userName") || "You" : "You");

  const { isConnected, getSocket } = useSocket({ userId: localUserId || undefined, userName: displayName });

  // ------------------------------------------------------------------
  // Room state
  // ------------------------------------------------------------------
  const [phase, setPhase] = useState<Phase>("joining");
  const [phaseMessage, setPhaseMessage] = useState<string>("Preparing to join…");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [endedInfo, setEndedInfo] = useState<string | null>(null);
  const [echoWarning, setEchoWarning] = useState(false);

  const [appParticipants, setAppParticipants] = useState<RoomAppParticipant[]>(() => {
    const initial: RoomAppParticipant[] = (initialParticipants || [])
      .filter((p) => p.status === "joined" || p.status === "invited")
      .map((p) => ({
        id: p.userId,
        name: p.userId === localUserId ? displayName : "Participant",
        isHost: false,
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
        isLocal: p.userId === localUserId,
      }));
    return initial;
  });
  const [mediaParticipants, setMediaParticipants] = useState<RemoteParticipant[]>([]);

  const [mediaState, setMediaState] = useState<LocalMediaState>({ audioEnabled: true, videoEnabled: callType !== "audio", screenSharing: false });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [mediaBlocked, setMediaBlocked] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);

  const [captionsEnabled, setCaptionsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(CAPTIONS_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [captionSegments, setCaptionSegments] = useState<CaptionItem[]>([]);
  const [recordingActive, setRecordingActive] = useState(false);
  const [waitingUnadmitted, setWaitingUnadmitted] = useState(false);
  const [waitingQueue, setWaitingQueue] = useState<RoomWaitingEntry[]>([]);

  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  // Audio output routing (speaker/earpiece/bluetooth) — see lib/calling/audio-routing.
  const [audioOutputs, setAudioOutputs] = useState<AudioOutputDevice[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState<string>(() => loadPersistedSinkId());
  const [sinkSupported] = useState(() => supportsSinkId());
  /** Throttle for interim caption relays (socket flooding guard). */
  const interimCaptionRef = useRef<{ text: string; lastEmitted: number }>({ text: "", lastEmitted: 0 });

  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const clientRef = useRef<CallingClient | null>(null);
  const credentialsRef = useRef<CallingCredentials | null>(calling || null);
  const admittedRef = useRef(false);
  const joinAckedRef = useRef(false);
  const chatPanelOpenRef = useRef(false);
  chatPanelOpenRef.current = chatOpen;
  const participantsOpenRef = useRef(false);
  participantsOpenRef.current = participantsOpen;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const clientUnsubsRef = useRef<Array<() => void>>([]);
  /** Late-bound handle so a failed connect can re-invoke connectMedia. */
  const connectMediaRef = useRef<(creds: CallingCredentials | null) => void>(() => undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionsSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  /** Requested-but-not-yet-applied media intents (client still connecting). */
  const pendingAudioRef = useRef<boolean | null>(null);
  const pendingVideoRef = useRef<boolean | null>(null);

  const remainingMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - now) : null;
  const effectiveRoomId = identity;

  const emitRoom = useCallback((event: string, payload: any, ack?: (resp: any) => void) => {
    const socket = getSingletonSocket();
    if (!socket) return;
    if (ack) socket.emit(event, payload, ack);
    else socket.emit(event, payload);
  }, []);

  /** Server-side (Egress) recording id when one is active for this room. */
  const serverRecordingIdRef = useRef<string | null>(null);
  /** One silent reconnect with freshly-minted credentials per join attempt. */
  const mediaRetryRef = useRef(0);

  const teardownMediaClient = useCallback(() => {
    const c = clientRef.current;
    clientRef.current = null;
    for (const fn of clientUnsubsRef.current) {
      try { fn(); } catch { /* ignore */ }
    }
    clientUnsubsRef.current = [];
    if (c) {
      // destroy() is the single authoritative teardown: stops every local
      // track, closes the room/transports, detaches media elements, clears
      // reconnect timers and resets internal state (idempotent).
      try { c.destroy().catch(() => undefined); } catch { /* ignore */ }
    }
  }, []);

  // ------------------------------------------------------------------
  // Cleanup — the ONE authoritative path (used by leave button, call:end,
  // unexpected disconnect, unmount and beforeunload).
  // ------------------------------------------------------------------
  const cleanupCallMedia = useCallback(() => {
    teardownMediaClient();
    stopLocalRecognition();
    stopRecording(false);
    reportLocalStream(null);
    setCaptionSegments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teardownMediaClient]);

  /** Re-mint media credentials — the backend may hand back MediaSoup creds
   * when the previously-selected provider (e.g. LiveKit) is unreachable. */
  const refreshCredentials = useCallback(async (): Promise<CallingCredentials | null> => {
    try {
      const res = await api.post("/rtc/token", {
        roomType: isMeeting ? "meeting" : "call",
        roomId: effectiveRoomId,
      });
      const creds = res?.data?.data?.credentials || res?.data?.credentials;
      if (creds?.provider) {
        credentialsRef.current = creds as CallingCredentials;
        return creds as CallingCredentials;
      }
    } catch (err: any) {
      console.warn("[call-room] credential refresh failed:", err?.response?.data?.error || err?.message);
    }
    return null;
  }, [effectiveRoomId, isMeeting]);

  // ------------------------------------------------------------------
  // Socket room lifecycle (presence / waiting room / duration / chat)
  // ------------------------------------------------------------------

  const connectMedia = useCallback((creds: CallingCredentials | null) => {
    const socket = getSingletonSocket();
    if (!socket || clientRef.current) return;
    const client = createCallingClient({
      credentials: creds,
      socket,
      roomId: effectiveRoomId,
      userId: localUserId,
      userName: displayName,
      isHost,
      callType,
      startWithAudio: pendingAudioRef.current !== null ? pendingAudioRef.current : true,
      startWithVideo: pendingVideoRef.current !== null ? pendingVideoRef.current : callType !== "audio",
    });
    clientUnsubsRef.current.push(
      client.on("participants", (list) => setMediaParticipants(list)),
      client.on("local:state", (s) => {
        setMediaState(s);
        // Publish the live local camera stream for the minimized bubble.
        reportLocalStream(client.getLocalVideoStream());
      }),
      client.on("local:stream", setLocalStream),
      client.on("local:screen", setLocalScreenStream),
      client.on("connection", (c) => {
        setConnection(c);
        if (c === "disconnected" && clientRef.current) {
          // The room is gone for good (LiveKit reconnect exhausted / MediaSoup
          // transport failed). Tear down all media — no zombie tracks, elements
          // or "Connected" header — and surface the rejoin screen.
          teardownMediaClient();
          setConnectionError("Your connection to the call was lost.");
          setPhase((cur) => (cur === "ended" ? cur : "error"));
        }
      }),
      client.on("active-speaker", ({ id }) => setActiveSpeakerId(id || null)),
      client.on("media:error", (e) => setMediaBlocked(e.message)),
      client.on("error", (e) => {
        setConnectionError(e.message);
        toast({ title: "Connection notice", description: e.message });
      }),
    );
    // participant:updated needs a functional merge — wire manually:
    clientUnsubsRef.current.push(
      client.on("participant:updated", (p) => {
        setMediaParticipants((prev) => {
          const idx = prev.findIndex((x) => x.id === p.id);
          if (idx === -1) return [...prev, p];
          const next = [...prev];
          next[idx] = p;
          return next;
        });
      }),
    );
    clientUnsubsRef.current.push(
      client.on("participant:joined", (p) => {
        setMediaParticipants((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      }),
    );
    clientUnsubsRef.current.push(
      client.on("participant:left", ({ id }) => {
        setMediaParticipants((prev) => prev.filter((x) => x.id !== id));
        setPinnedKey((cur) => (cur === `p-${id}` ? null : cur));
      }),
    );
    clientRef.current = client;
    setConnection("connecting");
    client
      .connect()
      .then(() => {
        mediaRetryRef.current = 0;
        setPhase((cur) => (cur === "joining" ? "connected" : cur));
        // Apply any media intents the user toggled while connecting.
        const pAudio = pendingAudioRef.current;
        const pVideo = pendingVideoRef.current;
        pendingAudioRef.current = null;
        pendingVideoRef.current = null;
        if (pAudio !== null && pAudio !== client.getLocalState().audioEnabled) {
          client.setAudioEnabled(pAudio).catch(() => undefined);
        }
        if (pVideo !== null && pVideo !== client.getLocalState().videoEnabled) {
          client.setVideoEnabled(pVideo).catch(() => undefined);
        }
      })
      .catch(async (err) => {
        console.error("[call-room] media connect failed:", err);
        // Credentials can go stale between minting and connecting (e.g. the
        // media server dies in between). Re-fetch once — the backend now
        // health-checks LiveKit at mint time, so the retry either gets fresh
        // LiveKit credentials or MediaSoup ones and the call still happens.
        const failedProvider = credentialsRef.current?.provider;
        if (failedProvider === "livekit" && mediaRetryRef.current < 1) {
          mediaRetryRef.current += 1;
          teardownMediaClient();
          const fresh = await refreshCredentials();
          if (fresh) {
            connectMediaRef.current(fresh);
            return;
          }
        }
        setConnectionError(String(err?.message || "Unable to connect to the call media server"));
        setPhase("error");
      });
  }, [callType, displayName, effectiveRoomId, getSingletonSocket.length, isHost, localUserId, refreshCredentials, teardownMediaClient, toast]);
  connectMediaRef.current = connectMedia;

  const doSocketJoin = useCallback(() => {
    const socket = getSingletonSocket();
    if (!socket || !effectiveRoomId) return;
    emitRoom(
      `${prefix}:join`,
      {
        roomId: effectiveRoomId,
        userId: localUserId,
        userName: displayName,
        isHost,
        audioEnabled: true,
        videoEnabled: callType !== "audio",
        isGuest,
        waitingRoomSupport: true,
      },
      (response: any) => {
        if (joinAckedRef.current) return;
        joinAckedRef.current = true;
        if (!response?.success) {
          setPhaseMessage(response?.error || "Unable to join this room");
          setPhase("error");
          return;
        }
        if (response.waitingRoom) {
          setWaitingUnadmitted(true);
          setPhase("waiting");
          setPhaseMessage("Waiting for the host to admit you…");
          return;
        }
        admittedRef.current = true;
        if (response.endsAt) setEndsAt(response.endsAt);
        if (response.calling && !credentialsRef.current) credentialsRef.current = response.calling;
        if (Array.isArray(response.participantsList)) {
          setAppParticipants((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            for (const p of response.participantsList) {
              map.set(p.id, {
                id: p.id,
                name: p.name || "Participant",
                isHost: !!p.isHost,
                audioEnabled: p.audioEnabled !== false,
                videoEnabled: p.videoEnabled !== false,
                screenSharing: !!p.screenSharing,
                isGuest: !!p.isGuest,
                isLocal: p.id === localUserId,
              });
            }
            return Array.from(map.values());
          });
        }
        setPhase("connected");
        // Hosts pick up anyone already waiting in the room.
        if (isHost) {
          emitRoom("waiting-room:get-queue", { roomId: effectiveRoomId, meetingId: isMeeting ? effectiveRoomId : undefined }, (resp: any) => {
            if (resp?.queue && Array.isArray(resp.queue)) setWaitingQueue(normalizeQueue(resp.queue));
          });
        }
        connectMedia(credentialsRef.current);
      },
    );
  }, [callType, connectMedia, displayName, effectiveRoomId, emitRoom, isGuest, isHost, isMeeting, localUserId, prefix]);

  function normalizeQueue(queue: any[]): RoomWaitingEntry[] {
    return queue
      .filter((e) => e && (e.participantId || e.userId))
      .map((e) => ({
        participantId: String(e.participantId || e.userId),
        userName: String(e.userName || e.participantName || e.name || "Guest"),
        isGuest: !!e.isGuest,
        since: e.since != null ? new Date(typeof e.since === "number" ? e.since : Date.parse(e.since)).toISOString() : undefined,
      }));
  }

  // wait for socket connection, then join
  useEffect(() => {
    if (phase !== "joining") return;
    if (!isConnected || !effectiveRoomId) {
      const t = setTimeout(() => {
        if (!joinAckedRef.current && phase === "joining") {
          setPhaseMessage("Still connecting… check your internet connection.");
        }
      }, 6000);
      return () => clearTimeout(t);
    }
    doSocketJoin();
  }, [doSocketJoin, effectiveRoomId, isConnected, phase]);

  // join watchdog — never leave the user stuck on "Preparing to join…"
  useEffect(() => {
    if (phase !== "joining") return;
    const t = setTimeout(() => {
      if (phase === "joining") {
        setPhaseMessage("This is taking longer than expected.");
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [phase]);

  // App-level socket events
  useEffect(() => {
    const socket = getSingletonSocket();
    if (!socket) return;
    const handlers: Array<[string, (p: any) => void]> = [
      [`${prefix}:participant-joined`, (p) => {
        const id = p?.userId || p?.id;
        if (!id || id === localUserId) return;
        setAppParticipants((prev) =>
          prev.some((x) => x.id === id)
            ? prev
            : [...prev, {
                id,
                name: p?.userName || "Participant",
                isHost: !!p?.isHost,
                audioEnabled: true,
                videoEnabled: true,
                screenSharing: false,
                isGuest: !!p?.isGuest,
                isLocal: false,
              }],
        );
        onParticipantsAdded?.([id]);
      }],
      [`${prefix}:participants-list`, (p) => {
        if (p?.endsAt) setEndsAt(p.endsAt);
        if (Array.isArray(p?.participants)) {
          setAppParticipants(
            p.participants.map((x: any) => ({
              id: x.id,
              name: x.name || "Participant",
              isHost: !!x.isHost,
              audioEnabled: x.audioEnabled !== false,
              videoEnabled: x.videoEnabled !== false,
              screenSharing: !!x.screenSharing,
              isGuest: !!x.isGuest,
              isLocal: x.id === localUserId,
            })),
          );
        }
      }],
      [`${prefix}:duration-started`, (p) => p?.endsAt && setEndsAt(p.endsAt)],
      [`${prefix}:duration-active`, (p) => p?.endsAt && setEndsAt(p.endsAt)],
      [`${prefix}:countdown-warning`, (p) => {
        const mins = p?.remainingMs ? Math.ceil(p.remainingMs / 60000) : 1;
        toast({
          title: "Meeting ending soon",
          description: `Your plan's meeting time is almost over (${mins} min remaining).`,
        });
      }],
      [`${prefix}:ended`, (p) => {
        setEndedInfo(p?.reason === "duration_limit" ? "The meeting time limit for this plan was reached." : "This call has ended.");
        setPhase("ended");
        // call:end / duration-limit — same authoritative cleanup as leaving:
        // stop tracks, detach elements, clear timers and any stale UI state.
        cleanupCallMedia();
      }],
      [`waiting-room:admitted`, (p: any) => {
        const roomId = p?.roomId;
        if (roomId && roomId !== effectiveRoomId) {
          // admitted payload may carry the resolved UUID — accept it
          setEndsAt(p?.endsAt || null);
        }
        admittedRef.current = true;
        setWaitingUnadmitted(false);
        setPhase("connected");
        joinAckedRef.current = true;
        // REST re-sync (auth users) then join media with fresh credentials
        (async () => {
          try {
            if (!isGuest) {
              const res = isMeeting
                ? await api.post(`/meetings/${effectiveRoomId}/join`, {})
                : await api.post(`/calls/${effectiveRoomId}/join`, {});
              const creds = res?.data?.data?.calling || res?.data?.calling;
              if (creds) credentialsRef.current = creds;
            }
          } catch {
            // REST re-sync is best effort — the socket join already admitted us
          }
          connectMedia(credentialsRef.current);
        })();
      }],
      [`waiting-room:denied`, () => {
        setEndedInfo("The host declined your request to join.");
        setPhase("ended");
      }],
      // Host-side waiting-room updates
      [`waiting-room:pending`, (p: any) => {
        const pid = p?.participantId || p?.userId;
        if (!pid) return;
        setWaitingQueue((prev) =>
          prev.some((x) => x.participantId === pid)
            ? prev
            : [...prev, {
                participantId: String(pid),
                userName: String(p?.userName || p?.participantName || "Guest"),
                isGuest: !!p?.isGuest,
                since: new Date().toISOString(),
              }],
        );
        if (!participantsOpenRef.current) {
          toast({ title: "Someone is waiting to join", description: `${p?.userName || p?.participantName || "A participant"} is in the waiting room.` });
        }
      }],
      [`waiting-room:queue`, (p: any) => {
        if (Array.isArray(p?.queue)) setWaitingQueue(normalizeQueue(p.queue));
      }],
      [`${prefix}:participant-removed`, (p) => {
        if (p?.userId === localUserId) {
          setEndedInfo("You were removed from this call by the host.");
          setPhase("ended");
        } else if (p?.userId) {
          setMediaParticipants((prev) => prev.filter((x) => x.id !== p.userId));
          setAppParticipants((prev) => prev.filter((x) => x.id !== p.userId));
          setWaitingQueue((prev) => prev.filter((x) => x.participantId !== p.userId));
        }
      }],
      [`${prefix}:participant-mute-requested`, (p) => {
        if (p?.userId === localUserId && clientRef.current) {
          clientRef.current.setAudioEnabled(false).catch(() => {});
          toast({ title: "Muted by host" });
        }
      }],
      [`${prefix}:media-state`, (p) => {
        if (!p?.userId || p.userId === localUserId) return;
        setAppParticipants((prev) =>
          prev.map((x) =>
            x.id === p.userId
              ? { ...x, audioEnabled: p.audioEnabled !== false, videoEnabled: p.videoEnabled !== false, screenSharing: !!p.screenSharing }
              : x,
          ),
        );
      }],
      [`${prefix}:participant-media-state`, (p) => {
        if (!p?.userId || p.userId === localUserId) return;
        setAppParticipants((prev) =>
          prev.map((x) =>
            x.id === p.userId
              ? { ...x, audioEnabled: p.audioEnabled !== false, videoEnabled: p.videoEnabled !== false, screenSharing: !!p.screenSharing }
              : x,
          ),
        );
      }],
      [`${prefix}:multi-device`, () => setEchoWarning(true)],
      [`meeting-chat:message`, (m) => {
        const message: RoomChatMessage = {
          id: `${m?.timestamp}-${m?.userId}-${Math.random().toString(36).slice(2, 6)}`,
          userId: m?.userId || "",
          senderName: m?.senderName || m?.userName || "Guest",
          message: m?.message || "",
          timestamp: m?.timestamp || new Date().toISOString(),
          isLocal: m?.userId === localUserId,
        };
        setChatMessages((prev) => [...prev, message]);
        if (!chatPanelOpenRef.current && message.userId !== localUserId) {
          setUnreadChat((n) => n + 1);
        }
      }],
      [`caption:updated`, (c) => {
        if (!c?.text) return;
        // Rolling buffer: last 3 finals + trailing interim, stable ids so the
        // pill updates in place (see lib/calling/captions.ts).
        setCaptionSegments((prev) =>
          applyCaptionSegment(prev, {
            id: typeof c.id === "string" && c.id ? c.id : nextCaptionId(String(c.speakerId || "spk"), String(c.ts || new Date().toISOString())),
            speakerId: String(c.speakerId || ""),
            speakerName: String(c.speakerName || "Speaker"),
            text: String(c.text),
            ts: String(c.ts || new Date().toISOString()),
            isFinal: c.isFinal !== false,
          }),
        );
      }],
      [`recording:started`, (p: any) => {
        setRecordingActive(true);
        if (p?.recordingId && p?.mode === "server") serverRecordingIdRef.current = p.recordingId;
      }],
      [`recording:stopped`, () => {
        setRecordingActive(false);
        serverRecordingIdRef.current = null;
      }],
      [`screen-share:started`, (p) => {
        if (p?.userName && p?.userName !== displayName) {
          setAppParticipants((prev) => prev.map((x) => (x.name === p.userName ? { ...x, screenSharing: true } : x)));
        }
      }],
      [`screen-share:stopped`, (p) => {
        if (p?.userName) {
          setAppParticipants((prev) => prev.map((x) => (x.name === p.userName ? { ...x, screenSharing: false } : x)));
        }
      }],
    ];

    for (const [event, handler] of handlers) {
      socket.on(event, handler);
    }
    return () => {
      for (const [event, handler] of handlers) {
        socket.off(event, handler);
      }
    };
  }, [connectMedia, displayName, effectiveRoomId, isGuest, isMeeting, localUserId, prefix, toast]);

  // Socket reconnection handling — never strand a participant.
  useEffect(() => {
    const socket = getSingletonSocket();
    if (!socket) return;
    const onDisconnect = () => {
      setConnection("reconnecting");
      clientRef.current && (clientRef.current as any).markSocketReconnecting?.();
    };
    const onReconnect = () => {
      clientRef.current && (clientRef.current as any).resumeAfterSocketReconnect?.();
      // re-join presence room (idempotent)
      joinAckedRef.current = false;
      doSocketJoin();
    };
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect", onReconnect);
    return () => {
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect", onReconnect);
    };
  }, [doSocketJoin, getSingletonSocket.length]);

  // ticking clock for duration + timer chips
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // elapsed display (from join time)
  const joinedAtRef = useRef<number>(Date.now());

  // Cleanup on unmount + beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Page is going away — best-effort synchronous cleanup: stop tracks and
      // notify the room. Socket emit may not flush; destroy() stops the
      // camera/mic synchronously which is what matters most.
      try {
        const socket = getSingletonSocket();
        if (socket && effectiveRoomId && joinAckedRef.current) {
          socket.emit(`${prefix}:leave`, { roomId: effectiveRoomId, userId: localUserId, userName: displayName });
        }
      } catch {
        // ignore
      }
      try {
        clientRef.current?.destroy?.();
      } catch {
        // ignore
      }
      clientRef.current = null;
      reportLocalStream(null);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      for (const fn of clientUnsubsRef.current) {
        try { fn(); } catch { /* ignore */ }
      }
      clientUnsubsRef.current = [];
      try {
        clientRef.current?.destroy?.();
      } catch {
        // ignore
      }
      clientRef.current = null;
      stopLocalRecognition();
      stopRecording(false);
      reportLocalStream(null);
      if (effectiveRoomId && joinAckedRef.current) {
        emitRoom(`${prefix}:leave`, { roomId: effectiveRoomId, userId: localUserId, userName: displayName });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------
  const applyMediaIntent = useCallback(async (kind: "audio" | "video", next: boolean) => {
    const client = clientRef.current;
    if (!client || connection !== "connected") {
      // The media client is still connecting — remember the intent and apply
      // it the moment the client is live (see connectMedia's then handler).
      if (kind === "audio") pendingAudioRef.current = next;
      else pendingVideoRef.current = next;
      setMediaState((s) => (kind === "audio" ? { ...s, audioEnabled: next } : { ...s, videoEnabled: next }));
      toast({
        title: next ? "Turning it on…" : "Turning it off…",
        description: "The call is still connecting — your change will apply in a moment.",
      });
      return;
    }
    try {
      if (kind === "audio") await client.setAudioEnabled(next);
      else await client.setVideoEnabled(next);
      setMediaState((s) => (kind === "audio" ? { ...s, audioEnabled: next } : { ...s, videoEnabled: next }));
      setMediaBlocked(null);
      emitRoom(`${prefix}:participant-media-state`, {
        roomId: effectiveRoomId,
        userId: localUserId,
        audioEnabled: kind === "audio" ? next : mediaState.audioEnabled,
        videoEnabled: kind === "video" ? next : mediaState.videoEnabled,
        screenSharing: mediaState.screenSharing,
      });
    } catch (err: any) {
      const name = String(err?.name || "");
      if (name === "NotAllowedError" || name === "NotFoundError" || name === "NotReadableError") {
        setMediaBlocked(
          kind === "audio"
            ? "Microphone access is blocked. Tap “Enable” to allow it."
            : "Camera access is blocked. Tap “Enable” to allow it.",
        );
      } else {
        toast({ title: "Could not change media", description: String(err?.message || "Try again in a moment.") });
      }
    }
  }, [connection, effectiveRoomId, emitRoom, localUserId, mediaState, prefix, toast]);

  const toggleAudio = useCallback(() => {
    applyMediaIntent("audio", !mediaState.audioEnabled);
  }, [applyMediaIntent, mediaState.audioEnabled]);

  const toggleVideo = useCallback(() => {
    applyMediaIntent("video", !mediaState.videoEnabled);
  }, [applyMediaIntent, mediaState.videoEnabled]);

  /** Re-request blocked permissions and re-publish. */
  const enableBlockedMedia = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      if (!mediaState.audioEnabled) await client.setAudioEnabled(true);
      if (callType !== "audio" && !mediaState.videoEnabled) await client.setVideoEnabled(true);
      setMediaBlocked(null);
      toast({ title: "Media enabled", description: "You are back on air." });
    } catch {
      toast({
        title: "Permission still blocked",
        description: "Open your browser's site settings and allow camera & microphone, then reload.",
      });
    }
  }, [callType, mediaState.audioEnabled, mediaState.videoEnabled, toast]);

  const toggleScreenShare = useCallback(async () => {
    try {
      if (mediaState.screenSharing) {
        await clientRef.current?.stopScreenShare();
      } else {
        await clientRef.current?.startScreenShare();
      }
    } catch {
      // media:error event already surfaced details
    }
  }, [mediaState.screenSharing]);

  const switchCamera = useCallback(() => {
    clientRef.current?.switchCamera().catch(() => {});
  }, []);

  const sendChat = useCallback((text: string) => {
    emitRoom(`meeting-chat:message`, {
      roomId: effectiveRoomId,
      message: text,
      userId: localUserId,
      senderName: displayName,
      timestamp: new Date().toISOString(),
    });
  }, [displayName, effectiveRoomId, emitRoom, localUserId]);

  const leaveRoom = useCallback(() => {
    // If this participant was recording, broadcast the stop first (previous
    // behaviour) — then run the shared authoritative teardown.
    stopRecording(true);
    // 1. Authoritative media teardown (tracks, room, elements, timers).
    cleanupCallMedia();
    // 2. Existing socket leave event (plus host end).
    emitRoom(`${prefix}:leave`, { roomId: effectiveRoomId, userId: localUserId, userName: displayName });
    if (isHost) {
      emitRoom(`${prefix}:end`, isMeeting ? { meetingId: effectiveRoomId } : { roomId: effectiveRoomId });
    }
    // 3. Return to where the user started from — the entry-point onLeave also
    //    clears the active-call store (timer, bubble, panels) via the host.
    onLeave();
  }, [cleanupCallMedia, displayName, effectiveRoomId, emitRoom, isHost, isMeeting, localUserId, onLeave, prefix]);

  // Host moderation (backend re-validates; provider media action + broadcast)
  const removeParticipant = useCallback(async (identityToRemove: string) => {
    try {
      await api.post(`/rtc/rooms/${prefix}/${effectiveRoomId}/participants/${identityToRemove}/remove`, {});
      setMediaParticipants((prev) => prev.filter((x) => x.id !== identityToRemove));
      setAppParticipants((prev) => prev.filter((x) => x.id !== identityToRemove));
      toast({ title: "Participant removed" });
    } catch (err: any) {
      toast({ title: "Could not remove participant", description: String(err?.response?.data?.error || "") });
    }
  }, [effectiveRoomId, prefix, toast]);

  const muteParticipant = useCallback(async (identityToMute: string) => {
    try {
      await api.post(`/rtc/rooms/${prefix}/${effectiveRoomId}/participants/${identityToMute}/mute`, {});
      toast({ title: "Mute requested" });
    } catch (err: any) {
      toast({ title: "Could not mute participant", description: String(err?.response?.data?.error || "") });
    }
  }, [effectiveRoomId, prefix, toast]);

  // Waiting-room admission (host)
  const admitWaiting = useCallback((participantId: string) => {
    emitRoom("waiting-room:admit", {
      roomId: effectiveRoomId,
      meetingId: isMeeting ? effectiveRoomId : undefined,
      participantId,
    });
    setWaitingQueue((prev) => prev.filter((x) => x.participantId !== participantId));
  }, [effectiveRoomId, emitRoom, isMeeting]);

  const denyWaiting = useCallback((participantId: string) => {
    emitRoom("waiting-room:deny", {
      roomId: effectiveRoomId,
      meetingId: isMeeting ? effectiveRoomId : undefined,
      participantId,
    });
    setWaitingQueue((prev) => prev.filter((x) => x.participantId !== participantId));
  }, [effectiveRoomId, emitRoom, isMeeting]);

  const admitAllWaiting = useCallback(() => {
    emitRoom("waiting-room:admit-all", {
      roomId: effectiveRoomId,
      meetingId: isMeeting ? effectiveRoomId : undefined,
    });
    setWaitingQueue([]);
  }, [effectiveRoomId, emitRoom, isMeeting]);

  // ------------------------------------------------------------------
  // Recording (client-side MediaRecorder — provider-agnostic local capture)
  // ------------------------------------------------------------------
  function stopRecording(broadcast: boolean) {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    if (broadcast && recordingActive) {
      emitRoom(`recording:stop`, {
        roomId: effectiveRoomId,
        ...(isMeeting ? { meetingId: effectiveRoomId } : { callId: effectiveRoomId }),
      });
    }
  }

  const toggleRecording = useCallback(async () => {
    if (recordingActive) {
      if (serverRecordingIdRef.current) {
        // Server-side (Egress) recording — stop via the backend; finalization
        // (file URL/duration) lands via the LiveKit webhook moments later.
        const rid = serverRecordingIdRef.current;
        serverRecordingIdRef.current = null;
        setRecordingActive(false);
        try {
          await api.post(`/rtc/rooms/${isMeeting ? "meeting" : "call"}/${effectiveRoomId}/recording/stop`, { recordingId: rid });
          toast({ title: "Recording stopped", description: "Processing — it will appear under Recordings shortly." });
        } catch (err: any) {
          toast({ title: "Failed to stop recording", description: String(err?.response?.data?.error || err?.message || "") });
        }
        return;
      }
      stopRecording(true);
      return;
    }
    // LiveKit rooms record server-side (RoomCompositeEgress → storage): far
    // more reliable than a local composition, and identical for everyone.
    const creds = credentialsRef.current;
    if (creds?.provider === "livekit" && creds.token) {
      try {
        const res = await api.post(`/rtc/rooms/${isMeeting ? "meeting" : "call"}/${effectiveRoomId}/recording/start`, {
          audioOnly: callType === "audio",
        });
        const data = res?.data?.data || {};
        if (data.mode === "server" && data.recordingId) {
          serverRecordingIdRef.current = data.recordingId;
          setRecordingActive(true);
          toast({ title: "Recording started", description: "This room is being recorded on the server." });
          return;
        }
        // mode === "client" (e.g. storage not configured) → fall through to
        // the local recorder below.
      } catch (err: any) {
        if (err?.response?.data?.errorCode === "already_recording") {
          toast({ title: "Already recording", description: "This room is already being recorded." });
        } else {
          toast({ title: "Recording unavailable", description: String(err?.response?.data?.error || err?.message || "") });
        }
        return;
      }
    }
    try {
      const mixed = new MediaStream();
      localStream?.getTracks().forEach((t) => mixed.addTrack(t));
      const rec = new MediaRecorder(mixed, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm" });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        try {
          const created = await api.post("/recordings", isMeeting ? { meetingId: effectiveRoomId } : { callId: effectiveRoomId });
          const recordingId = created?.data?.data?.id || created?.data?.id;
          if (recordingId) {
            const form = new FormData();
            form.append("file", blob, `meeting-${Date.now()}.webm`);
            await api.post(`/recordings/${recordingId}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
            toast({ title: "Recording saved", description: "Find it under Recordings." });
          }
        } catch (err: any) {
          toast({ title: "Recording upload failed", description: String(err?.response?.data?.error || err?.message || "") });
        }
      };
      rec.start(1000);
      mediaRecorderRef.current = rec;
      setRecordingActive(true);
      emitRoom(`recording:start`, {
        roomId: effectiveRoomId,
        ...(isMeeting ? { meetingId: effectiveRoomId } : { callId: effectiveRoomId }),
      });
    } catch (err: any) {
      toast({ title: "Recording unavailable", description: String(err?.message || "Your browser blocked recording.") });
    }
  }, [callType, displayName, effectiveRoomId, emitRoom, isMeeting, localStream, recordingActive, toast]);

  // ------------------------------------------------------------------
  // Live captions (browser SpeechRecognition — provider-independent).
  // Segments are relayed by the backend to everyone + persisted for meetings.
  // ------------------------------------------------------------------
  function stopLocalRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }

  const toggleCaptions = useCallback(() => {
    if (captionsEnabled) {
      stopLocalRecognition();
      setCaptionsEnabled(false);
      try { localStorage.setItem(CAPTIONS_STORAGE_KEY, "0"); } catch { /* ignore */ }
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Captions not supported", description: "This browser does not support live captions." });
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    // Interim results keep the pill "live" for everyone — finals still create
    // the durable transcript segments.
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    const emitCaption = (text: string, isFinal: boolean) => {
      // Same event/payload the backend already accepts (caption:segment).
      // speakerId/speakerName are included for identity; the backend also
      // resolves them server-side from the socket session.
      emitRoom("caption:segment", {
        roomId: effectiveRoomId,
        roomType: isMeeting ? "meeting" : "call",
        speakerId: localUserId,
        speakerName: displayName,
        text,
        isFinal,
        language: recognition.lang,
      });
    };
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result?.[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          interimCaptionRef.current.text = "";
          emitCaption(text, true);
        } else {
          // Throttle interim relays (~250ms) — smooth pill without flooding.
          const now = Date.now();
          if (now - interimCaptionRef.current.lastEmitted > 250) {
            interimCaptionRef.current.lastEmitted = now;
            interimCaptionRef.current.text = text;
            emitCaption(text, false);
          }
        }
      }
    };
    recognition.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        toast({ title: "Captions blocked", description: "Grant microphone access to use live captions." });
        stopLocalRecognition();
        setCaptionsEnabled(false);
        try { localStorage.setItem(CAPTIONS_STORAGE_KEY, "0"); } catch { /* ignore */ }
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // restart race — ignore
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setCaptionsEnabled(true);
      try { localStorage.setItem(CAPTIONS_STORAGE_KEY, "1"); } catch { /* ignore */ }
      toast({ title: "Live captions on", description: "You are broadcasting captions for everyone." });
    } catch {
      setCaptionsEnabled(false);
    }
  }, [captionsEnabled, displayName, effectiveRoomId, emitRoom, isMeeting, localUserId, toast]);

  // ------------------------------------------------------------------
  // Audio output routing — enumerate + apply via the calling client pool.
  // ------------------------------------------------------------------
  const refreshAudioOutputs = useCallback(async () => {
    const devices = await listAudioOutputDevices();
    setAudioOutputs(devices);
  }, []);

  useEffect(() => {
    // Mic permission is already granted inside a call → labels are populated.
    // Re-enumerate when devices connect/disconnect (bluetooth, headsets).
    refreshAudioOutputs();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    md?.addEventListener?.("devicechange", refreshAudioOutputs);
    return () => {
      md?.removeEventListener?.("devicechange", refreshAudioOutputs);
    };
  }, [refreshAudioOutputs]);

  const handleSelectAudioOutput = useCallback(async (deviceId: string) => {
    setSelectedSinkId(deviceId);
    await selectAudioOutput(deviceId); // persists + applies to the element pool
    // Also route via the active client (covers any element it created before
    // this module was loaded / outside the registry).
    clientRef.current?.applyAudioSink?.(deviceId);
  }, []);

  // ------------------------------------------------------------------
  // Derived UI data — stage (pinned / screen share) + filmstrip / grid
  // ------------------------------------------------------------------
  const gridTiles = useMemo<GridTile[]>(() => {
    const tiles: GridTile[] = [];
    tiles.push({ key: "local", kind: "camera", participant: null, name: displayName });
    for (const p of mediaParticipants) {
      tiles.push({ key: `p-${p.id}`, kind: "camera", participant: p });
    }
    // App-level participants that haven't produced media yet (still useful rows)
    for (const ap of appParticipants) {
      if (ap.id === localUserId) continue;
      if (!mediaParticipants.some((m) => m.id === ap.id)) {
        tiles.push({
          key: `ap-${ap.id}`,
          kind: "camera",
          participant: {
            id: ap.id,
            name: ap.name,
            isSpeaking: false,
            audioMuted: !ap.audioEnabled,
            videoMuted: !ap.videoEnabled,
            screenSharing: false,
            audioStream: null,
            videoStream: null,
            screenStream: null,
            connectionQuality: "unknown",
          },
        });
      }
    }
    return tiles;
  }, [appParticipants, displayName, localUserId, mediaParticipants]);

  const remoteScreenTiles = useMemo<GridTile[]>(
    () => mediaParticipants.filter((p) => p.screenSharing && p.screenStream).map((p) => ({ key: `screen-${p.id}`, kind: "screen" as const, participant: p })),
    [mediaParticipants],
  );

  const stageTile = useMemo<GridTile | null>(() => {
    if (remoteScreenTiles.length > 0) return remoteScreenTiles[0];
    if (localScreenStream) return { key: "screen-local", kind: "screen", participant: null, name: "Your screen" };
    if (pinnedKey) {
      const found = gridTiles.find((t) => t.key === pinnedKey);
      if (found) return found;
    }
    return null;
  }, [gridTiles, localScreenStream, pinnedKey, remoteScreenTiles]);

  const stripTiles = useMemo<GridTile[]>(() => {
    if (!stageTile) return [];
    return gridTiles.filter((t) => t.key !== stageTile.key);
  }, [gridTiles, stageTile]);

  const gridCols = useMemo(() => {
    const n = stageTile ? stripTiles.length : gridTiles.length;
    if (n <= 1) return "grid-cols-1";
    if (n <= 2) return "grid-cols-2";
    if (n <= 4) return "grid-cols-2";
    if (n <= 9) return "grid-cols-2 sm:grid-cols-3";
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  }, [gridTiles.length, stageTile, stripTiles.length]);

  const localSpeaking = activeSpeakerId === localUserId && mediaState.audioEnabled;

  /** Head-count used by the top-bar chip (presence list wins over media list). */
  const participantCount = Math.max(appParticipants.length, mediaParticipants.length + 1);

  const providerLabel = isLiveKitCredentials(credentialsRef.current) ? "Metricorex Connect" : "Metricorex Connect";
  void providerLabel;

  const renderCameraTile = (tile: GridTile, opts: { filmstrip?: boolean; stage?: boolean } = {}) => {
    const isPinned = tile.key === pinnedKey && !!stageTile && stageTile.key === tile.key;
    return (
      <ParticipantTile
        key={tile.key}
        participant={tile.participant}
        isLocal={tile.key === "local"}
        localStream={localStream}
        label={tile.name}
        large={!!opts.stage || (!stageTile && gridTiles.length === 1)}
        localMediaState={mediaState}
        localSpeaking={localSpeaking}
        pinned={isPinned}
        onTogglePin={() => setPinnedKey((cur) => (cur === tile.key ? null : tile.key))}
        isRoomAudioOnly={callType === "audio"}
        className={cn(
          opts.filmstrip && "h-full w-[9.5rem] shrink-0 snap-center sm:w-44",
          // Stage keeps a true 16:9 box: portrait derives height from width,
          // landscape derives width from height — never stretched.
          opts.stage && "aspect-video h-auto max-h-full w-full max-w-full sm:h-full sm:w-auto",
          !opts.filmstrip && !opts.stage && gridTiles.length === 1 && "mx-auto aspect-video h-auto max-h-full max-w-3xl self-center",
        )}
      />
    );
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (phase === "joining" || phase === "waiting") {
    return (
      <div className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center gap-6", ROOM_BG)}>
        <BrandLogo />
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-[#60A5FA]" />
          </div>
          <p className="text-lg font-medium text-white">{phase === "waiting" ? "Waiting room" : "Preparing to join…"}</p>
          <p className="max-w-sm text-sm text-white/55">{phaseMessage}</p>
          {phase === "joining" && (
            <Button
              variant="outline"
              className="mt-2 border-white/15 bg-transparent text-white/80 hover:bg-white/10"
              onClick={() => window.location.reload()}
            >
              Having trouble? Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6", ROOM_BG)}>
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-lg font-medium text-white">We couldn't connect you</p>
        <p className="max-w-md text-center text-sm text-white/60">{connectionError || phaseMessage}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-white/15 bg-transparent text-white/80 hover:bg-white/10"
            onClick={async () => {
              // Smart rejoin: refresh credentials first (the backend may hand
              // back working MediaSoup credentials when LiveKit is down) — no
              // full page reload needed.
              setPhaseMessage("Reconnecting…");
              setConnectionError("");
              teardownMediaClient();
              mediaRetryRef.current = 0;
              const fresh = await refreshCredentials();
              const creds = fresh || credentialsRef.current;
              if (!creds) {
                setPhaseMessage("Couldn't refresh credentials — check your connection and try again.");
                return;
              }
              setPhase("connected");
              setConnection("connecting");
              connectMedia(creds);
            }}
          >
            Try again
          </Button>
          <Button className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={onLeave}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6", ROOM_BG)}>
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-lg font-medium text-white">{endedInfo || "You left the meeting"}</p>
        <Button className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={onLeave}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden", ROOM_BG)} style={{ height: "100dvh" }}>
      {/* Top bar */}
      <header className="relative z-20 flex items-center gap-2 border-b border-white/10 bg-[#141B2E]/60 px-2 py-2 backdrop-blur-xl sm:gap-3 sm:px-4">
        <div className="flex items-center gap-2">
          <BrandLogo size={26} showWordmark={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{title || inviteDetails?.title || (isMeeting ? "Meeting" : "Call")}</p>
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <span className={cn("inline-flex items-center gap-1", connection === "connected" ? "text-emerald-400" : connection === "reconnecting" ? "text-amber-400" : "text-white/50")}>
              {connection === "connected" ? <Wifi className="h-3 w-3" /> : connection === "reconnecting" ? <WifiOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
              {connection === "connected" ? "Connected" : connection === "reconnecting" ? "Reconnecting…" : "Connecting…"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatDuration(now - joinedAtRef.current)}
            </span>
            {remainingMs != null && remainingMs > 0 && (
              <span className={cn("inline-flex items-center gap-1", remainingMs < 5 * 60000 ? "text-amber-400" : "")}>
                ends in {formatDuration(remainingMs)}
              </span>
            )}
          </div>
        </div>
        {/* Participant count chip */}
        <span
          className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/70 backdrop-blur sm:inline-flex"
          title={`${participantCount} in this ${isMeeting ? "meeting" : "call"}`}
        >
          <Users className="h-3 w-3" />
          {participantCount}
        </span>
        {recordingActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-1 text-[11px] font-medium text-red-300">
            <Radio className="h-3 w-3 animate-pulse" /> Rec
          </span>
        )}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => setParticipantsOpen((v) => !v)}
            className={cn("relative rounded-lg p-2 text-white/70 hover:bg-white/10", participantsOpen && "bg-white/15 text-white")}
            aria-label="Participants"
          >
            <Users className="h-4 w-4" />
            {isHost && waitingQueue.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-black">
                {waitingQueue.length > 9 ? "9+" : waitingQueue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={minimizeCall}
            className="rounded-lg p-2 text-white/70 hover:bg-white/10"
            aria-label="Minimize call"
            title="Minimize call — it keeps running"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className={cn("hidden rounded-lg p-2 text-white/70 hover:bg-white/10 sm:block", infoOpen && "bg-white/15 text-white")}
            aria-label="Meeting details"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      {echoWarning && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
          This account appears to be in the room on another device — you may hear an echo.
        </div>
      )}
      {connection === "reconnecting" && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
          Connection lost — reconnecting. Your media will resume automatically.
        </div>
      )}

      {/* Main area */}
      <main className="relative min-h-0 flex-1 overflow-hidden p-2 phone-landscape:p-1.5 sm:p-3">
        {stageTile ? (
          <div className="flex h-full w-full flex-col gap-2">
            {/* Stage — always a 16:9 letterboxed box (aspect-ratio CSS) */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              {stageTile.kind === "screen" ? (
                <div className="relative h-full w-full overflow-hidden rounded-2xl border border-indigo-400/40 bg-black">
                  <video
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-contain"
                    ref={(el) => {
                      const stream = stageTile.participant?.screenStream || (stageTile.key === "screen-local" ? localScreenStream : null);
                      if (el && el.srcObject !== stream) el.srcObject = stream || null;
                    }}
                  />
                  <span className="absolute left-3 top-3 rounded-lg bg-indigo-600/80 px-2 py-1 text-xs font-medium text-white">
                    {stageTile.participant ? `${stageTile.participant.name}'s screen` : "Your screen"}
                  </span>
                </div>
              ) : (
                renderCameraTile(stageTile, { stage: true })
              )}
            </div>
            {/* Filmstrip — fixed-height horizontal row, never stretches */}
            {stripTiles.length > 0 && (
              <div className="flex h-24 shrink-0 snap-x gap-2 overflow-x-auto pb-1 custom-scrollbar phone-landscape:h-16 sm:h-28">
                {stripTiles.map((t) => renderCameraTile(t, { filmstrip: true }))}
              </div>
            )}
          </div>
        ) : (
          <div className={cn("grid h-full w-full auto-rows-fr gap-2 sm:gap-3", gridCols)}>
            {remoteScreenTiles.map((t) => (
              <div key={t.key} className="relative col-span-full overflow-hidden rounded-2xl border border-indigo-400/40 bg-black">
                <video
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                  ref={(el) => {
                    const stream = t.participant?.screenStream || null;
                    if (el && el.srcObject !== stream) el.srcObject = stream || null;
                  }}
                />
                <span className="absolute left-3 top-3 rounded-lg bg-indigo-600/80 px-2 py-1 text-xs font-medium text-white">
                  {t.participant ? `${t.participant.name}'s screen` : "Screen share"}
                </span>
              </div>
            ))}
            {localScreenStream && (
              <div className="relative col-span-full overflow-hidden rounded-2xl border border-indigo-400/40 bg-black">
                <video
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                  ref={(el) => {
                    if (el && el.srcObject !== localScreenStream) el.srcObject = localScreenStream;
                  }}
                />
                <span className="absolute left-3 top-3 rounded-lg bg-indigo-600/80 px-2 py-1 text-xs font-medium text-white">Your screen</span>
              </div>
            )}
            {gridTiles.map((t) => renderCameraTile(t))}
          </div>
        )}

        <CaptionsOverlay segments={captionSegments} enabled={captionsEnabled} onHide={() => setCaptionSegments([])} />

        {participantsOpen && (
          <ParticipantsPanel
            appParticipants={appParticipants}
            mediaParticipants={mediaParticipants}
            isHost={isHost}
            identity={localUserId}
            localMediaState={mediaState}
            waitingQueue={waitingQueue}
            onAdmit={admitWaiting}
            onDeny={denyWaiting}
            onAdmitAll={admitAllWaiting}
            onClose={() => setParticipantsOpen(false)}
            onRemoveParticipant={isHost ? removeParticipant : undefined}
            onMuteParticipant={isHost ? muteParticipant : undefined}
          />
        )}
        {chatOpen && (
          <ChatPanel
            messages={chatMessages}
            currentUserId={localUserId}
            onClose={() => setChatOpen(false)}
            onSend={sendChat}
          />
        )}
        {infoOpen && (
          <MeetingInfoPanel
            title={title || inviteDetails?.title || ""}
            inviteDetails={inviteDetails}
            providerLabel={providerLabel}
            startedAt={new Date(joinedAtRef.current).toISOString()}
            onClose={() => setInfoOpen(false)}
            audioOutputs={audioOutputs}
            selectedSinkId={selectedSinkId}
            sinkSupported={sinkSupported}
            onSelectAudioOutput={handleSelectAudioOutput}
          />
        )}
      </main>

      {/* Bottom controls */}
      <footer className="relative z-20 flex w-full items-center justify-center px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1 sm:px-3">
        <ControlBar
          audioEnabled={mediaState.audioEnabled}
          videoEnabled={mediaState.videoEnabled}
          screenSharing={mediaState.screenSharing}
          chatOpen={chatOpen}
          participantsOpen={participantsOpen}
          captionsEnabled={captionsEnabled}
          captionsSupported={captionsSupported}
          unreadChat={unreadChat}
          audioOnlyRoom={callType === "audio"}
          showSwitchCamera={!!mediaState.videoEnabled && !isGuest}
          speakerDevices={audioOutputs}
          selectedSinkId={selectedSinkId}
          sinkSupported={sinkSupported}
          onSelectSpeaker={handleSelectAudioOutput}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={() => {
            setChatOpen((v) => !v);
            setUnreadChat(0);
          }}
          onToggleParticipants={() => setParticipantsOpen((v) => !v)}
          onToggleCaptions={toggleCaptions}
          onMore={() => setInfoOpen(true)}
          onMinimize={minimizeCall}
          onSwitchCamera={switchCamera}
          onLeave={leaveRoom}
          leaveLabel={isHost ? "End" : "Leave"}
        />
      </footer>

      {/* Media-blocked banner */}
      {mediaBlocked && (
        <div className="absolute inset-x-0 bottom-28 z-30 mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0">{mediaBlocked}</span>
          <button
            type="button"
            className="ml-1 flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/90 px-2.5 py-1 font-semibold text-black hover:bg-amber-400"
            onClick={enableBlockedMedia}
          >
            {mediaState.audioEnabled ? <Video className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            Enable
          </button>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1 text-amber-200/70 hover:text-amber-100"
            aria-label="Dismiss"
            onClick={() => setMediaBlocked(null)}
          >
            <MicOff className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CallRoom;
