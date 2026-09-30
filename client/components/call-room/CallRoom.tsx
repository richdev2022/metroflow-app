import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { getSingletonSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api-client";
import { AudioUtils } from "@/lib/audio-utils";
import {
  createCallingClient,
  isLiveKitCredentials,
  type CallingClient,
  type CallingCredentials,
  type ConnectionState,
  type LocalMediaState,
  type RemoteParticipant,
} from "@/lib/calling";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/BrandLogo";
import { AlertCircle, CheckCircle2, Loader2, Radio, Timer, Wifi, WifiOff, Users, MessageSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ParticipantTile } from "./ParticipantTile";
import { ControlBar } from "./ControlBar";
import {
  CaptionsOverlay,
  ChatPanel,
  MeetingInfoPanel,
  ParticipantsPanel,
  type CaptionSegment,
  type RoomAppParticipant,
  type RoomChatMessage,
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

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The Metricorex Call Room.
 *
 * Provider-agnostic: media is owned by a CallingClient (LiveKit or MediaSoup —
 * chosen from the backend's `calling` credentials), while presence, waiting
 * room, chat, captions, duration limits and moderation stay app-level on
 * Socket.IO. Users never see provider names.
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

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([]);
  const [recordingActive, setRecordingActive] = useState(false);
  const [waitingUnadmitted, setWaitingUnadmitted] = useState(false);

  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const clientRef = useRef<CallingClient | null>(null);
  const credentialsRef = useRef<CallingCredentials | null>(calling || null);
  const admittedRef = useRef(false);
  const joinAckedRef = useRef(false);
  const chatPanelOpenRef = useRef(false);
  chatPanelOpenRef.current = chatOpen;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const clientUnsubsRef = useRef<Array<() => void>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionsSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const remainingMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - now) : null;
  const effectiveRoomId = identity;

  const emitRoom = useCallback((event: string, payload: any, ack?: (resp: any) => void) => {
    const socket = getSingletonSocket();
    if (!socket) return;
    if (ack) socket.emit(event, payload, ack);
    else socket.emit(event, payload);
  }, []);

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
      startWithAudio: true,
      startWithVideo: callType !== "audio",
    });
    clientUnsubsRef.current.push(
      client.on("participants", (list) => setMediaParticipants(list)),
      client.on("local:state", setMediaState),
      client.on("local:stream", setLocalStream),
      client.on("local:screen", setLocalScreenStream),
      client.on("connection", (c) => setConnection(c)),
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
      }),
    );
    clientRef.current = client;
    setConnection("connecting");
    client
      .connect()
      .then(() => setPhase((cur) => (cur === "joining" ? "connected" : cur)))
      .catch((err) => {
        console.error("[call-room] media connect failed:", err);
        setConnectionError(String(err?.message || "Unable to connect to the call media server"));
        setPhase("error");
      });
  }, [callType, displayName, effectiveRoomId, getSingletonSocket.length, isHost, localUserId, toast]);

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
        connectMedia(credentialsRef.current);
      },
    );
  }, [callType, connectMedia, displayName, effectiveRoomId, emitRoom, isGuest, isHost, localUserId, prefix]);

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
      [`${prefix}:participant-removed`, (p) => {
        if (p?.userId === localUserId) {
          setEndedInfo("You were removed from this call by the host.");
          setPhase("ended");
        } else if (p?.userId) {
          setMediaParticipants((prev) => prev.filter((x) => x.id !== p.userId));
          setAppParticipants((prev) => prev.filter((x) => x.id !== p.userId));
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
        setCaptionSegments((prev) => {
          const next = [...prev, {
            id: `${c.ts}-${c.speakerId}-${Math.random().toString(36).slice(2, 6)}`,
            speakerId: c.speakerId,
            speakerName: c.speakerName || "Speaker",
            text: c.text,
            ts: c.ts,
            isFinal: c.isFinal !== false,
          }];
          return next.slice(-30);
        });
      }],
      [`recording:started`, () => setRecordingActive(true)],
      [`recording:stopped`, () => setRecordingActive(false)],
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

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      clientUnsubsRef.current.forEach((u) => u());
      clientUnsubsRef.current = [];
      clientRef.current?.disconnect().catch(() => {});
      clientRef.current = null;
      stopLocalRecognition();
      stopRecording(false);
      if (effectiveRoomId && joinAckedRef.current) {
        emitRoom(`${prefix}:leave`, { roomId: effectiveRoomId, userId: localUserId, userName: displayName });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------
  const toggleAudio = useCallback(async () => {
    const next = !mediaState.audioEnabled;
    try {
      await clientRef.current?.setAudioEnabled(next);
      setMediaState((s) => ({ ...s, audioEnabled: next }));
      emitRoom(`${prefix}:participant-media-state`, {
        roomId: effectiveRoomId,
        userId: localUserId,
        audioEnabled: next,
        videoEnabled: mediaState.videoEnabled,
        screenSharing: mediaState.screenSharing,
      });
    } catch {
      toast({ title: "Could not change microphone", description: "Check that a microphone is connected and allowed." });
    }
  }, [effectiveRoomId, emitRoom, localUserId, mediaState, prefix, toast]);

  const toggleVideo = useCallback(async () => {
    const next = !mediaState.videoEnabled;
    try {
      await clientRef.current?.setVideoEnabled(next);
      setMediaState((s) => ({ ...s, videoEnabled: next }));
      emitRoom(`${prefix}:participant-media-state`, {
        roomId: effectiveRoomId,
        userId: localUserId,
        audioEnabled: mediaState.audioEnabled,
        videoEnabled: next,
        screenSharing: mediaState.screenSharing,
      });
    } catch {
      toast({ title: "Could not change camera", description: "Check that a camera is connected and allowed." });
    }
  }, [effectiveRoomId, emitRoom, localUserId, mediaState, prefix, toast]);

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
    clientUnsubsRef.current.forEach((u) => u());
    clientUnsubsRef.current = [];
    clientRef.current?.disconnect().catch(() => {});
    clientRef.current = null;
    stopLocalRecognition();
    stopRecording(true);
    emitRoom(`${prefix}:leave`, { roomId: effectiveRoomId, userId: localUserId, userName: displayName });
    if (isHost) {
      emitRoom(`${prefix}:end`, isMeeting ? { meetingId: effectiveRoomId } : { roomId: effectiveRoomId });
    }
    onLeave();
  }, [displayName, effectiveRoomId, emitRoom, isHost, isMeeting, localUserId, onLeave, prefix]);

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
      stopRecording(true);
      return;
    }
    try {
      const mixed = new MediaStream();
      localStream?.getTracks().forEach((t) => mixed.addTrack(t));
      // Note: this captures the local composition. Server-side recording via
      // LiveKit Egress is planned separately; permission-gated for now.
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
  }, [displayName, effectiveRoomId, emitRoom, isMeeting, localStream, recordingActive, toast]);

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
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Captions not supported", description: "This browser does not support live captions." });
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = String(event.results[i][0].transcript || "").trim();
          if (text) {
            emitRoom("caption:segment", {
              roomId: effectiveRoomId,
              roomType: isMeeting ? "meeting" : "call",
              text,
              isFinal: true,
              language: recognition.lang,
            });
          }
        }
      }
    };
    recognition.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        toast({ title: "Captions blocked", description: "Grant microphone access to use live captions." });
        stopLocalRecognition();
        setCaptionsEnabled(false);
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
      toast({ title: "Live captions on", description: "You are broadcasting captions for everyone." });
    } catch {
      setCaptionsEnabled(false);
    }
  }, [captionsEnabled, effectiveRoomId, emitRoom, isMeeting, toast]);

  // ------------------------------------------------------------------
  // Derived UI data
  // ------------------------------------------------------------------
  const gridTiles = useMemo(() => {
    const remoteScreenSharers = mediaParticipants.filter((p) => p.screenSharing && p.screenStream);
    const tiles: Array<{ key: string; kind: "screen" | "camera"; participant: RemoteParticipant | null; name?: string }> = [];
    for (const p of remoteScreenSharers) {
      tiles.push({ key: `screen-${p.id}`, kind: "screen", participant: p });
    }
    if (localScreenStream) {
      tiles.push({ key: "screen-local", kind: "screen", participant: null, name: "Your screen" });
    }
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
  }, [appParticipants, displayName, localScreenStream, localUserId, mediaParticipants]);

  const gridCols = useMemo(() => {
    const n = gridTiles.length;
    if (n <= 1) return "grid-cols-1";
    if (n <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (n <= 4) return "grid-cols-1 sm:grid-cols-2";
    if (n <= 9) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  }, [gridTiles.length]);

  const providerLabel = isLiveKitCredentials(credentialsRef.current) ? "Metricorex Connect" : "Metricorex Connect";
  void providerLabel;

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
          <Button variant="outline" className="border-white/15 bg-transparent text-white/80 hover:bg-white/10" onClick={() => window.location.reload()}>
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
    <div className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden", ROOM_BG)}>
      {/* Top bar */}
      <header className="relative z-20 flex items-center gap-3 border-b border-white/10 bg-[#141B2E]/60 px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-2">
          <BrandLogo />
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
        {recordingActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-1 text-[11px] font-medium text-red-300">
            <Radio className="h-3 w-3 animate-pulse" /> Rec
          </span>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setParticipantsOpen((v) => !v)}
            className={cn("rounded-lg p-2 text-white/70 hover:bg-white/10", participantsOpen && "bg-white/15 text-white")}
            aria-label="Participants"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setInfoOpen((v) => !v);
            }}
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
      <main className="relative flex-1 overflow-hidden p-3 sm:p-4">
        <div className={cn("grid h-full w-full auto-rows-fr gap-3", gridCols)}>
          {gridTiles.map((tile) =>
            tile.kind === "screen" ? (
              <div key={tile.key} className="relative col-span-full overflow-hidden rounded-2xl border border-indigo-400/40 bg-black sm:col-span-2 md:col-span-3">
                <video
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                  ref={(el) => {
                    const stream = tile.participant?.screenStream || (tile.key === "screen-local" ? localScreenStream : null);
                    if (el && el.srcObject !== stream) el.srcObject = stream || null;
                  }}
                />
                <span className="absolute left-3 top-3 rounded-lg bg-indigo-600/80 px-2 py-1 text-xs font-medium text-white">
                  {tile.participant ? `${tile.participant.name}'s screen` : "Your screen"}
                </span>
              </div>
            ) : (
              <ParticipantTile
                key={tile.key}
                participant={tile.participant}
                isLocal={tile.key === "local"}
                localStream={localStream}
                label={tile.name}
                large={gridTiles.length === 1}
                isRoomAudioOnly={callType === "audio"}
                className={cn(gridTiles.length === 1 && "mx-auto aspect-video h-auto max-h-full max-w-3xl self-center")}
              />
            ),
          )}
        </div>

        <CaptionsOverlay segments={captionSegments} enabled={captionsEnabled} />

        {participantsOpen && (
          <ParticipantsPanel
            appParticipants={appParticipants}
            mediaParticipants={mediaParticipants}
            isHost={isHost}
            identity={localUserId}
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
          />
        )}
      </main>

      {/* Bottom controls */}
      <footer className="relative z-20 flex items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        <ControlBar
          audioEnabled={mediaState.audioEnabled}
          videoEnabled={mediaState.videoEnabled}
          screenSharing={mediaState.screenSharing}
          chatOpen={chatOpen}
          participantsOpen={participantsOpen}
          captionsEnabled={captionsEnabled}
          captionsSupported={captionsSupported}
          unreadChat={unreadChat}
          compactMode={typeof window !== "undefined" && window.innerWidth < 640}
          audioOnlyRoom={callType === "audio"}
          showSwitchCamera={false}
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
          onLeave={leaveRoom}
          leaveLabel={isHost ? "End meeting" : "Leave"}
        />
      </footer>

      {/* Media-blocked banner */}
      {mediaBlocked && (
        <div className="absolute inset-x-0 bottom-24 z-30 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {mediaBlocked}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => setMediaBlocked(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default CallRoom;
