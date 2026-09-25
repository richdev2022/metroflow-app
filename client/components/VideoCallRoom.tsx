import { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, Wifi, WifiOff, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { AudioUtils } from '@/lib/audio-utils';
import { getSingletonSocket } from '@/hooks/useSocket';
import { useMediasoupRoom } from '@/components/call/useMediasoupRoom';
import { VideoTile } from '@/components/call/VideoTile';
import { ControlBar } from '@/components/call/ControlBar';
import { SidePanel, PanelTab, PanelParticipant, PanelChatMessage } from '@/components/call/SidePanel';
import { useSocket } from '@/hooks/useSocket';
import { TeamMember } from '@shared/api';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';

/**
 * VideoCallRoom — modern Google-Meet-style room
 * ---------------------------------------------
 * Rewritten from the ground up (2026 revamp):
 *  - SFU media via useMediasoupRoom (proper getProducers discovery, resume
 *    flow, producer close handling, simulcast webcam)
 *  - Adaptive spotlight grid + screen-share filmstrip layout
 *  - Slide-over People / Chat / Info panels
 *  - Waiting-room host controls, duration countdown, recording indicator
 *  - Guest badge support
 */

interface VideoCallRoomProps {
  roomId?: string;
  onLeave: () => void;
  userName?: string;
  isHost?: boolean;
  waitingRoomEnabled?: boolean;
  meetingId?: string;
  callId?: string;
  callType?: 'audio' | 'video';
  teamMembers?: TeamMember[];
  currentParticipantIds?: string[];
  onParticipantsAdded?: (participantIds: string[]) => void;
  onParticipantStatusChange?: (payload: { userId: string; status: 'invited' | 'joined' | 'left' }) => void;
  initialParticipants?: Array<{
    userId: string;
    status: 'invited' | 'joined' | 'left';
    joinedAt?: string;
    leftAt?: string;
  }>;
}

interface RoomParticipant {
  id: string;
  name: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing?: boolean;
  isGuest?: boolean;
}

interface WaitingEntry {
  participantId: string;
  userName: string;
  isGuest?: boolean;
}

export function VideoCallRoom({
  roomId,
  onLeave,
  userName,
  isHost = false,
  waitingRoomEnabled = false,
  meetingId,
  callId,
  callType = 'video',
  teamMembers = [],
}: VideoCallRoomProps) {
  const resolvedRoomId = meetingId || callId || roomId || '';
  const useMeetingJoin = !!meetingId;
  const audioOnly = callType === 'audio' && !meetingId;
  const myUserId = localStorage.getItem('userId') || '';
  const isGuestUser = myUserId.startsWith('guest-') || !myUserId;
  const myName = userName || localStorage.getItem('userName') || 'You';

  // ------------------------------------------------------------- socket
  // Guests get a pseudo identity so the singleton can be created.
  const socketUserId = isGuestUser ? `guest-local` : myUserId;
  const socketState = useSocket({
    userId: socketUserId,
    businessId: localStorage.getItem('businessId') || 'guest',
    userName: myName,
  });
  const socket: Socket | null = socketState.socket ?? getSingletonSocket();

  // ------------------------------------------------------------- mediasoup
  const media = useMediasoupRoom({
    socket,
    socketRoomId: resolvedRoomId,
    displayName: myName,
    isGuest: isGuestUser,
    audioEnabled: true,
    videoEnabled: callType === 'video' || !!meetingId,
    useMeetingJoin,
    audioOnly,
    onEnded: () => {
      toast.info('The host ended this call');
      media.leave();
      onLeave();
    },
  });

  useEffect(() => {
    // Auto-join when socket is available
    if (socket?.connected && !media.joined && !media.error) {
      void media.join();
    }
  }, [socket?.connected, media.joined]);

  // ------------------------------------------------------------- room state
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingEntry[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('people');
  const [chatMessages, setChatMessages] = useState<PanelChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === 'video' || !!meetingId);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [durationEndsAt, setDurationEndsAt] = useState<Date | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [countdownMessage, setCountdownMessage] = useState<string | null>(null);

  // ------------------------------------------------------------- socket events
  useEffect(() => {
    if (!socket) return;
    const prefix = useMeetingJoin ? 'meeting' : 'call';

    const onParticipantsList = (payload: any) => {
      const list: RoomParticipant[] = (payload.participants || []).map((p: any) => ({
        id: p.id,
        name: p.name || 'Guest',
        isHost: !!p.isHost,
        audioEnabled: p.audioEnabled !== false,
        videoEnabled: p.videoEnabled !== false,
        screenSharing: !!p.screenSharing,
        isGuest: !!p.isGuest || String(p.id || '').startsWith('guest-'),
      }));
      setParticipants(list);
    };
    const onParticipantJoined = (payload: any) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.id === payload.userId)) return prev;
        return [
          ...prev,
          {
            id: payload.userId,
            name: payload.userName || 'Guest',
            isHost: !!payload.isHost,
            audioEnabled: true,
            videoEnabled: true,
            isGuest: !!payload.isGuest || String(payload.userId || '').startsWith('guest-'),
          },
        ];
      });
      if (payload.userId !== myUserId) {
        AudioUtils.playNotification().catch(() => undefined);
        toast.success(`${payload.userName || 'Someone'} joined`, { duration: 2500 });
      }
    };
    const onParticipantLeft = (payload: any) => {
      setParticipants((prev) => prev.filter((p) => p.id !== payload.userId));
      if (payload.userId !== myUserId && payload.userName) {
        toast(`${payload.userName} left`, { duration: 2000 });
      }
    };
    const onMediaState = (payload: any) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId
            ? {
                ...p,
                audioEnabled: payload.audioEnabled ?? p.audioEnabled,
                videoEnabled: payload.videoEnabled ?? p.videoEnabled,
                screenSharing: payload.screenSharing ?? p.screenSharing,
              }
            : p,
        ),
      );
    };
    const onChatMessage = (payload: any) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          userId: payload.userId,
          userName: payload.userName || payload.peerName || 'Guest',
          message: payload.message,
          timestamp: payload.timestamp || new Date().toISOString(),
        },
      ]);
      setUnreadChat((n) => n + 1);
      AudioUtils.playMessageReceived().catch(() => undefined);
    };
    const onWaitingPending = (payload: any) => {
      setWaitingQueue((prev) => {
        if (prev.some((w) => w.participantId === payload.participantId)) return prev;
        return [...prev, { participantId: payload.participantId, userName: payload.userName, isGuest: payload.isGuest }];
      });
      AudioUtils.playNotification().catch(() => undefined);
      toast.info(`${payload.userName} is waiting to join`, { duration: 5000 });
    };
    const onWaitingQueue = (payload: any) => {
      setWaitingQueue(payload.queue || []);
    };
    const onDurationStarted = (payload: any) => {
      if (payload.endsAt) setDurationEndsAt(new Date(payload.endsAt));
    };
    const onDurationActive = (payload: any) => {
      if (payload.endsAt) setDurationEndsAt(new Date(payload.endsAt));
      if (typeof payload.remainingMs === 'number') setRemainingMs(payload.remainingMs);
    };
    const onCountdownWarning = (payload: any) => {
      setCountdownMessage(payload.message || 'Time is running out');
      AudioUtils.playNotification().catch(() => undefined);
      setTimeout(() => setCountdownMessage(null), 10000);
    };
    const onRecordingStarted = () => setRecording(true);
    const onRecordingStopped = () => setRecording(false);
    const onScreenShareStarted = (payload: any) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === payload.userId ? { ...p, screenSharing: true } : p)),
      );
    };
    const onScreenShareStopped = (payload: any) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === payload.userId ? { ...p, screenSharing: false } : p)),
      );
    };

    socket.on(`${prefix}:participants-list`, onParticipantsList);
    socket.on(`${prefix}:participant-joined`, onParticipantJoined);
    socket.on(`${prefix}:participant-left`, onParticipantLeft);
    socket.on('call:participant-media-state', onMediaState);
    socket.on('meeting-chat:message', onChatMessage);
    socket.on('waiting-room:pending', onWaitingPending);
    socket.on('waiting-room:queue', onWaitingQueue);
    socket.on(`${prefix}:duration-started`, onDurationStarted);
    socket.on(`${prefix}:duration-active`, onDurationActive);
    socket.on(`${prefix}:countdown-warning`, onCountdownWarning);
    socket.on('recording:started', onRecordingStarted);
    socket.on('recording:stopped', onRecordingStopped);
    socket.on('screen-share:started', onScreenShareStarted);
    socket.on('screen-share:stopped', onScreenShareStopped);

    // Ask for current state
    socket.emit('call:get-participants', { roomId: resolvedRoomId });
    socket.emit('waiting-room:get-queue', { roomId: resolvedRoomId });

    return () => {
      socket.off(`${prefix}:participants-list`, onParticipantsList);
      socket.off(`${prefix}:participant-joined`, onParticipantJoined);
      socket.off(`${prefix}:participant-left`, onParticipantLeft);
      socket.off('call:participant-media-state', onMediaState);
      socket.off('meeting-chat:message', onChatMessage);
      socket.off('waiting-room:pending', onWaitingPending);
      socket.off('waiting-room:queue', onWaitingQueue);
      socket.off(`${prefix}:duration-started`, onDurationStarted);
      socket.off(`${prefix}:duration-active`, onDurationActive);
      socket.off(`${prefix}:countdown-warning`, onCountdownWarning);
      socket.off('recording:started', onRecordingStarted);
      socket.off('recording:stopped', onRecordingStopped);
      socket.off('screen-share:started', onScreenShareStarted);
      socket.off('screen-share:stopped', onScreenShareStopped);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, useMeetingJoin, resolvedRoomId, myUserId]);

  // duration ticker
  useEffect(() => {
    if (!durationEndsAt) return;
    const tick = () => setRemainingMs(Math.max(0, durationEndsAt.getTime() - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [durationEndsAt]);

  // ------------------------------------------------------------- actions
  const handleToggleMic = useCallback(() => {
    const enabled = media.toggleMic();
    setMicOn(enabled);
    const s = getSingletonSocket();
    s?.emit('call:participant-media-state', {
      roomId: resolvedRoomId,
      userId: myUserId || socketUserId,
      audioEnabled: enabled,
      videoEnabled: camOn,
      screenSharing,
    });
  }, [media, resolvedRoomId, myUserId, socketUserId, camOn, screenSharing]);

  const handleToggleCam = useCallback(async () => {
    const enabled = await media.toggleCam();
    setCamOn(enabled);
    const s = getSingletonSocket();
    s?.emit('call:participant-media-state', {
      roomId: resolvedRoomId,
      userId: myUserId || socketUserId,
      audioEnabled: micOn,
      videoEnabled: enabled,
      screenSharing,
    });
  }, [media, resolvedRoomId, myUserId, socketUserId, micOn, screenSharing]);

  const handleToggleScreen = useCallback(async () => {
    if (screenSharing) {
      await media.stopScreenShare();
      setScreenSharing(false);
      const s = getSingletonSocket();
      s?.emit(useMeetingJoin ? 'screen-share:stop' : 'screen-share:stop',
        useMeetingJoin ? { meetingId: resolvedRoomId } : { callId: resolvedRoomId });
    } else {
      const ok = await media.startScreenShare();
      if (ok) {
        setScreenSharing(true);
        const s = getSingletonSocket();
        s?.emit('screen-share:start',
          useMeetingJoin ? { meetingId: resolvedRoomId } : { callId: resolvedRoomId });
      }
    }
  }, [media, screenSharing, useMeetingJoin, resolvedRoomId]);

  const handleLeave = useCallback(() => {
    media.leave();
    onLeave();
  }, [media, onLeave]);

  const handleSendChat = useCallback((text: string) => {
    const s = getSingletonSocket();
    s?.emit('meeting-chat:message', {
      meetingId: useMeetingJoin ? resolvedRoomId : undefined,
      callId: useMeetingJoin ? undefined : resolvedRoomId,
      userId: myUserId || socketUserId,
      userName: myName,
      message: text,
    });
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-local`,
        userId: myUserId || socketUserId,
        userName: myName,
        message: text,
        timestamp: new Date().toISOString(),
        isLocal: true,
      },
    ]);
  }, [resolvedRoomId, useMeetingJoin, myUserId, socketUserId, myName]);

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin;
    return meetingId
      ? `${base}/meetings/${roomId || meetingId}`
      : `${base}/calls/${roomId || callId}`;
  }, [meetingId, roomId, callId]);

  const handleCopyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  }, [inviteLink]);

  const handleAdmit = useCallback((participantId: string) => {
    const s = getSingletonSocket();
    s?.emit(useMeetingJoin ? 'waiting-room:admit' : 'waiting-room:admit', {
      roomId: resolvedRoomId,
      meetingId: resolvedRoomId,
      participantId,
    });
    setWaitingQueue((prev) => prev.filter((w) => w.participantId !== participantId));
  }, [resolvedRoomId, useMeetingJoin]);

  const handleDeny = useCallback((participantId: string) => {
    const s = getSingletonSocket();
    s?.emit('waiting-room:deny', {
      roomId: resolvedRoomId,
      meetingId: resolvedRoomId,
      participantId,
    });
    setWaitingQueue((prev) => prev.filter((w) => w.participantId !== participantId));
  }, [resolvedRoomId]);

  const handleAdmitAll = useCallback(() => {
    const s = getSingletonSocket();
    s?.emit('waiting-room:admit-all', {
      roomId: resolvedRoomId,
      meetingId: resolvedRoomId,
    });
    setWaitingQueue([]);
  }, [resolvedRoomId]);

  const handleRecordingToggle = useCallback(() => {
    const s = getSingletonSocket();
    if (!recording) {
      s?.emit('recording:start', useMeetingJoin ? { meetingId: resolvedRoomId } : { callId: resolvedRoomId });
      setRecording(true);
      toast.info('Recording started (broadcast to all participants)');
    } else {
      s?.emit('recording:stop', useMeetingJoin ? { meetingId: resolvedRoomId } : { callId: resolvedRoomId });
      setRecording(false);
      toast.info('Recording stopped');
    }
  }, [recording, resolvedRoomId, useMeetingJoin]);

  // ------------------------------------------------------------- layout data
  const remoteCamStreams = media.remoteStreams.filter((r) => r.source === 'webcam');
  const remoteScreenStream = media.remoteStreams.find((r) => r.source === 'screen');
  const activeScreen = media.screenStream
    ? { peerId: myUserId || socketUserId, stream: media.screenStream, isLocal: true }
    : remoteScreenStream
      ? { peerId: remoteScreenStream.peerId, stream: remoteScreenStream.stream, isLocal: false }
      : null;

  const nameForPeer = useCallback(
    (peerId: string) => participants.find((p) => p.id === peerId)?.name || peerId.slice(0, 8),
    [participants],
  );

  const fmtRemaining = (ms: number) => {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const s = Math.floor((ms % 60000) / 1000);
    return h > 0 ? `${h}h ${m}m` : m >= 1 || s > 20 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };

  const panelParticipants: PanelParticipant[] = [
    {
      id: myUserId || socketUserId,
      name: myName,
      isHost,
      isGuest: isGuestUser,
      isLocal: true,
      audioEnabled: micOn,
      videoEnabled: camOn,
    },
    ...participants
      .filter((p) => p.id !== (myUserId || socketUserId))
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isGuest: p.isGuest,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled,
      })),
  ];

  // media error notice (non-fatal)
  useEffect(() => {
    if (media.error) toast.warning(media.error, { duration: 6000 });
  }, [media.error]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#111221]">
      {/* top status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
            {socketState.isConnected || socket?.connected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span className="font-mono">{roomId || resolvedRoomId.slice(0, 8)}</span>
          </div>
          {recording && (
            <div className="flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 backdrop-blur">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> Recording
            </div>
          )}
          {isHost && (
            <button
              onClick={handleRecordingToggle}
              className="pointer-events-auto hidden rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur transition hover:bg-black/60 sm:block"
            >
              {recording ? 'Stop recording' : 'Record'}
            </button>
          )}
        </div>
        {remainingMs !== null && remainingMs > 0 && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur">
            <Clock className="h-3.5 w-3.5" /> {fmtRemaining(remainingMs)} left
          </div>
        )}
      </div>

      {countdownMessage && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 backdrop-blur">
          {countdownMessage}
        </div>
      )}

      {/* main video area */}
      <div className={cn('relative flex-1 overflow-hidden p-3 pt-14', panelOpen && 'sm:pr-[348px]')}>
        {/* host waiting-room queue */}
        {isHost && waitingQueue.length > 0 && (
          <div className="absolute left-1/2 top-16 z-30 w-[320px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#181926]/98 p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                {waitingQueue.length} waiting to join
              </p>
              <button onClick={handleAdmitAll} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                Admit all
              </button>
            </div>
            <div className="space-y-1.5">
              {waitingQueue.map((w) => (
                <div key={w.participantId} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-white/85">
                    {w.userName} {w.isGuest && <span className="text-[10px] text-white/45">Guest</span>}
                  </span>
                  <button
                    onClick={() => handleAdmit(w.participantId)}
                    className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600"
                  >
                    Admit
                  </button>
                  <button
                    onClick={() => handleDeny(w.participantId)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 hover:bg-rose-500"
                  >
                    Deny
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeScreen ? (
          /* spotlight layout with filmstrip */
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">
              {activeScreen.isLocal ? (
                <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(el) => {
                      if (el && el.srcObject !== activeScreen.stream) {
                        el.srcObject = activeScreen.stream;
                        el.play().catch(() => undefined);
                      }
                    }}
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
                    You are presenting
                  </div>
                </div>
              ) : (
                <VideoTile
                  stream={activeScreen.stream}
                  name={nameForPeer(activeScreen.peerId)}
                  isScreenShare
                  className="h-full w-full"
                />
              )}
            </div>
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
              <VideoTile
                stream={media.localStream}
                name={myName}
                isLocal
                mirrored
                audioEnabled={micOn}
                videoAvailable={camOn}
                className="h-24 w-40 shrink-0"
              />
              {remoteCamStreams.map((r) => (
                <VideoTile
                  key={r.consumerId}
                  stream={r.stream}
                  name={nameForPeer(r.peerId)}
                  audioEnabled
                  videoAvailable
                  className="h-24 w-40 shrink-0"
                />
              ))}
            </div>
          </div>
        ) : (
          /* adaptive grid */
          <Grid
            tiles={[
              <VideoTile
                key="local"
                stream={media.localStream}
                name={myName}
                isLocal
                mirrored
                audioEnabled={micOn}
                videoAvailable={camOn}
                className="h-full w-full"
              />,
              ...remoteCamStreams.map((r) => (
                <VideoTile
                  key={r.consumerId}
                  stream={r.stream}
                  name={nameForPeer(r.peerId)}
                  isPinned={pinnedPeerId === r.peerId}
                  onPin={() => setPinnedPeerId((p) => (p === r.peerId ? null : r.peerId))}
                  audioEnabled
                  videoAvailable
                  className="h-full w-full"
                />
              )),
              ...remoteCamStreams.length === 0 && audioOnly
                ? []
                : [],
            ]}
          />
        )}

        {/* side panel */}
        <SidePanel
          open={panelOpen}
          tab={panelTab}
          onTabChange={(t) => {
            setPanelTab(t);
            if (t === 'chat') setUnreadChat(0);
          }}
          onClose={() => setPanelOpen(false)}
          meetingTitle={useMeetingJoin ? 'Team meeting' : 'Team call'}
          meetingCode={roomId || resolvedRoomId.slice(0, 8).toUpperCase()}
          inviteLink={inviteLink}
          participants={panelParticipants}
          messages={chatMessages}
          localUserId={myUserId || socketUserId}
          onSendMessage={handleSendChat}
          onCopyInvite={handleCopyInvite}
        />
      </div>

      {/* control bar */}
      <div className="relative z-20 flex justify-center px-4 pb-4">
        <ControlBar
          micOn={micOn}
          camOn={camOn}
          screenSharing={screenSharing}
          chatOpen={panelOpen && panelTab === 'chat'}
          peopleOpen={panelOpen && panelTab === 'people'}
          infoOpen={panelOpen && panelTab === 'info'}
          handRaised={handRaised}
          unreadChatCount={unreadChat}
          participantCount={panelParticipants.length}
          audioOnly={audioOnly}
          onToggleMic={handleToggleMic}
          onToggleCam={() => void handleToggleCam()}
          onToggleScreen={() => void handleToggleScreen()}
          onToggleChat={() => {
            setPanelOpen((o) => !(o && panelTab === 'chat'));
            setPanelTab('chat');
            setUnreadChat(0);
          }}
          onTogglePeople={() => {
            setPanelOpen((o) => !(o && panelTab === 'people'));
            setPanelTab('people');
          }}
          onToggleInfo={() => {
            setPanelOpen((o) => !(o && panelTab === 'info'));
            setPanelTab('info');
          }}
          onToggleHand={() => {
            setHandRaised((h) => !h);
            if (!handRaised) toast.success('Hand raised');
          }}
          onInvite={handleCopyInvite}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}

/** Simple adaptive grid: arranges tiles nicely for any count */
function Grid({ tiles }: { tiles: React.ReactNode[] }) {
  const count = Math.max(1, tiles.length);
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  return (
    <div
      className="grid h-full w-full place-items-center gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: '1fr',
      }}
    >
      {tiles}
    </div>
  );
}

export default VideoCallRoom;
