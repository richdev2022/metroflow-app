import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Device, types } from 'mediasoup-client';
import { useSocket } from '../hooks/useSocket';
import { Button } from './ui/button';
import { api } from '../lib/api-client';
import { unwrapApiData, getApiMessage } from '../lib/api-response';
import { AudioUtils } from '../lib/audio-utils';
import { useSearchParams } from 'react-router-dom';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  Radio,
  ScreenShare,
  ScreenShareOff,
  MessageSquare,
  UserPlus,
  Users,
  Video,
  VideoOff,
  X,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  BellRing,
  Timer,
  Copy,
} from 'lucide-react';
import type { Recording, TeamMember } from '@shared/api';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useToast } from './ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { AddParticipantsModal } from './AddParticipantsModal';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type ParticipantStatus = 'invited' | 'joined' | 'left';

type DurationState =
  | { status: 'idle' }
  | { status: 'waiting'; maxMeetingDurationMinutes: number | null }
  | { status: 'running'; endsAt: Date; maxMeetingDurationMinutes: number | null };

interface CountdownDisplay {
  totalMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  percentUsed: number;
  isWarning: boolean;
  isUrgent: boolean;
}

interface VideoCallRoomProps {
  roomId?: string; // Made optional to allow extraction from URL
  onLeave: () => void;
  userName?: string; // Made optional
  isHost?: boolean; // Made optional
  waitingRoomEnabled?: boolean; // Made optional
  meetingId?: string;
  callId?: string;
  callType?: 'audio' | 'video';
  teamMembers?: TeamMember[];
  currentParticipantIds?: string[];
  onParticipantsAdded?: (participantIds: string[]) => void;
  onParticipantStatusChange?: (payload: { userId: string; status: ParticipantStatus }) => void;
  initialParticipants?: Array<{
    userId: string;
    status: 'invited' | 'joined' | 'left';
    joinedAt?: string;
    leftAt?: string;
  }>;
  /** Info used to build the "Copy invite details" text (code/link/password) */
  inviteDetails?: {
    title?: string;
    code?: string;
    password?: string | null;
    waitingRoomEnabled?: boolean;
    startTime?: string;
  } | null;
}

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: Date;
  leftAt?: Date;
  status: ParticipantStatus;
  isLocal?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
  isTalking?: boolean;
}

interface Peer {
  id: string;
  producers: Array<{ producerId: string; kind: types.MediaKind; appData?: Record<string, any> }>;
  name?: string;
  isTalking?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
}

const createPeer = (id: string, name?: string): Peer => ({
  id,
  producers: [],
  name,
});

export default function VideoCallRoom({
  roomId: propRoomId,
  onLeave,
  userName: propUserName,
  isHost: propIsHost,
  waitingRoomEnabled: propWaitingRoomEnabled = false,
  meetingId,
  callId,
  callType = 'video',
  teamMembers = [],
  currentParticipantIds = [],
  onParticipantsAdded,
  onParticipantStatusChange,
  initialParticipants = [],
  inviteDetails = null,
}: VideoCallRoomProps) {
  // Get search params from URL for invitation flow
  const [searchParams] = useSearchParams();
  
  // Extract room info from URL params or props
  const roomId = propRoomId || searchParams.get('roomId') || '';
  const userName = propUserName || searchParams.get('userName') || localStorage.getItem('userName') || 'Guest';
  const isHost = propIsHost ?? searchParams.get('isHost') === 'true';
  const waitingRoomEnabled = propWaitingRoomEnabled ?? searchParams.get('waitingRoom') === 'true';
  const invitationToken = searchParams.get('token');
  
  // Invitation state
  const [isVerifyingInvitation, setIsVerifyingInvitation] = useState(!!invitationToken);
  const [invitationError, setInvitationError] = useState('');
  
  // Participants state
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  // Media state
  const [device, setDevice] = useState<Device | null>(null);
  const [sendTransport, setSendTransport] = useState<types.Transport | null>(null);
  const [recvTransport, setRecvTransport] = useState<types.Transport | null>(null);
  const [localAudioProducer, setLocalAudioProducer] = useState<types.Producer | null>(null);
  const [localVideoProducer, setLocalVideoProducer] = useState<types.Producer | null>(null);
  const [localScreenProducer, setLocalScreenProducer] = useState<types.Producer | null>(null);
  const [consumers, setConsumers] = useState<Map<string, types.Consumer>>(new Map());
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());

  // UI state
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isScreenShareExpanded, setIsScreenShareExpanded] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  
  // Call duration state (per FRONTEND_CALL_DURATION_GUIDE.md §4/§5 state machine)
  const [durationState, setDurationState] = useState<DurationState>({ status: 'idle' });
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [showOneMinuteBanner, setShowOneMinuteBanner] = useState(false);
  const warned5Ref = useRef(false);
  const warned1Ref = useRef(false);
  const teardownArmedAtRef = useRef<number | null>(null);
  // Legacy kept for reference (set from participants-list to mirror durationState)
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [maxMeetingDuration, setMaxMeetingDuration] = useState<number | null>(null);
  // For back-compat we still compute a pretty remaining label
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const countdownIntervalRef = useRef<number | null>(null);

  // Room state
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(!isHost && waitingRoomEnabled);
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [waitingQueue, setWaitingQueue] = useState<Array<{ userId: string; userName?: string; requestedAt?: number }>>([]);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [echoWarningShown, setEchoWarningShown] = useState(false);
  const [multiDeviceAlert, setMultiDeviceAlert] = useState<{ message: string; deviceCount: number } | null>(null);
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [showAudioEnableOverlay, setShowAudioEnableOverlay] = useState(false);
  const [audioAutoplayFailCount, setAudioAutoplayFailCount] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLocalTalking, setIsLocalTalking] = useState(false);

  // Participant invitation state
  const [showAddParticipantsModal, setShowAddParticipantsModal] = useState(false);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteAudioGainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const remoteAudioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const lastLocalTalkingRef = useRef(false);
  const audioEnabledRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastMuteWarning = useRef<number>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // FIX: Refs for values needed in socket callbacks
  const recvTransportRef = useRef<types.Transport | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const consumersMapRef = useRef<Map<string, types.Consumer>>(new Map());
  const isMountedRef = useRef(true);
  const hasFetchedProducers = useRef(false);
  const hasJoinedRef = useRef(false);
  const hasJoinedRestRef = useRef(false);
  const dialBackCooldownRef = useRef<Map<string, number>>(new Map());
  const leaveCallRef = useRef<(() => Promise<void>) | null>(null);
  
  const { socket, isConnected, joinMeeting, joinCall, leaveCall: emitSocketLeaveCall, leaveMeeting, startScreenShare: emitScreenShareStart, stopScreenShare: emitScreenShareStop, startRecording: emitRecordingStart, stopRecording: emitRecordingStop, sendMeetingChat, inviteToCall } = useSocket({
    userId: localStorage.getItem('userId') || '',
    businessId: localStorage.getItem('businessId') || '',
  });

  const { toast } = useToast();

  // Socket room ID: prefer UUID (callId/meetingId) per FRONTEND_CALL_DURATION_GUIDE.md §8, fallback to URL roomId/callCode
  const socketRoomId = meetingId || callId || roomId;
  // Event prefix: 'meeting:' for meetings, 'call:' otherwise
  const eventPrefix = meetingId ? 'meeting' : 'call';
  // Room ID key name in socket payloads (some events use meetingId vs roomId)
  const roomKeyForEnded = meetingId ? 'meetingId' : 'callId';

  // Keep refs in sync with state
  useEffect(() => { deviceRef.current = device; }, [device]);
  useEffect(() => { recvTransportRef.current = recvTransport; }, [recvTransport]);
  useEffect(() => { consumersMapRef.current = consumers; }, [consumers]);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Show error if no room ID
  useEffect(() => {
    if (!roomId && !isVerifyingInvitation) {
      setConnectionError('No room ID provided. Please use a valid invitation link.');
    }
  }, [roomId, isVerifyingInvitation]);

  // Verify invitation token if present
  useEffect(() => {
    if (!invitationToken || !roomId || !socket || !isConnected) return;
    
    setIsVerifyingInvitation(true);
    
    // Verify the invitation token with the server
    socket.emit('invitation:verify', { token: invitationToken, roomId }, (response: any) => {
      if (!isMountedRef.current) return;
      
      setIsVerifyingInvitation(false);
      
      if (response?.error || !response?.valid) {
        setInvitationError(response?.error || 'Invalid or expired invitation link. Please request a new invitation.');
        return;
      }
      
      // If valid, we'll join the room in the join effect below
      console.log('Invitation verified successfully for room:', roomId);
    });
  }, [invitationToken, roomId, socket, isConnected]);

  const initialParticipantsRef = useRef(initialParticipants);
  useEffect(() => {
    initialParticipantsRef.current = initialParticipants;
    if (initialParticipants.length === 0) return;
    setParticipants(prev => {
      const byId = new Map(prev.map(p => [p.id, p]));
      initialParticipants.forEach(apiP => {
        const memberName = teamMembers?.find(m => m.id === apiP.userId)?.name;
        const name = memberName || apiP.userId;
        const existing = byId.get(apiP.userId);
        byId.set(apiP.userId, {
          id: apiP.userId,
          name: existing?.name || name,
          isHost: existing?.isHost || false,
          joinedAt: existing?.joinedAt || (apiP.joinedAt ? new Date(apiP.joinedAt) : new Date()),
          leftAt: apiP.leftAt ? new Date(apiP.leftAt) : undefined,
          status: apiP.status || (existing?.status ?? 'joined'),
          audioEnabled: existing?.audioEnabled ?? (apiP.status === 'joined' ? undefined : false),
          videoEnabled: existing?.videoEnabled ?? (apiP.status === 'joined' ? undefined : false),
          screenSharing: existing?.screenSharing ?? false,
          isTalking: existing?.isTalking ?? false,
          isLocal: existing?.isLocal,
        });
      });
      return Array.from(byId.values());
    });
  }, [initialParticipants, teamMembers]);

  // --- Duration tick (1Hz) for countdown display (per Guide §5.2) ---
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // --- Elapsed time in the room (always visible, even on unlimited plans) ---
  const joinedAtRef = useRef<number>(Date.now());
  const elapsedDisplay = useMemo(() => {
    const totalSec = Math.max(0, Math.floor((nowTick - joinedAtRef.current) / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [nowTick]);

  // --- Derived CountdownDisplay (per Guide §5.2 useMemo) ---
  const countdownDisplay: CountdownDisplay | null = useMemo(() => {
    if (durationState.status !== 'running') return null;
    const totalMs = Math.max(0, durationState.endsAt.getTime() - nowTick);
    const totalSec = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    let percentUsed = 0;
    if (durationState.maxMeetingDurationMinutes) {
      const totalAllowedMs = durationState.maxMeetingDurationMinutes * 60 * 1000;
      const elapsedMs = Math.max(0, totalAllowedMs - totalMs);
      percentUsed = Math.min(1, Math.max(0, elapsedMs / totalAllowedMs));
    }
    const isWarning = totalMs <= 5 * 60_000 && totalMs > 60_000;
    const isUrgent = totalMs <= 60_000;
    return { totalMs, hours, minutes, seconds, percentUsed, isWarning, isUrgent };
  }, [durationState, nowTick]);

  // --- Warning toast/banner triggers (§3.2 countdown-warning + defensive local-timer fallback) ---
  useEffect(() => {
    if (!countdownDisplay) return;

    const { totalMs } = countdownDisplay;

    // 5-minute warning
    if (!warned5Ref.current && totalMs <= 5 * 60_000 && totalMs > 60_000) {
      warned5Ref.current = true;
      AudioUtils.ensureInitialized().catch(() => {});
      AudioUtils.playTone(660, 0.18, 'sine', 0.15);
      toast({
        title: '5 minutes remaining',
        description: 'This call will end automatically when the time limit is reached.',
        duration: 8000,
      });
    }

    // 1-minute warning — show sticky red banner + louder beep
    if (!warned1Ref.current && totalMs <= 60_000) {
      warned1Ref.current = true;
      setShowOneMinuteBanner(true);
      AudioUtils.ensureInitialized().catch(() => {});
      // Two short beeps (louder)
      AudioUtils.playTone(880, 0.22, 'sine', 0.3);
      setTimeout(() => AudioUtils.playTone(1100, 0.3, 'sine', 0.35), 260);
      toast({
        title: '⚠ 1 minute remaining',
        description: 'Please wrap up — this call will end shortly.',
        variant: 'destructive',
        duration: 15000,
      });
    }

    // --- Defensive teardown fallback when local timer hits 0 (Guide §6.2) ---
    if (totalMs <= 0) {
      const now = Date.now();
      if (!teardownArmedAtRef.current) {
        teardownArmedAtRef.current = now;
      } else if (now - teardownArmedAtRef.current >= 15_000) {
        // Backend hasn't sent call:ended after 15s past 0 → self-teardown
        console.warn('[countdown] 0-reached safety teardown (no call:ended received from backend)');
        toast({
          title: 'Call Ending',
          description: 'Maximum duration reached. Disconnecting…',
          variant: 'destructive',
          duration: 4000,
        });
        leaveCallRef.current?.();
        return;
      }
    } else {
      // Clock recovered from 0 back to positive (skew / late endsAt update)
      teardownArmedAtRef.current = null;
    }

    // Keep legacy pretty-format label updated for any stray consumers
    const mm = countdownDisplay.minutes.toString().padStart(2, '0');
    const ss = countdownDisplay.seconds.toString().padStart(2, '0');
    setTimeRemaining(countdownDisplay.hours > 0
      ? `${countdownDisplay.hours.toString().padStart(2, '0')}:${mm}:${ss}`
      : `${mm}:${ss}`);
  }, [countdownDisplay, toast, onLeave]);

  // Listen for participant events
  useEffect(() => {
    if (!socket) return;
    
    const handleParticipantJoined = ({ userId, userName: name, isHost: hostStatus, status }: any) => {
      if (!isMountedRef.current) return;

      if (status === 'waiting') {
        if (isHost) {
          const uname = name || 'Unknown';
          setWaitingQueue(prev => {
            if (prev.find(p => p.userId === userId)) return prev;
            return [...prev, { userId, userName: uname, requestedAt: Date.now() }];
          });
          toast({
            title: "Waiting Room",
            description: `${uname} is waiting to join the call`,
            duration: 5000,
          });
        }
        return;
      }

      setParticipants(prev => {
        const exists = prev.find(p => p.id === userId);
        if (exists) {
          return prev.map(p =>
            p.id === userId
              ? {
                  ...p,
                  status: 'joined' as const,
                  leftAt: undefined,
                  joinedAt: new Date(),
                  name: exists.name || name || 'Unknown',
                  isHost: hostStatus || exists.isHost,
                }
              : p
          );
        }
        return [...prev, {
          id: userId,
          name: name || 'Unknown',
          isHost: hostStatus || false,
          joinedAt: new Date(),
          status: 'joined',
        }];
      });
      onParticipantStatusChange?.({ userId, status: 'joined' });
    };

    const handleParticipantLeft = ({ userId, userName: name }: any) => {
      if (!isMountedRef.current) return;
      setParticipants(prev => {
        const exists = prev.some(p => p.id === userId);
        if (exists) {
          return prev.map(p =>
            p.id === userId
              ? { ...p, status: 'left' as const, leftAt: new Date(), audioEnabled: false, videoEnabled: false, screenSharing: false, isTalking: false }
              : p
          );
        }
        return [...prev, {
          id: userId,
          name: name || 'Unknown',
          isHost: false,
          joinedAt: new Date(),
          leftAt: new Date(),
          status: 'left',
          audioEnabled: false,
          videoEnabled: false,
          screenSharing: false,
          isTalking: false,
        }];
      });
      onParticipantStatusChange?.({ userId, status: 'left' });
    };

    const handleParticipantsList = (data: any) => {
      if (!isMountedRef.current) return;

      const endsAtVal = data.endsAt || data.ends_at;
      if (endsAtVal) {
        setEndsAt(new Date(endsAtVal));
      }
      const maxDurationVal = data.maxMeetingDuration || data.max_meeting_duration;
      if (maxDurationVal) {
        setMaxMeetingDuration(maxDurationVal);
      }

      // --- Duration state (per FRONTEND_CALL_DURATION_GUIDE.md §3.2, §4 State Machine) ---
      // Reset warning refs only on running→non-running transitions
      if (endsAtVal) {
        // Countdown already started or is running
        setDurationState({
          status: 'running',
          endsAt: new Date(endsAtVal),
          maxMeetingDurationMinutes: maxDurationVal ?? null,
        });
      } else {
        // Waiting for 2nd participant (guide §4 endsAt==null branch)
        setDurationState({
          status: 'waiting',
          maxMeetingDurationMinutes: maxDurationVal ?? null,
        });
      }

      const socketList = (data.participantsList || data.participants_list || []);
      const socketJoinedIds = new Set(socketList.map((p: any) => p.userId || p.user_id || p.id));

      setParticipants(prev => {
        const resultMap = new Map<string, Participant>();

        prev.forEach(p => {
          if ((p.status === 'invited' || p.status === 'left') && !socketJoinedIds.has(p.id)) {
            resultMap.set(p.id, p);
          }
        });

        socketList.forEach((p: any) => {
          const id = p.userId || p.user_id || p.id;
          const socketName = p.userName || p.user_name || p.name;
          const name = socketName || teamMembers?.find(m => m.id === id)?.name || 'Unknown';
          const prior = resultMap.get(id) || prev.find(pp => pp.id === id);
          resultMap.set(id, {
            id,
            name: prior?.name || name,
            isHost: p.isHost || p.is_host || prior?.isHost || false,
            joinedAt: p.joinedAt || p.joined_at ? new Date(p.joinedAt || p.joined_at) : prior?.joinedAt || new Date(),
            leftAt: undefined,
            status: 'joined',
            audioEnabled: p.audioEnabled ?? prior?.audioEnabled,
            videoEnabled: p.videoEnabled ?? prior?.videoEnabled,
            screenSharing: p.screenSharing ?? prior?.screenSharing,
            isTalking: prior?.isTalking,
          });
        });

        return Array.from(resultMap.values());
      });
    };

    // --- Duration events (FRONTEND_CALL_DURATION_GUIDE.md §3.2 CALLS) ---
    const handleWaitingForParticipants = (data: any) => {
      if (!isMountedRef.current) return;
      const maxDur = data?.maxMeetingDuration ?? data?.max_meeting_duration ?? null;
      setDurationState(s => (s.status === 'running' ? s : {
        status: 'waiting',
        maxMeetingDurationMinutes: s.status === 'waiting' ? s.maxMeetingDurationMinutes : maxDur,
      }));
    };

    const handleDurationStarted = (data: any) => {
      if (!isMountedRef.current) return;
      const endsAtIso = data.endsAt || data.ends_at;
      const maxDur = data.maxMeetingDuration || data.max_meeting_duration;
      if (!endsAtIso) return;
      // Reset warnings when a NEW countdown starts
      warned5Ref.current = false;
      warned1Ref.current = false;
      teardownArmedAtRef.current = null;
      setShowOneMinuteBanner(false);
      const endsAtDate = new Date(endsAtIso);
      setEndsAt(endsAtDate);
      if (maxDur) setMaxMeetingDuration(maxDur);
      setDurationState({
        status: 'running',
        endsAt: endsAtDate,
        maxMeetingDurationMinutes: maxDur ?? null,
      });
      toast({
        title: 'Timer started',
        description: maxDur
          ? `Maximum call time: ${maxDur} min. Call will auto-end when the time is up.`
          : 'Call duration countdown began.',
        duration: 4000,
      });
    };

    const handleDurationActive = (data: any) => {
      if (!isMountedRef.current) return;
      const endsAtIso = data.endsAt || data.ends_at;
      const maxDur = data.maxMeetingDuration || data.max_meeting_duration;
      if (!endsAtIso) return;
      const endsAtDate = new Date(endsAtIso);
      setEndsAt(endsAtDate);
      if (maxDur) setMaxMeetingDuration(maxDur);
      setDurationState({
        status: 'running',
        endsAt: endsAtDate,
        maxMeetingDurationMinutes: maxDur ?? null,
      });
    };

    const handleCountdownWarning = (data: any) => {
      if (!isMountedRef.current) return;
      const mins = data?.remainingMinutes ?? (data?.remainingMs ? Math.floor(data.remainingMs / 60000) : null);
      if (mins === 5 && !warned5Ref.current) {
        warned5Ref.current = true;
        AudioUtils.ensureInitialized().catch(() => {});
        try { AudioUtils.playTone(660, 0.18, 'sine', 0.15); } catch {}
        toast({
          title: '5 minutes remaining',
          description: data?.message || 'This call will end automatically when the time limit is reached.',
          duration: 8000,
        });
      }
      if (mins === 1 && !warned1Ref.current) {
        warned1Ref.current = true;
        setShowOneMinuteBanner(true);
        AudioUtils.ensureInitialized().catch(() => {});
        try {
          AudioUtils.playTone(880, 0.22, 'sine', 0.3);
          setTimeout(() => AudioUtils.playTone(1100, 0.3, 'sine', 0.35), 260);
        } catch {}
        toast({
          title: '⚠ 1 minute remaining',
          description: data?.message || 'Please wrap up — this call will end shortly.',
          variant: 'destructive',
          duration: 15000,
        });
      }
    };
    
    const handleInvitationJoined = ({ userId, userName: name }: any) => {
      if (!isMountedRef.current) return;
      
      const currentUserId = localStorage.getItem('userId') || '';
      if (userId === currentUserId) return; // Don't notify for self
      
      // Show a toast when someone joins via invitation
      toast({
        title: "New Participant",
        description: `${name} has joined the call`,
        duration: 3000,
      });
      
      // Add to participants list if not already there
      handleParticipantJoined({ userId, userName: name, isHost: false });
    };
    
    const handleParticipantMediaState = ({ userId, audioEnabled, videoEnabled, screenSharing, isTalking }: any) => {
      if (!isMountedRef.current) return;
      
      setParticipants(prev => 
        prev.map(p => 
          p.id === userId 
            ? { ...p, audioEnabled, videoEnabled, screenSharing, isTalking }
            : p
        )
      );
      
      // Also update peer state
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId);
        if (peer) {
          peer.audioEnabled = audioEnabled;
          peer.videoEnabled = videoEnabled;
          peer.screenSharing = screenSharing;
          peer.isTalking = isTalking;
          newPeers.set(userId, peer);
        }
        return newPeers;
      });
    };
    
    const prefix = eventPrefix;
    const endedEvent = `${prefix}:ended`;

    const handleRoomEnded = (data: any) => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      warned5Ref.current = false;
      warned1Ref.current = false;
      teardownArmedAtRef.current = null;
      setShowOneMinuteBanner(false);
      setDurationState({ status: 'idle' });
      const reason: string = data?.reason || 'ended_by_host';
      const description = reason === 'duration_limit'
        ? 'Maximum plan duration reached.'
        : reason === 'ended_by_host'
          ? 'Call ended by host.'
          : `Call ended (${reason}).`;
      toast({
        title: "Call Ended",
        description,
        duration: 4500,
      });
      leaveCallRef.current?.().catch(() => {});
    };

    socket.on(`${prefix}:participant-joined`, handleParticipantJoined);
    socket.on(`${prefix}:participant-left`, handleParticipantLeft);
    socket.on(`${prefix}:participants-list`, handleParticipantsList);
    socket.on('invitation:joined', handleInvitationJoined);
    socket.on(`${prefix}:participant-media-state`, handleParticipantMediaState);
    socket.on(`${prefix}:waiting-for-participants`, handleWaitingForParticipants);
    socket.on(`${prefix}:duration-started`, handleDurationStarted);
    socket.on(`${prefix}:duration-active`, handleDurationActive);
    socket.on(`${prefix}:countdown-warning`, handleCountdownWarning);
    socket.on(endedEvent, handleRoomEnded);

    return () => {
      socket.off(`${prefix}:participant-joined`, handleParticipantJoined);
      socket.off(`${prefix}:participant-left`, handleParticipantLeft);
      socket.off(`${prefix}:participants-list`, handleParticipantsList);
      socket.off('invitation:joined', handleInvitationJoined);
      socket.off(`${prefix}:participant-media-state`, handleParticipantMediaState);
      socket.off(`${prefix}:waiting-for-participants`, handleWaitingForParticipants);
      socket.off(`${prefix}:duration-started`, handleDurationStarted);
      socket.off(`${prefix}:duration-active`, handleDurationActive);
      socket.off(`${prefix}:countdown-warning`, handleCountdownWarning);
      socket.off(endedEvent, handleRoomEnded);
    };
  }, [socket, eventPrefix, toast, onParticipantStatusChange]);

  // Join meeting/call when connected and not in waiting room or password screen
  useEffect(() => {
    if (!socket || !isConnected || !socketRoomId || isInWaitingRoom || requiresPassword || isVerifyingInvitation || hasJoinedRef.current) return;

    hasJoinedRef.current = true;

    // Non-host with waitingRoomEnabled -> ask host to be admitted
    if (!isHost && waitingRoomEnabled) {
      setIsInWaitingRoom(true);
      setWaitingForHost(true);
      // Send request to host after a short delay (ensure socket is in room)
      setTimeout(() => {
        socket?.emit('waiting-room:request', {
          roomId: socketRoomId,
          userId: localStorage.getItem('userId') || '',
          userName,
        });
        socket?.emit('waiting-room:get-queue', { roomId: socketRoomId });
      }, 400);
    }

    const currentUserId = localStorage.getItem('userId') || '';

    // Shared callback: applies ACK initial state from backend (call:* and meeting:* share the same shape)
    const applyJoinAck = (response: any) => {
      if (!isMountedRef.current || !response || response.error) return;
      const endsAtVal = response?.endsAt || response?.ends_at;
      if (endsAtVal) setEndsAt(new Date(endsAtVal));
      const maxDurationVal = response?.maxMeetingDuration || response?.max_meeting_duration;
      if (maxDurationVal) setMaxMeetingDuration(maxDurationVal);
      const list = response?.participantsList || response?.participants || response?.participants_list || [];
      if (list.length > 0) {
        setParticipants(list.map((p: any) => ({
          id: p.userId || p.user_id || p.id,
          name: p.userName || p.user_name || p.name || teamMembers?.find(m => m.id === (p.userId || p.user_id || p.id))?.name || 'Unknown',
          isHost: p.isHost || p.is_host || false,
          joinedAt: p.joinedAt || p.joined_at ? new Date(p.joinedAt || p.joined_at) : new Date(),
          audioEnabled: typeof p.audioEnabled === 'boolean' ? p.audioEnabled : undefined,
          videoEnabled: typeof p.videoEnabled === 'boolean' ? p.videoEnabled : undefined,
          screenSharing: p.screenSharing ?? p.screen_sharing ?? false,
          status: 'joined',
        })));
      }
      // Also immediately set durationState based on the ACK so UI countdown appears without waiting for next broadcast
      if (endsAtVal) {
        setDurationState({
          status: 'running',
          endsAt: new Date(endsAtVal),
          maxMeetingDurationMinutes: maxDurationVal ?? null,
        });
      } else if (maxDurationVal || response?.maxMeetingDuration !== undefined) {
        setDurationState({
          status: 'waiting',
          maxMeetingDurationMinutes: maxDurationVal ?? null,
        });
      }
    };

    const joinOpts = {
      userId: currentUserId,
      userName,
      isHost,
      audioEnabled: isAudioEnabled,
      videoEnabled: isVideoEnabled,
    };

    // Join the room (single authoritative socket emit with ACK)
    if (meetingId) {
      joinMeeting(socketRoomId, joinOpts, applyJoinAck);
    } else {
      joinCall(socketRoomId, joinOpts, applyJoinAck);
    }

    // If we came from an invitation, notify others
    if (invitationToken) {
      socket.emit('invitation:joined', {
        roomId: socketRoomId,
        userId: currentUserId,
        userName
      });
    }

    return () => {
      if (socket && isConnected) {
        if (meetingId) {
          if (socketRoomId) leaveMeeting(socketRoomId, { userId: currentUserId, userName });
        } else {
          if (socketRoomId) emitSocketLeaveCall(socketRoomId, { userId: currentUserId, userName });
        }
      }
      hasJoinedRef.current = false;
    };
  }, [socket, isConnected, socketRoomId, isInWaitingRoom, requiresPassword, isVerifyingInvitation, meetingId, joinMeeting, joinCall, emitSocketLeaveCall, leaveMeeting, userName, isHost, isAudioEnabled, isVideoEnabled, invitationToken, teamMembers]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
  };

  const talkingRingClass = 'ring-4 ring-emerald-400 shadow-[0_0_0_8px_rgba(52,211,153,0.18),0_0_36px_rgba(52,211,153,0.65)] animate-pulse';
  const avatarBaseClass = 'border-4 border-white/15 transition-all duration-300';

  const isScreenShareProducer = (
    producer?: { appData?: Record<string, any> },
    consumer?: types.Consumer,
  ) => Boolean(producer?.appData?.screenShare || (consumer?.appData as any)?.screenShare);

  const emitMediaState = useCallback((nextState: Partial<{ audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean }>) => {
    if (!socket || !socketRoomId) return;
    const prefix = eventPrefix;

    const state = {
      roomId: socketRoomId,
      audioEnabled: nextState.audioEnabled ?? isAudioEnabled,
      videoEnabled: nextState.videoEnabled ?? isVideoEnabled,
      screenSharing: nextState.screenSharing ?? isScreenSharing,
    };

    socket.emit(`${prefix}:media-state`, state);
    socket.emit(`${prefix}:participant-media-state`, {
      roomId: socketRoomId,
      userId: localStorage.getItem('userId') || '',
      ...state,
    });
  }, [socket, socketRoomId, eventPrefix, isAudioEnabled, isVideoEnabled, isScreenSharing]);

  const handleDialBack = useCallback(async (targetParticipant: Participant) => {
    if (!isHost) return;
    if (!socket || !isConnected || !callId || !socketRoomId) {
      toast({ variant: 'destructive', title: 'Not connected', description: 'Cannot send invite while offline.' });
      return;
    }
    const now = Date.now();
    const lastInviteAt = dialBackCooldownRef.current.get(targetParticipant.id) || 0;
    if (now - lastInviteAt < 10_000) {
      const secs = Math.ceil((10_000 - (now - lastInviteAt)) / 1000);
      toast({ title: `Please wait ${secs}s`, description: `Invite for ${targetParticipant.name} was sent recently.` });
      return;
    }
    dialBackCooldownRef.current.set(targetParticipant.id, now);

    const verb = targetParticipant.status === 'invited' ? 'Re-sending invite' : 'Calling back';
    toast({ title: `${verb}...`, description: `Ringing ${targetParticipant.name}...` });

    try {
      inviteToCall(callId, targetParticipant.id, callType || 'video', {
        callerName: userName,
        roomId: socketRoomId,
      });
    } catch (e) {
      // Fallback: emit directly if helper not reachable
      socket.emit('call:invite', {
        callId,
        targetUserId: targetParticipant.id,
        type: callType || 'video',
        callerName: userName,
        roomId: socketRoomId,
      });
    }

    setTimeout(() => {
      toast({
        title: targetParticipant.status === 'invited' ? 'Invite re-sent' : 'Call-back sent',
        description: `${targetParticipant.name} should see the incoming call ring now.`,
      });
    }, 500);
  }, [isHost, socket, isConnected, callId, socketRoomId, callType, inviteToCall, userName, toast]);

  const removeProducerFromPeer = useCallback((producerId: string, peerId?: string) => {
    setPeers(prev => {
      const newPeers = new Map(prev);
      
      if (peerId) {
        const peer = newPeers.get(peerId);
        if (peer) {
          peer.producers = peer.producers.filter(p => p.producerId !== producerId);
          const stillHasScreenShare = peer.producers.some(p => p.appData?.screenShare);
          if (!stillHasScreenShare) {
            peer.screenSharing = false;
          }
          newPeers.set(peerId, peer);
        }
      } else {
        for (const [id, peer] of newPeers) {
          const hadScreenShare = peer.producers.some(p => p.producerId === producerId && p.appData?.screenShare);
          peer.producers = peer.producers.filter(p => p.producerId !== producerId);
          if (hadScreenShare) {
            peer.screenSharing = peer.producers.some(p => p.appData?.screenShare);
          }
          newPeers.set(id, peer);
        }
      }
      return newPeers;
    });

    setConsumers(prev => {
      const newConsumers = new Map(prev);
      const consumer = newConsumers.get(producerId);
      if (consumer) {
        try { consumer.close(); } catch (e) { /* ignore */ }
        newConsumers.delete(producerId);
      }
      return newConsumers;
    });

    // Clean up remote video element
    const videoEl = remoteVideosRef.current.get(producerId);
    if (videoEl) {
      videoEl.srcObject = null;
      remoteVideosRef.current.delete(producerId);
    }

    // Clean up remote audio element
    const audioEl = remoteAudiosRef.current.get(producerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      if (audioEl.parentNode) document.body.removeChild(audioEl);
      remoteAudiosRef.current.delete(producerId);
    }

    // Clean up Web Audio amplification nodes for this producer
    try {
      const gainNode = remoteAudioGainNodesRef.current.get(producerId);
      if (gainNode) { try { gainNode.disconnect(); } catch {} }
      remoteAudioGainNodesRef.current.delete(producerId);
      const srcNode = remoteAudioSourcesRef.current.get(producerId);
      if (srcNode) { try { srcNode.disconnect(); } catch {} }
      remoteAudioSourcesRef.current.delete(producerId);
    } catch {}
  }, []);

  const removeProducerFromPeerRef = useRef(removeProducerFromPeer);
  useEffect(() => { removeProducerFromPeerRef.current = removeProducerFromPeer; }, [removeProducerFromPeer]);

  useEffect(() => { audioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);

  useEffect(() => {
    if (isScreenSharing && localScreenRef.current && localScreenStreamRef.current) {
      localScreenRef.current.srcObject = localScreenStreamRef.current;
      localScreenRef.current.play().catch(error => {
        console.log('Screen preview play failed:', error);
      });
    }
  }, [isScreenSharing]);

  // Cleanup effect on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      [localMediaStreamRef.current, localAudioStreamRef.current, localScreenStreamRef.current].forEach(stream => {
        stream?.getTracks().forEach(track => track.stop());
      });
      
      [localVideoRef.current?.srcObject, localScreenRef.current?.srcObject].forEach(srcObject => {
        if (srcObject) (srcObject as MediaStream).getTracks().forEach(track => track.stop());
      });
      
      // Clean up remote audio elements
      remoteAudiosRef.current.forEach((audioEl) => {
        audioEl.pause();
        audioEl.srcObject = null;
        document.body.removeChild(audioEl);
      });
      remoteAudiosRef.current.clear();
      
      try { sendTransport?.close(); } catch (e) { /* ignore */ }
      try { recvTransport?.close(); } catch (e) { /* ignore */ }
      try { localAudioProducer?.close(); } catch (e) { /* ignore */ }
      try { localVideoProducer?.close(); } catch (e) { /* ignore */ }
      try { localScreenProducer?.close(); } catch (e) { /* ignore */ }
      
      consumers.forEach(consumer => { try { consumer.close(); } catch (e) { /* ignore */ } });
      
      audioContextRef.current?.close();
    };
  }, []);

  // Initialize device
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return;
    
    const initializeDevice = async () => {
      try {
        const newDevice = new Device();
        
        socket.emit('mediasoup:getRouterRtpCapabilities', { roomId }, (response: any) => {
          if (!isMountedRef.current) return;
          
          if (response?.error) {
            setConnectionError(response.error);
            return;
          }

          const routerRtpCapabilities = response.routerRtpCapabilities || response.rtpCapabilities;
          
          newDevice.load({ routerRtpCapabilities })
            .then(() => {
              if (isMountedRef.current) {
                setDevice(newDevice);
                setConnectionError('');
              }
            })
            .catch((error) => {
              if (isMountedRef.current) {
                console.error('Error loading device:', error);
                setConnectionError('Unable to initialize media device for this room.');
              }
            });
        });
      } catch (error) {
        if (isMountedRef.current) {
          console.error('Error initializing device:', error);
        }
      }
    };

    initializeDevice();

    const handleNewProducer = ({ producerId, kind, peerId, peerName, appData }: any) => {
      if (!isMountedRef.current) return;
      console.log('New producer:', producerId, kind, 'from peer:', peerId);
      
      setPeers(prev => {
        const newPeers = new Map(prev);
        const resolvedPeerId = peerId || producerId;
        const peer = newPeers.get(resolvedPeerId) || createPeer(resolvedPeerId, peerName);
        if (!peer.producers.some(producer => producer.producerId === producerId)) {
          peer.producers.push({ producerId, kind, appData });
        }
        if (appData?.screenShare) peer.screenSharing = true;
        newPeers.set(resolvedPeerId, peer);
        return newPeers;
      });
      
      const currentRecvTransport = recvTransportRef.current;
      if (currentRecvTransport) {
        consume(producerId, kind);
      }
    };

    const handleProducerClosed = ({ producerId, peerId }: any) => {
      if (!isMountedRef.current) return;
      console.log('Producer closed:', producerId, 'from peer:', peerId);
      removeProducerFromPeerRef.current(producerId, peerId);
    };

    socket.on('mediasoup:newProducer', handleNewProducer);
    socket.on('mediasoup:producerClosed', handleProducerClosed);

    return () => {
      socket.off('mediasoup:newProducer', handleNewProducer);
      socket.off('mediasoup:producerClosed', handleProducerClosed);
    };
  }, [socket, isConnected, roomId]);

  // Create transports
  useEffect(() => {
    if (!device || !socket || !isConnected || !roomId) return;
    
    let createdSendTransport: types.Transport | null = null;
    let createdRecvTransport: types.Transport | null = null;

    socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'send' }, async (response: any) => {
      if (!isMountedRef.current) return;
      
      if (response?.error) {
        setConnectionError(response.error);
        return;
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;
      
      const transport = await device.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters
      });

      transport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
        if (!isMountedRef.current) return;
        try {
          socket.emit('mediasoup:connectWebRtcTransport', {
            transportId: id,
            dtlsParameters,
            roomId
          }, (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
              return;
            }
            callback();
          });
        } catch (error) {
          errback(error);
        }
      });

      transport.on('produce', async ({ kind, rtpParameters, appData }: any, callback: any, errback: any) => {
        if (!isMountedRef.current) return;
        try {
          socket.emit('mediasoup:produce', {
            transportId: id,
            kind,
            rtpParameters,
            appData,
            roomId
          }, (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
              return;
            }
            callback({ id: response.id });
          });
        } catch (error) {
          errback(error);
        }
      });

      createdSendTransport = transport;
      setSendTransport(transport);
    });

    socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'recv' }, async (response: any) => {
      if (!isMountedRef.current) return;
      
      if (response?.error) {
        setConnectionError(response.error);
        return;
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;
      
      const transport = await device.createRecvTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters
      });

      transport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
        if (!isMountedRef.current) return;
        try {
          socket.emit('mediasoup:connectWebRtcTransport', {
            transportId: id,
            dtlsParameters,
            roomId
          }, (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
              return;
            }
            callback();
          });
        } catch (error) {
          errback(error);
        }
      });

      createdRecvTransport = transport;
      recvTransportRef.current = transport;
      setRecvTransport(transport);
    });
    
    return () => {
      if (createdSendTransport) try { createdSendTransport.close(); } catch (e) { /* ignore */ }
      if (createdRecvTransport) {
        try { createdRecvTransport.close(); } catch (e) { /* ignore */ }
        if (recvTransportRef.current === createdRecvTransport) recvTransportRef.current = null;
      }
    };
  }, [device, socket, isConnected, roomId]);

  // Fetch existing producers when recv transport is ready
  useEffect(() => {
    if (!recvTransport || !socket || !roomId) return;
    if (hasFetchedProducers.current) return;
    hasFetchedProducers.current = true;

    socket.emit('mediasoup:getProducers', { roomId }, (response: any) => {
      if (response?.error) {
        setConnectionError(response.error);
        return;
      }

      (response.producers || []).forEach(({ producerId, kind, peerId, peerName, appData }: any) => {
        setPeers(prev => {
          const newPeers = new Map(prev);
          const resolvedPeerId = peerId || producerId;
          const peer = newPeers.get(resolvedPeerId) || createPeer(resolvedPeerId, peerName);
          if (!peer.producers.some(producer => producer.producerId === producerId)) {
            peer.producers.push({ producerId, kind, appData });
          }
          if (appData?.screenShare) peer.screenSharing = true;
          newPeers.set(resolvedPeerId, peer);
          return newPeers;
        });

        if (!consumersMapRef.current.has(producerId)) {
          consume(producerId, kind);
        }
      });
    });
  }, [recvTransport, socket, roomId]);

  const consume = async (producerId: string, kind: types.MediaKind) => {
    const currentRecvTransport = recvTransportRef.current;
    const currentDevice = deviceRef.current;
    if (!currentRecvTransport || !currentDevice || !socket || !roomId) return;

    try {
      // Unlock audio for autoplay
      await AudioUtils.ensureInitialized();

      socket.emit('mediasoup:consume', {
        transportId: currentRecvTransport.id,
        producerId,
        rtpCapabilities: currentDevice.recvRtpCapabilities,
        roomId
      }, async (response: any) => {
        if (!isMountedRef.current) return;
        
        if (response?.error) {
          setConnectionError(response.error);
          return;
        }

        const { id, rtpParameters, producerId: prodId, appData } = response;
        
        const consumer = await currentRecvTransport.consume({
          id,
          producerId: prodId,
          kind,
          rtpParameters,
          appData,
        });

        // Handle audio track
        if (kind === 'audio' && consumer.track) {
          const track = consumer.track;
          const audioStream = new MediaStream([track]);

          // Ensure audio playback context for volume amplification
          try {
            if (!playbackAudioContextRef.current) {
              playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (playbackAudioContextRef.current.state === 'suspended') {
              playbackAudioContextRef.current.resume().catch(() => {});
            }

            const pbCtx = playbackAudioContextRef.current;
            const sourceNode = pbCtx.createMediaStreamSource(audioStream);
            const gainNode = pbCtx.createGain();
            // Amplify 4x for much louder participant voices
            gainNode.gain.value = 4.0;
            sourceNode.connect(gainNode);
            gainNode.connect(pbCtx.destination);

            remoteAudioSourcesRef.current.set(prodId, sourceNode);
            remoteAudioGainNodesRef.current.set(prodId, gainNode);
          } catch (err) {
            console.warn('Web Audio amplification unavailable, falling back to audio element:', err);
          }

          const audioEl = document.createElement('audio');
          audioEl.srcObject = audioStream;
          audioEl.autoplay = true;
          (audioEl as any).playsInline = true;
          audioEl.muted = false;
          audioEl.setAttribute('muted', 'false');
          audioEl.setAttribute('playsinline', '');
          audioEl.setAttribute('autoplay', '');
          // Keep element at 100% as a fallback/compatibility layer; Web Audio provides the amplification
          audioEl.volume = 1;
          document.body.appendChild(audioEl);
          remoteAudiosRef.current.set(prodId, audioEl);
          
          // Explicitly play - catch and handle autoplay failures
          const tryPlay = async () => {
            try {
              await audioEl.play();
              console.log('Remote audio playing for producer:', prodId, '(amplified x4 via Web Audio)');
            } catch (err: any) {
              console.warn('Remote audio autoplay blocked for', prodId, err?.message);
              setAudioAutoplayFailCount(prev => prev + 1);
              // Schedule retry after any user gesture
              const retryOnGesture = () => {
                try {
                  // Resume audio context & replay
                  try {
                    if (playbackAudioContextRef.current?.state === 'suspended') {
                      playbackAudioContextRef.current.resume().catch(() => {});
                    }
                    // Ramp gain up again to ensure loud audio on retry
                    const g = remoteAudioGainNodesRef.current.get(prodId);
                    if (g) {
                      try { g.gain.setValueAtTime(4.0, playbackAudioContextRef.current!.currentTime); } catch {}
                    }
                  } catch {}
                  audioEl.play().then(() => {
                    try { setShowAudioEnableOverlay(false); } catch {}
                  }).catch(() => {});
                } catch {}
                document.removeEventListener('click', retryOnGesture);
                document.removeEventListener('keydown', retryOnGesture);
                document.removeEventListener('touchstart', retryOnGesture);
              };
              document.addEventListener('click', retryOnGesture, { once: true });
              document.addEventListener('keydown', retryOnGesture, { once: true });
              document.addEventListener('touchstart', retryOnGesture, { once: true });
              // Show a one-time toast
              if (connectionError === '') {
                toast({
                  title: "Audio blocked by browser",
                  description: "Tap the 'Enable Audio' button on screen OR click anywhere to hear participants.",
                  duration: 5000,
                });
              }
            }
          };
          tryPlay();
          
          AudioUtils.ensureInitialized().catch(err => {
            console.warn('Failed to initialize audio utils:', err);
          });
        }

        // Handle video track
        if (kind === 'video' && consumer.track && !isScreenShareProducer(undefined, consumer)) {
          // Video element will be mounted in render via consumers map
        }

        consumer.on('trackended', () => {
          console.log('Consumer track ended:', prodId);
          const audioEl = remoteAudiosRef.current.get(prodId);
          if (audioEl) {
            try { audioEl.pause(); } catch {}
            audioEl.srcObject = null;
            if (audioEl.parentNode) document.body.removeChild(audioEl);
            remoteAudiosRef.current.delete(prodId);
          }
          removeProducerFromPeerRef.current(prodId);
        });

        consumer.on('transportclose', () => {
          console.log('Consumer transport closed:', prodId);
          const audioEl = remoteAudiosRef.current.get(prodId);
          if (audioEl) {
            try { audioEl.pause(); } catch {}
            audioEl.srcObject = null;
            if (audioEl.parentNode) document.body.removeChild(audioEl);
            remoteAudiosRef.current.delete(prodId);
          }
          removeProducerFromPeerRef.current(prodId);
        });

        socket.emit('mediasoup:resume', { consumerId: id, roomId }, (resumeResponse: any) => {
          if (resumeResponse?.error) {
            setConnectionError(resumeResponse.error);
            return;
          }
          console.log('Consumer resumed:', id, kind);
        });

        setConsumers(prev => {
          const newConsumers = new Map(prev);
          newConsumers.set(producerId, consumer);
          return newConsumers;
        });
      });
    } catch (error) {
      console.error('Error consuming:', error);
    }
  };

  const startLocalMedia = async () => {
    if (!sendTransport || !device) return;

    try {
      await AudioUtils.ensureInitialized();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: callType === 'video'
      });
      
      localAudioStreamRef.current = stream;
      localMediaStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        try {
          await localVideoRef.current.play().catch(() => {});
        } catch {}
      }

      // LOCAL SIDETONE DISABLED: User must NOT hear their own voice (echo-cancellation handles any natural feedback)

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') await audioContext.resume();
      
      const source = audioContext.createMediaStreamSource(stream);
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      source.connect(analyserRef.current);
      
      const checkAudioLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        const average = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
        
        const talking = audioEnabledRef.current && average > 30;
        setIsLocalTalking(talking);
        if (lastLocalTalkingRef.current !== talking) {
          lastLocalTalkingRef.current = talking;
          socket?.emit(`${eventPrefix}:audio-level`, { roomId, isTalking: talking, userName });
        }

        if (!audioEnabledRef.current && average > 40) {
          const now = Date.now();
          if (now - lastMuteWarning.current > 5000) {
            lastMuteWarning.current = now;
            toast({
              title: "You're muted!",
              description: "It looks like you're trying to speak. Unmute your microphone to be heard.",
              variant: "default",
              duration: 3000,
            });
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };
      checkAudioLevel();

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { userName }
        });
        setLocalAudioProducer(audioProducer);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: { userName }
        });
        setLocalVideoProducer(videoProducer);
      }
      emitMediaState({ audioEnabled: true, videoEnabled: callType === 'video' });
    } catch (error) {
      console.error('Error starting local media:', error);
      setConnectionError('Camera or microphone could not be started. Check browser permissions and device availability.');
    }
  };

  const stopLocalMedia = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    playbackAudioContextRef.current?.close();
    playbackAudioContextRef.current = null;

    // Clean up remote Web Audio gain nodes
    remoteAudioGainNodesRef.current.forEach((gain) => { try { gain.disconnect(); } catch {} });
    remoteAudioGainNodesRef.current.clear();
    remoteAudioSourcesRef.current.forEach((src) => { try { src.disconnect(); } catch {} });
    remoteAudioSourcesRef.current.clear();
    
    localAudioProducer?.close();
    setLocalAudioProducer(null);
    localVideoProducer?.close();
    setLocalVideoProducer(null);
    localScreenProducer?.close();
    setLocalScreenProducer(null);
    
    localMediaStreamRef.current?.getTracks().forEach(track => track.stop());
    localMediaStreamRef.current = null;
    
    if (localScreenRef.current?.srcObject) {
      (localScreenRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      localScreenRef.current.srcObject = null;
    }
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }
    
    localAudioStreamRef.current = null;
    lastLocalTalkingRef.current = false;
    setIsLocalTalking(false);
  };

  const toggleAudio = () => {
    if (!localAudioProducer) return;
    
    if (isAudioEnabled) {
      localAudioProducer.pause();
      localAudioStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = false; });
    } else {
      localAudioProducer.resume();
      localAudioStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = true; });
    }
    
    const nextAudioEnabled = !isAudioEnabled;
    setIsAudioEnabled(nextAudioEnabled);
    
    if (!nextAudioEnabled) {
      lastLocalTalkingRef.current = false;
      setIsLocalTalking(false);
      socket?.emit('call:audio-level', { roomId, isTalking: false, userName });
    }
    
    emitMediaState({ audioEnabled: nextAudioEnabled });
  };

  const toggleVideo = () => {
    if (!localVideoProducer) return;
    
    if (isVideoEnabled) {
      localVideoProducer.pause();
      localMediaStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = false; });
    } else {
      localVideoProducer.resume();
      localMediaStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = true; });
    }
    
    const nextVideoEnabled = !isVideoEnabled;
    setIsVideoEnabled(nextVideoEnabled);
    emitMediaState({ videoEnabled: nextVideoEnabled });
  };

  const startScreenShare = async () => {
    if (!sendTransport) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      localScreenStreamRef.current = stream;
      
      if (localScreenRef.current) {
        localScreenRef.current.srcObject = stream;
        localScreenRef.current.play().catch(err => {
          console.error('Error playing screen share preview:', err);
        });
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        const screenProducer = await sendTransport.produce({
          track,
          appData: { userName, screenShare: true }
        });
        setLocalScreenProducer(screenProducer);
        setIsScreenSharing(true);
        emitScreenShareStart(roomId);
        emitMediaState({ screenSharing: true });
        
        track.onended = () => stopScreenShare();
      }
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  const stopScreenShare = () => {
    localScreenProducer?.close();
    setLocalScreenProducer(null);
    
    localScreenStreamRef.current?.getTracks().forEach(track => track.stop());
    localScreenStreamRef.current = null;
    
    if (localScreenRef.current) localScreenRef.current.srcObject = null;
    
    setIsScreenSharing(false);
    emitScreenShareStop(roomId);
    emitMediaState({ screenSharing: false });
  };

  const handleEnableAllAudio = async () => {
    try { await AudioUtils.initAudioContext(); } catch {}

    // Ensure playback audio context is running (for amplified audio)
    try {
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (playbackAudioContextRef.current.state === 'suspended') {
        await playbackAudioContextRef.current.resume();
      }
    } catch {}

    const promises: Promise<any>[] = [];
    remoteAudiosRef.current.forEach(audioEl => {
      try {
        audioEl.muted = false;
        audioEl.volume = 1;
        promises.push(audioEl.play().catch(() => {}));
      } catch {}
    });

    try { await Promise.all(promises); } catch {}
    setShowAudioEnableOverlay(false);
    setAudioAutoplayFailCount(0);
    toast({ title: "Audio Enabled", description: "You should now hear all participants loudly.", duration: 2500 });
  };

  const leaveCall = async () => {
    if (isRecording) await stopRecording();
    stopLocalMedia();
    const prefix = eventPrefix;

    // Cleanup countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    consumers.forEach(consumer => { try { consumer.close(); } catch (e) { /* ignore */ } });
    sendTransport?.close();
    recvTransport?.close();

    // Notify others that we're leaving
    socket?.emit(`${prefix}:leave`, {
      ...(meetingId ? { meetingId: socketRoomId } : { roomId: socketRoomId }),
      userId: localStorage.getItem('userId') || '',
      userName
    });

    socket?.emit(`${prefix}:audio-level`, { roomId: socketRoomId, isTalking: false, userName });
    socket?.emit(`${prefix}:media-state`, {
      roomId: socketRoomId,
      audioEnabled: false,
      videoEnabled: false,
      screenSharing: false,
    });
    onLeave();
  };
  leaveCallRef.current = leaveCall;

  const sendChatMessage = () => {
    if (!socket || !chatInput.trim() || !roomId) return;

    const userId = localStorage.getItem('userId') || '';
    const exactUserName = resolveSenderName(userId, userName);

    const message: ChatMessage = {
      id: Date.now().toString(),
      userId,
      userName: exactUserName,
      content: chatInput.trim(),
      timestamp: new Date()
    };

    // Optimistic local copy (server echoes to everyone incl. sender; the
    // incoming handler dedupes by userId so we never render it twice).
    setChatMessages(prev => [...prev, message]);

    // SINGLE emit. Previously this fired BOTH `meeting-chat:message`
    // (via sendMeetingChat) AND `meeting-chat:send`; the backend handles
    // both aliases with the same handler, so every remote participant
    // received the message TWICE.
    sendMeetingChat(roomId, chatInput.trim(), { userId, userName: exactUserName });

    setChatInput('');
  };

  // ========== COPY FULL INVITE DETAILS ==========
  // Copies EVERYTHING an invitee needs (not just the link): type, title,
  // host, schedule, code, link, password and waiting-room note.
  const buildInviteText = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isMeetingRoom = Boolean(meetingId);
    const code = inviteDetails?.code || roomId;
    const link = `${origin}/${isMeetingRoom ? 'meetings' : 'calls'}/${code}`;
    const kind = isMeetingRoom ? 'meeting' : callType === 'audio' ? 'audio call' : 'video call';
    const lines: string[] = [
      `Join my ${kind} on Metricorex!`,
    ];
    if (inviteDetails?.title) lines.push(`Title: ${inviteDetails.title}`);
    lines.push(`Host: ${userName || 'Host'}`);
    if (inviteDetails?.startTime) {
      try {
        lines.push(`When: ${new Date(inviteDetails.startTime).toLocaleString()}`);
      } catch { /* invalid date - skip */ }
    }
    if (code) lines.push(`${isMeetingRoom ? 'Meeting' : 'Call'} code: ${code}`);
    lines.push(`Link: ${link}`);
    if (inviteDetails?.password) lines.push(`Password: ${inviteDetails.password}`);
    if (inviteDetails?.waitingRoomEnabled || (!isHost && propWaitingRoomEnabled)) {
      lines.push('Note: waiting room is enabled - the host will admit you.');
    }
    lines.push('', 'No account needed - open the link and join as a guest.');
    return lines.join('\n');
  }, [meetingId, inviteDetails, roomId, callType, userName, isHost, propWaitingRoomEnabled]);

  const handleCopyInvite = useCallback(async () => {
    const text = buildInviteText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedInvite(true);
      toast({
        title: 'Invite copied',
        description: 'Full details copied (code, link, password) - paste anywhere to share.',
      });
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Your browser blocked clipboard access. Long-press the link to copy manually.',
      });
    }
  }, [buildInviteText, toast]);

  const verifyPassword = () => {
    if (!enteredPassword.trim()) {
      setPasswordError('Please enter a password');
      return;
    }

    if (!socket || !roomId) return;

    socket.emit('room:verifyPassword', {
      roomId,
      password: enteredPassword
    }, (response: any) => {
      if (response.success || response.valid) {
        setRequiresPassword(false);
        setEnteredPassword('');
        setPasswordError('');
      } else {
        setPasswordError('Incorrect password. Please try again.');
        setEnteredPassword('');
      }
    });
  };

  const admitParticipant = (participantId: string) => {
    if (!socket || !roomId) return;
    socket.emit('waiting-room:admit', { roomId, meetingId: roomId, participantId });
    setWaitingQueue(prev => prev.filter(p => p.userId !== participantId));
  };

  const denyParticipant = (participantId: string) => {
    if (!socket || !roomId) return;
    socket.emit('waiting-room:deny', { roomId, meetingId: roomId, participantId });
    setWaitingQueue(prev => prev.filter(p => p.userId !== participantId));
  };

  const admitAll = () => {
    if (!socket || !roomId) return;
    socket.emit('waiting-room:admit-all', { roomId, meetingId: roomId });
    setWaitingQueue([]);
  };

  const blobToDataUrl = (blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getRecordableStream = (): MediaStream | null => {
    const localStream = localVideoRef.current?.srcObject as MediaStream | null;
    if (!localStream) return null;

    const activeTracks = localStream.getTracks().filter(track => {
      if (track.kind === 'audio') return track.enabled && track.readyState === 'live';
      if (track.kind === 'video') return track.readyState === 'live';
      return false;
    });

    if (activeTracks.length === 0) {
      console.warn('No active tracks available for recording');
      return null;
    }

    return new MediaStream(activeTracks);
  };

  const startLocalRecorder = (): boolean => {
    const stream = getRecordableStream();
    if (!stream || typeof MediaRecorder === 'undefined') {
      console.error('Cannot start recorder: no valid stream');
      return false;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    recordedChunksRef.current = [];
    
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      return true;
    } catch (error) {
      console.error('Error creating MediaRecorder:', error);
      return false;
    }
  };

  const stopLocalRecorder = () => {
    return new Promise<{ storageUrl: string; size: number; blob?: Blob }>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve({ storageUrl: '', size: 0 });
        return;
      }

      const cleanup = () => {
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
      };

      recorder.onstop = async () => {
        try {
          const mimeType = recorder.mimeType || 'video/webm';
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          
          if (blob.size > 0) {
            const storageUrl = await blobToDataUrl(blob);
            resolve({ storageUrl, size: blob.size, blob });
          } else {
            console.warn('Recording blob is empty');
            resolve({ storageUrl: '', size: 0 });
          }
        } catch (error) {
          console.error('Error processing recorded blob:', error);
          resolve({ storageUrl: '', size: 0 });
        } finally {
          cleanup();
        }
      };

      if (recorder.state === 'recording') {
        recorder.stop();
      } else if (recorder.state === 'paused') {
        recorder.resume();
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          } else {
            cleanup();
            resolve({ storageUrl: '', size: 0 });
          }
        }, 100);
      } else {
        cleanup();
        resolve({ storageUrl: '', size: 0 });
      }
    });
  };

  const startRecording = async () => {
    if (!meetingId && !callId) {
      setConnectionError('Cannot start recording because this room is missing a meeting or call id.');
      return;
    }

    try {
      const response = await api.post('/recordings', { meetingId, callId });
      const recording = unwrapApiData<Recording>(response.data, 'Failed to start recording');
      setActiveRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      const started = startLocalRecorder();
      if (!started) {
        toast({
          title: "Recording Warning",
          description: "Local recording may not capture video. Audio-only recording will be attempted.",
          variant: "default",
          duration: 5000,
        });
      }
      
      emitRecordingStart(roomId);
    } catch (error) {
      console.error('Error starting recording:', error);
      setConnectionError('Recording could not be started.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!activeRecording) {
      setIsRecording(false);
      emitRecordingStop(roomId);
      recordedChunksRef.current = [];
      return;
    }

    try {
      const { size, blob } = await stopLocalRecorder();
      const duration = recordingDuration;

      if (!blob || blob.size === 0) {
        console.warn('Recording file is empty or unavailable.');
        try {
          await api.patch(`/recordings/${activeRecording.id}`, { 
            status: 'failed',
            errorMessage: 'Recording file was empty or unavailable'
          });
        } catch (updateError) {
          console.error('Error updating recording status:', updateError);
        }
      } else {
        const formData = new FormData();
        formData.append('file', blob, `recording-${activeRecording.id}.webm`);
        formData.append('duration', duration.toString());
        
        await api.post(`/recordings/${activeRecording.id}/upload`, formData);
      }
      
      setActiveRecording(null);
      setIsRecording(false);
      setRecordingDuration(0);
      emitRecordingStop(roomId);
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast({
        title: "Recording Error",
        description: "There was an error saving the recording.",
        variant: "destructive",
        duration: 5000,
      });
      setActiveRecording(null);
      setIsRecording(false);
      setRecordingDuration(0);
      recordedChunksRef.current = [];
    }
  };

  // Countdown timer for call duration
  useEffect(() => {
    if (!endsAt) {
      setTimeRemaining('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = endsAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('00:00');
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      setTimeRemaining(formatted);
    };

    // Update immediately
    updateCountdown();

    // Set up interval
    countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [endsAt]);

  // Echo / multi-device warning.
  // The SERVER is the source of truth: the backend counts sockets per room
  // and emits `call:multi-device` when the same account joins on 2+ devices.
  // A local heuristic (remote peer producing audio/video with the exact same
  // display name) covers servers without that event. A single participant
  // joining alone must NEVER trigger the warning.
  useEffect(() => {
    if (echoWarningShown) return;

    const localName = (userName || '').trim().toLowerCase();
    const duplicateNamePeer = localName
      ? Array.from(peers.values()).some(
          (p) =>
            p.producers.length > 0 &&
            (p.name || '').trim().toLowerCase() === localName
        )
      : false;

    if (multiDeviceAlert || duplicateNamePeer) {
      setEchoWarningShown(true);
      toast({
        title: "Same Account On Multiple Devices!",
        description: multiDeviceAlert?.message ||
          "This account appears to be in the room on more than one device — this will cause LOUD echo. Please leave the call on all but one device, or use headphones.",
        variant: "destructive",
        duration: 12000,
      });
    }
  }, [multiDeviceAlert, peers, echoWarningShown, userName, toast]);

  // Track remote audio autoplay failures: if we hit 2+ failures, show the giant "Tap to enable audio" overlay
  useEffect(() => {
    if (audioAutoplayFailCount >= 2) {
      setShowAudioEnableOverlay(true);
    }
  }, [audioAutoplayFailCount]);

  // Listen for server-verified multi-device (echo risk) alerts
  useEffect(() => {
    if (!socket) return;

    const handleMultiDevice = (data: any) => {
      if (!isMountedRef.current) return;
      setMultiDeviceAlert({
        message: data?.message || '',
        deviceCount: Number(data?.deviceCount) || 2,
      });
    };

    socket.on('call:multi-device', handleMultiDevice);
    socket.on('meeting:multi-device', handleMultiDevice);
    return () => {
      socket.off('call:multi-device', handleMultiDevice);
      socket.off('meeting:multi-device', handleMultiDevice);
    };
  }, [socket]);

  // Recording duration timer
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Listen for room events
  useEffect(() => {
    if (!socket) return;

    const handlePasswordRequired = () => setRequiresPassword(true);

    const handleWaitingRoomPending = (data: any) => {
      if (!isHost) return;
      const uid = data.userId || data.participantId;
      const uname = data.userName || data.participantName || data.name || uid;
      setWaitingQueue(prev => {
        if (prev.find(p => p.userId === uid)) return prev;
        return [...prev, { userId: uid, userName: uname, requestedAt: Date.now() }];
      });
      toast({
        title: "Waiting Room",
        description: `${uname} is waiting to join the call`,
        duration: 5000,
      });
    };

    const handleWaitingRoomQueue = (data: any) => {
      if (data && data.roomId !== socketRoomId) return;
      setWaitingQueue(data.queue || []);
    };

    const handleAdmitted = async (data: any) => {
      if (data && data.roomId !== socketRoomId) return;
      setIsInWaitingRoom(false);
      setWaitingForHost(false);

      if (!hasJoinedRestRef.current && (callId || meetingId)) {
        hasJoinedRestRef.current = true;
        try {
          const endpoint = callId
            ? `/calls/${callId}/join`
            : `/meetings/${meetingId}/join`;
          const response = await api.post(endpoint, {});
          const result = unwrapApiData(response.data, 'Failed to finalize join');
          if (callId && (result as any)?.endsAt) {
            setEndsAt(new Date((result as any).endsAt));
          }
          if (callId && (result as any)?.maxMeetingDuration !== undefined) {
            setMaxMeetingDuration((result as any).maxMeetingDuration);
          }
        } catch (err) {
          console.error('[admitted] REST join call failed — room entered but DB status may not be persisted:', err);
        }
      }
    };

    const handleDenied = (data: any) => {
      if (data && data.roomId !== socketRoomId) return;
      setWaitingForHost(false);
      setIsInWaitingRoom(false);
      toast({
        title: "Entry Denied",
        description: "Host has denied your request to join.",
        variant: "destructive",
        duration: 6000,
      });
      setTimeout(() => onLeave(), 2500);
    };

    socket.on('room:passwordRequired', handlePasswordRequired);
    socket.on('waiting-room:request', handleWaitingRoomPending);
    socket.on('waiting-room:pending', handleWaitingRoomPending);
    socket.on('waiting-room:queue', handleWaitingRoomQueue);
    socket.on('waiting-room:admitted', handleAdmitted);
    socket.on('waiting-room:denied', handleDenied);
    socket.on('waiting-room:admit', handleAdmitted);

    // Fetch current waiting queue when host arrives
    if (isHost) {
      socket.emit('waiting-room:get-queue', { roomId });
    }

    return () => {
      socket.off('room:passwordRequired', handlePasswordRequired);
      socket.off('waiting-room:request', handleWaitingRoomPending);
      socket.off('waiting-room:pending', handleWaitingRoomPending);
      socket.off('waiting-room:queue', handleWaitingRoomQueue);
      socket.off('waiting-room:admitted', handleAdmitted);
      socket.off('waiting-room:denied', handleDenied);
      socket.off('waiting-room:admit', handleAdmitted);
    };
  }, [socket, isHost, roomId, toast, onLeave]);

  // Listen for screen share and media state events
  useEffect(() => {
    if (!socket) return;
    const prefix = eventPrefix;

    const handleScreenShareStarted = ({ userId, userName: peerName }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId) || createPeer(userId, peerName);
        peer.name = peer.name || peerName;
        peer.screenSharing = true;
        newPeers.set(userId, peer);
        return newPeers;
      });
    };

    const handleScreenShareStopped = ({ userId }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId);
        if (peer) {
          const screenShareProducerIds = peer.producers
            .filter(p => p.appData?.screenShare)
            .map(p => p.producerId);

          peer.producers = peer.producers.filter(p => !p.appData?.screenShare);
          peer.screenSharing = false;
          newPeers.set(userId, peer);

          screenShareProducerIds.forEach(producerId => {
            setConsumers(consumersPrev => {
              const newConsumers = new Map(consumersPrev);
              const consumer = newConsumers.get(producerId);
              if (consumer) {
                try { consumer.close(); } catch (e) { /* ignore */ }
                newConsumers.delete(producerId);
              }
              return newConsumers;
            });

            const videoEl = remoteVideosRef.current.get(producerId);
            if (videoEl) {
              videoEl.srcObject = null;
              remoteVideosRef.current.delete(producerId);
            }
          });
        }
        return newPeers;
      });
    };

    const handleAudioLevel = ({ userId, userName: peerName, isTalking }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId) || createPeer(userId, peerName);
        peer.name = peer.name || peerName;
        peer.isTalking = Boolean(isTalking);
        newPeers.set(userId, peer);
        return newPeers;
      });
    };

    const handleMediaState = ({ userId, audioEnabled, videoEnabled, screenSharing }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId) || createPeer(userId);
        peer.audioEnabled = audioEnabled;
        peer.videoEnabled = videoEnabled;
        if (!screenSharing) peer.screenSharing = false;
        if (!audioEnabled) peer.isTalking = false;
        newPeers.set(userId, peer);
        return newPeers;
      });
    };

    socket.on('screen-share:started', handleScreenShareStarted);
    socket.on('screen-share:stopped', handleScreenShareStopped);
    socket.on(`${prefix}:audio-level`, handleAudioLevel);
    socket.on(`${prefix}:media-state`, handleMediaState);

    return () => {
      socket.off('screen-share:started', handleScreenShareStarted);
      socket.off('screen-share:stopped', handleScreenShareStopped);
      socket.off(`${prefix}:audio-level`, handleAudioLevel);
      socket.off(`${prefix}:media-state`, handleMediaState);
    };
  }, [socket, eventPrefix]);

  // ==========================================
  // Helpers (resolved BEFORE effects that use them)
  // ==========================================
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
        if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ==========================================
  // Resolve exact sender name using all available data sources
  // ==========================================
  const resolveSenderName = useCallback((userId: string, fallback?: string): string => {
    const currentUserId = localStorage.getItem('userId') || '';
    if (userId === currentUserId) {
      return userName;
    }

    if (fallback && String(fallback).trim() && String(fallback).trim() !== userId) {
      return String(fallback).trim();
    }

    const inParticipants = participants.find(p => p.id === userId)?.name;
    if (inParticipants && String(inParticipants).trim() && String(inParticipants).trim() !== userId) {
      return inParticipants;
    }

    const inPeers = peers.get(userId)?.name;
    if (inPeers && String(inPeers).trim() && String(inPeers).trim() !== userId) {
      return inPeers;
    }

    const inTeamMembers = teamMembers.find(m => m.id === userId)?.name;
    if (inTeamMembers && String(inTeamMembers).trim() && String(inTeamMembers).trim() !== userId) {
      return inTeamMembers;
    }

    const byTeamMember = teamMembers.find(m => String(m.id) === String(userId));
    if (byTeamMember?.name) return byTeamMember.name;

    if (fallback && String(fallback).trim()) return String(fallback);
    return userId;
  }, [participants, peers, teamMembers, userName]);

  // Listen for recording events
  useEffect(() => {
    if (!socket) return;

    const handleRecordingStarted = (recording: any) => {
      console.log('Recording started:', recording);
      setIsRecording(true);
    };

    const handleRecordingStopped = (recording: any) => {
      console.log('Recording stopped:', recording);
      setIsRecording(false);
      setRecordingDuration(0);
    };

    socket.on('recording:started', handleRecordingStarted);
    socket.on('recording:stopped', handleRecordingStopped);

    return () => {
      socket.off('recording:started', handleRecordingStarted);
      socket.off('recording:stopped', handleRecordingStopped);
    };
  }, [socket]);

  // Listen for incoming chat messages
  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = ({ userId, message, timestamp, userName: senderName, senderName: senderNameAlt }: any) => {
      const currentUserId = localStorage.getItem('userId') || '';
      if (userId === currentUserId) return;

      const exactName = resolveSenderName(userId, senderName || senderNameAlt);

      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        userId,
        userName: exactName,
        content: message,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      }]);
      AudioUtils.playNotification();
    };

    socket.on('meeting-chat:message', handleIncomingMessage);

    return () => {
      socket.off('meeting-chat:message', handleIncomingMessage);
    };
  }, [socket, resolveSenderName]);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      AudioUtils.ensureInitialized().catch(err => {
        console.warn('Failed to initialize audio:', err);
      });
      // Remove event listeners after first interaction
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
    document.addEventListener('touchstart', initAudio);
    
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // Start local media when transports are ready
  useEffect(() => {
    if (device && sendTransport) {
      startLocalMedia();
    }
  }, [device, sendTransport]);

  // Render participants list
  const renderParticipantsList = () => {
    const localUserId = localStorage.getItem('userId') || 'local';

    const mergedParticipants: Participant[] = [
      {
        id: localUserId,
        name: userName,
        isHost: isHost,
        joinedAt: new Date(),
        isLocal: true,
        status: 'joined',
        audioEnabled: isAudioEnabled,
        videoEnabled: isVideoEnabled,
        screenSharing: isScreenSharing,
        isTalking: isLocalTalking,
      },
      ...participants.filter(p => p.id !== localUserId),
    ];

    const joined = mergedParticipants.filter(p => p.status === 'joined');
    const invited = mergedParticipants.filter(p => p.status === 'invited');
    const left = mergedParticipants.filter(p => p.status === 'left');

    const renderRow = (p: Participant, showDialBack: boolean) => {
      const leftAgo = p.leftAt ? formatDistanceToNow(p.leftAt, { addSuffix: true }) : '';
      const now = Date.now();
      const lastInvite = dialBackCooldownRef.current.get(p.id) || 0;
      const cooling = now - lastInvite < 10_000;
      const cooldownSecs = cooling ? Math.ceil((10_000 - (now - lastInvite)) / 1000) : 0;

      const statusBadge = p.status === 'joined' ? (
        <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700">
          In call
        </Badge>
      ) : p.status === 'invited' ? (
        <Badge variant="secondary" className="text-[10px]">
          Invited
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Left {leftAgo}
        </Badge>
      );

      const rowClass = cn(
        "flex items-center justify-between p-2 rounded-md gap-2",
        p.status === 'left' ? "opacity-60 hover:opacity-100 hover:bg-gray-800" : "hover:bg-gray-800"
      );

      return (
        <div key={p.id} className={rowClass}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar className={cn(
              "h-8 w-8 shrink-0",
              p.isTalking && p.status === 'joined' ? talkingRingClass : avatarBaseClass
            )}>
              <AvatarFallback className="bg-blue-600 text-white text-xs">
                {getInitials(p.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                p.status === 'joined' ? "text-white" : "text-white/80"
              )}>
                {p.name}
                {p.isLocal && <span className="text-gray-400 text-xs ml-1">(You)</span>}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {p.isHost && <p className="text-[10px] text-blue-400">Host</p>}
                {statusBadge}
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {p.audioEnabled !== undefined && p.status === 'joined' && (
                  <Badge variant={p.audioEnabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4">
                    {p.audioEnabled ? "Mic" : "Muted"}
                  </Badge>
                )}
                {p.videoEnabled !== undefined && callType === 'video' && p.status === 'joined' && (
                  <Badge variant={p.videoEnabled ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4">
                    {p.videoEnabled ? "Cam" : "No Cam"}
                  </Badge>
                )}
                {p.screenSharing && p.status === 'joined' && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-green-500 text-green-400">
                    Sharing
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {showDialBack && !p.isLocal && (
              <Button
                variant={p.status === 'invited' ? "outline" : "secondary"}
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => handleDialBack(p)}
                disabled={cooling || !isHost}
                title={isHost ? (p.status === 'invited' ? 'Re-send invite' : 'Dial back to call') : 'Only host can re-invite'}
              >
                {cooling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : p.status === 'invited' ? (
                  <BellRing className="h-3.5 w-3.5" />
                ) : (
                  <Phone className="h-3.5 w-3.5" />
                )}
                {cooling
                  ? `${cooldownSecs}s`
                  : p.status === 'invited'
                    ? 'Remind'
                    : 'Dial Back'}
              </Button>
            )}
          </div>
        </div>
      );
    };

    const Section = ({ title, count, children, accent }: { title: string; count: number; children: React.ReactNode; accent?: string }) => (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h4 className={cn("text-[11px] font-semibold uppercase tracking-wider", accent || "text-gray-400")}>
            {title}
          </h4>
          <Badge variant="outline" className="text-[10px] h-5 px-2">{count}</Badge>
        </div>
        <div className="space-y-1">
          {children}
        </div>
      </div>
    );

    return (
      <div className="space-y-2">
        <Section title="In Call" count={joined.length} accent="text-emerald-400">
          {joined.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-3 text-center">Waiting for participants…</p>
          ) : (
            joined.map(p => renderRow(p, false))
          )}
        </Section>

        {invited.length > 0 && (
          <Section title="Invited" count={invited.length}>
            {invited.map(p => renderRow(p, true))}
          </Section>
        )}

        {left.length > 0 && (
          <Section title="Left" count={left.length} accent="text-rose-400">
            {left.map(p => renderRow(p, true))}
          </Section>
        )}
      </div>
    );
  };

  // Render invitation verification error
  const renderInvitationError = () => {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-2xl font-bold text-white">Invitation Error</h1>
            <p className="text-gray-300">{invitationError}</p>
          </div>
          <div className="border-t border-gray-700 pt-4">
            <Button onClick={onLeave} variant="outline" className="w-full">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render invitation verification loading
  const renderInvitationVerifying = () => {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <Loader2 className="h-12 w-12 text-blue-500 mx-auto animate-spin" />
            <h1 className="text-2xl font-bold text-white">Verifying Invitation</h1>
            <p className="text-gray-300">Please wait while we verify your invitation...</p>
          </div>
        </div>
      </div>
    );
  };

  // Render missing room ID error
  const renderMissingRoomError = () => {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-2xl font-bold text-white">Invalid Link</h1>
            <p className="text-gray-300">This invitation link is missing the room ID. Please request a new invitation.</p>
          </div>
          <div className="border-t border-gray-700 pt-4">
            <Button onClick={onLeave} variant="outline" className="w-full">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ========== RENDER: Invitation Verification States ==========
  if (isVerifyingInvitation) {
    return renderInvitationVerifying();
  }

  if (invitationError) {
    return renderInvitationError();
  }

  if (!roomId) {
    return renderMissingRoomError();
  }

  // ========== RENDER: Password Screen ==========
  if (requiresPassword) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Meeting Password Required</h1>
            <p className="text-gray-300">This meeting is password protected</p>
          </div>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Enter meeting password"
              value={enteredPassword}
              onChange={(e) => {
                setEnteredPassword(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') verifyPassword();
              }}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {passwordError && (
              <p className="text-red-400 text-sm">{passwordError}</p>
            )}
            <Button onClick={verifyPassword} className="w-full">
              Enter Meeting
            </Button>
          </div>
          <div className="border-t border-gray-700 pt-4">
            <Button onClick={leaveCall} variant="outline" className="w-full">
              Leave
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER: Waiting Room ==========
  if (isInWaitingRoom) {
    const localIsHostPresent = (() => {
      if (isHost) return true;
      return participants.some(p => p.status === 'joined' && p.isHost);
    })();

    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
            {localIsHostPresent ? (
              <p className="text-gray-300">
                Please wait — the host has been notified and will admit you shortly.
              </p>
            ) : (
              <p className="text-gray-300">
                Host has not yet started the meeting. You will be admitted automatically once they arrive.
              </p>
            )}
            {localIsHostPresent ? (
              <div className="flex items-center justify-center gap-2 pt-2 text-indigo-300 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                </span>
                Request sent to host
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 pt-2 text-amber-300 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                Waiting for host to join…
              </div>
            )}
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-3">Your name:</p>
            <p className="text-lg font-semibold text-white">{userName}</p>
          </div>
          <div className="space-y-3 text-left">
            <p className="text-sm text-gray-400">Video & audio:</p>
            <div className="flex gap-2">
              <Button onClick={toggleAudio} variant="secondary" className="flex-1" size="sm">
                {isAudioEnabled ? '🎤 Microphone On' : '🔇 Microphone Off'}
              </Button>
              <Button onClick={toggleVideo} variant="secondary" className="flex-1" size="sm">
                {isVideoEnabled ? '📹 Camera On' : '📷 Camera Off'}
              </Button>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-4">
            <Button onClick={leaveCall} variant="outline" className="w-full">
              Leave
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ========== COMPUTED: Host presence check (used for waiting-room UX copy distinction)
  // (Computed inline in waiting-room render to avoid TDZ issues with early returns.

  // ========== COMPUTED: Layout values ==========
  const remoteScreenShares = Array.from(peers.values()).flatMap(peer =>
    peer.producers
      .filter(producer => {
        const consumer = consumers.get(producer.producerId);
        return producer.kind === 'video' && consumer && isScreenShareProducer(producer, consumer);
      })
      .map(producer => ({
        peer,
        producer,
        consumer: consumers.get(producer.producerId),
      }))
  );
  const hasScreenShare = isScreenSharing || remoteScreenShares.length > 0;
  const numPeers = Array.from(peers.values()).length;
  
  const getGridCols = () => {
    if (hasScreenShare && isScreenShareExpanded) {
      return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-1';
    }
    if (numPeers <= 1) return 'grid-cols-1';
    if (numPeers <= 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  const participantGridClass = `min-h-0 flex-1 overflow-y-auto grid ${getGridCols()} gap-3 content-start p-3`;
  const participantTileClass = 'relative min-h-[150px] sm:min-h-[190px] bg-zinc-900 rounded-lg overflow-hidden aspect-video border border-white/10';
  const screenTileClass = hasScreenShare && isScreenShareExpanded
    ? 'relative min-h-[250px] sm:min-h-[320px] h-full bg-zinc-950 rounded-lg overflow-hidden border border-white/10'
    : 'relative min-h-[200px] sm:min-h-[220px] bg-zinc-950 rounded-lg overflow-hidden aspect-video border border-white/10';

  // ========== RENDER: Main Call Room ==========
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-black">
      {/* Connection Error Banner */}
      {connectionError && (
        <div className="shrink-0 z-50 bg-red-900/90 text-white px-4 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{connectionError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-white hover:bg-red-800"
            onClick={() => setConnectionError('')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Waiting for participants banner (duration state = waiting — Guide §3.2 / §4) */}
      {durationState.status === 'waiting' && durationState.maxMeetingDurationMinutes !== null && (
        <div className="shrink-0 z-40 bg-gradient-to-r from-blue-950/95 to-indigo-950/95 backdrop-blur text-blue-50 px-4 py-2 text-sm flex items-center gap-3 border-b border-blue-500/30">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <Clock className="h-4 w-4 shrink-0 text-blue-300" />
          <span className="flex-1">
            <span className="font-semibold text-blue-100">Waiting for more participants.</span>{' '}
            The {durationState.maxMeetingDurationMinutes}-minute timer will start when 2+ people join the call.
          </span>
          <Badge variant="outline" className="text-[11px] border-blue-400/40 text-blue-200 bg-blue-900/40">
            ⏳ {durationState.maxMeetingDurationMinutes} min cap
          </Badge>
        </div>
      )}
      {durationState.status === 'waiting' && durationState.maxMeetingDurationMinutes === null && (
        <div className="shrink-0 z-40 bg-gray-900/95 text-gray-100 px-4 py-2 text-sm flex items-center gap-3 border-b border-gray-700">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse shrink-0" />
          <span className="flex-1">
            Waiting for more participants to join before call begins.
          </span>
        </div>
      )}

      {/* Sticky 1-minute remaining banner (Guide §7 — sticky red) */}
      {showOneMinuteBanner && countdownDisplay && (
        <div className="shrink-0 z-[60] bg-gradient-to-r from-red-900 via-rose-900 to-red-950 text-white px-4 py-3 text-sm flex items-center gap-3 border-b-2 border-red-500/80 shadow-lg shadow-red-950/40 animate-in slide-in-from-top">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-200 animate-pulse" />
          <span className="flex-1 font-semibold text-white">
            ⚠ 1 minute remaining. This call will auto-end shortly — please wrap up.
          </span>
          <Badge variant="destructive" className="animate-pulse border-red-300 text-[11px] h-6">
            <Clock className="h-3 w-3 mr-1" />
            {timeRemaining || '00:00'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-white hover:bg-red-800/70 shrink-0"
            onClick={() => setShowOneMinuteBanner(false)}
            title="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Video grid area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Screen share area if expanded */}
          {hasScreenShare && isScreenShareExpanded && (
            <div className="flex-1 min-h-0 p-3 pb-0">
              {isScreenSharing && (
                <div className={screenTileClass}>
                  <video
                    ref={localScreenRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain bg-black"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                    {userName} (You) - Screen Share
                  </div>
                </div>
              )}
              {!isScreenSharing && remoteScreenShares.map(({ peer, producer, consumer }) => (
                <div key={producer.producerId} className={screenTileClass}>
                  {consumer?.track && (
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && consumer.track) {
                          el.srcObject = new MediaStream([consumer.track]);
                          remoteVideosRef.current.set(producer.producerId, el);
                        }
                      }}
                      className="w-full h-full object-contain bg-black"
                    />
                  )}
                  <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                    {peer.name || 'Participant'} - Screen Share
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 bg-black/60 text-white hover:bg-black/80 h-8 w-8 p-0"
                    onClick={() => setIsScreenShareExpanded(false)}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Participant video grid */}
          <div className={participantGridClass}>
            {/* Local video */}
            <div className={participantTileClass}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover bg-gray-800"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {!isVideoEnabled && (
                  <Avatar className={`h-20 w-20 ${isLocalTalking ? talkingRingClass : avatarBaseClass}`}>
                    <AvatarFallback className="bg-blue-600 text-white text-2xl">
                      {getInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                <span>{userName} (You)</span>
                {!isAudioEnabled && <MicOff className="h-3 w-3 text-red-400" />}
                {isHost && <span className="text-blue-400 text-[10px]">HOST</span>}
              </div>
            </div>

            {/* Remote participants */}
            {Array.from(peers.entries()).map(([peerId, peer]) => {
              const videoProducer = peer.producers.find(p => p.kind === 'video' && !isScreenShareProducer(p));
              const screenProducer = peer.producers.find(p => p.kind === 'video' && isScreenShareProducer(p));
              const consumer = videoProducer ? consumers.get(videoProducer.producerId) : null;
              const screenConsumer = screenProducer ? consumers.get(screenProducer.producerId) : null;

              // If screen share is not expanded and there's a screen share, show it here
              if (!isScreenShareExpanded && screenProducer && screenConsumer?.track) {
                return (
                  <div key={peerId} className={screenTileClass}>
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && screenConsumer.track) {
                          el.srcObject = new MediaStream([screenConsumer.track]);
                          remoteVideosRef.current.set(screenProducer.producerId, el);
                        }
                      }}
                      className="w-full h-full object-contain bg-black"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                      {peer.name || 'Participant'} - Screen Share
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 bg-black/60 text-white hover:bg-black/80 h-8 w-8 p-0"
                      onClick={() => setIsScreenShareExpanded(true)}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              }

              // Regular video tile
              return (
                <div key={peerId} className={participantTileClass}>
                  {consumer?.track ? (
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && consumer.track) {
                          el.srcObject = new MediaStream([consumer.track]);
                          remoteVideosRef.current.set(videoProducer.producerId, el);
                        }
                      }}
                      className="w-full h-full object-cover bg-gray-800"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <Avatar className={`h-20 w-20 ${peer.isTalking ? talkingRingClass : avatarBaseClass}`}>
                        <AvatarFallback className="bg-blue-600 text-white text-2xl">
                          {getInitials(peer.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {(!consumer?.track || peer.videoEnabled === false) && (
                      <Avatar className={`h-20 w-20 ${peer.isTalking ? talkingRingClass : avatarBaseClass}`}>
                        <AvatarFallback className="bg-blue-600 text-white text-2xl">
                          {getInitials(peer.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                    <span>{peer.name || 'Participant'}</span>
                    {peer.audioEnabled === false && <MicOff className="h-3 w-3 text-red-400" />}
                    {peer.videoEnabled === false && <VideoOff className="h-3 w-3 text-red-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Participants Panel (full-screen overlay on mobile, side panel on sm+) */}
        {showParticipants && (
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-gray-800 bg-gray-900/95 backdrop-blur-sm flex flex-col sm:static sm:z-auto sm:w-80 sm:max-w-none">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Participants ({participants.length + 1})</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowParticipants(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Echo Warning */}
                {echoWarningShown && (
                  <div className="bg-amber-900/40 border border-amber-600/40 rounded-lg p-3 space-y-1">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-300">Echo Risk Detected</p>
                        <p className="text-[11px] text-amber-200/80 leading-relaxed">
                          Multiple devices from the same user/location detected. Use headphones or mute your microphone when not speaking to avoid echo feedback loops.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Waiting Room Queue (Host Only) */}
                {isHost && waitingQueue.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Waiting Room ({waitingQueue.length})</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[11px] px-2"
                        onClick={() => {
                          socket?.emit('waiting-room:admit-all', { roomId });
                          setWaitingQueue([]);
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />Admit All
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {waitingQueue.map(item => (
                        <div key={item.userId} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 border border-blue-500/20">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="bg-blue-700 text-white text-[10px]">
                                {getInitials(item.userName || item.userId)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-xs text-white truncate">{item.userName || item.userId}</p>
                              <p className="text-[10px] text-blue-400/80">Waiting to join</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7 rounded-full bg-green-600/20 border-green-600/40 text-green-400 hover:bg-green-600/30"
                              onClick={() => {
                                socket?.emit('waiting-room:admit', {
                                  roomId,
                                  participantId: item.userId,
                                });
                                setWaitingQueue(prev => prev.filter(p => p.userId !== item.userId));
                              }}
                              title="Admit"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7 rounded-full bg-red-600/20 border-red-600/40 text-red-400 hover:bg-red-600/30"
                              onClick={() => {
                                socket?.emit('waiting-room:deny', {
                                  roomId,
                                  participantId: item.userId,
                                });
                                setWaitingQueue(prev => prev.filter(p => p.userId !== item.userId));
                              }}
                              title="Deny"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active participants */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">In Call</p>
                  {renderParticipantsList()}
                </div>
              </div>
            </ScrollArea>
            {isHost && (
              <div className="p-4 border-t border-gray-800">
                <Button 
                  onClick={() => setShowAddParticipantsModal(true)} 
                  variant="outline" 
                  className="w-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Participants
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Chat Panel (full-screen overlay on mobile, side panel on sm+) */}
        {showChat && (
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-gray-800 bg-gray-900/95 backdrop-blur-sm flex flex-col sm:static sm:z-auto sm:w-80 sm:max-w-none">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Chat</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowChat(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-gray-400 text-sm text-center">No messages yet</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-white">{msg.userName}</span>
                      <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-200 break-words">{msg.content}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button onClick={sendChatMessage} size="sm">
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="shrink-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 px-2 sm:px-4 py-3">
        <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto flex-wrap sm:flex-nowrap">
          {/* Left controls */}
          <div className="flex items-center gap-2">
            <Button
              variant={isAudioEnabled ? "secondary" : "destructive"}
              size="sm"
              onClick={toggleAudio}
              className="h-10 w-10 p-0 rounded-full"
            >
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            {callType === 'video' && (
              <Button
                variant={isVideoEnabled ? "secondary" : "destructive"}
                size="sm"
                onClick={toggleVideo}
                className="h-10 w-10 p-0 rounded-full"
              >
                {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
            )}
            <Button
              variant={isScreenSharing ? "default" : "secondary"}
              size="sm"
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className="h-10 w-10 p-0 rounded-full"
            >
              {isScreenSharing ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
            </Button>
          </div>

          {/* Center controls */}
          <div className="flex items-center gap-2">
            {/* Elapsed time in call — always shown (plan or unlimited) */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/10">
              <Timer className="h-3.5 w-3.5 text-white/70 shrink-0" />
              <span className="text-xs font-mono font-semibold tabular-nums text-white/90">{elapsedDisplay}</span>
            </div>
            {/* Countdown Badge (per FRONTEND_CALL_DURATION_GUIDE.md §5.3) */}
            {durationState.status === 'waiting' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-950/80 border border-blue-500/40">
                <Clock className="h-4 w-4 text-blue-300" />
                <span className="text-xs font-semibold text-blue-200">Waiting · Timer paused</span>
              </div>
            )}
            {countdownDisplay && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                countdownDisplay.isUrgent
                  ? "bg-red-950/90 border-red-500/60 shadow-lg shadow-red-950/50"
                  : countdownDisplay.isWarning
                    ? "bg-amber-950/90 border-amber-500/50 shadow-md shadow-amber-950/40"
                    : "bg-emerald-950/80 border-emerald-500/40"
              )}>
                <Clock className={cn(
                  "h-4 w-4 shrink-0",
                  countdownDisplay.isUrgent && "text-red-300 animate-pulse",
                  countdownDisplay.isWarning && !countdownDisplay.isUrgent && "text-amber-300",
                  !countdownDisplay.isWarning && !countdownDisplay.isUrgent && "text-emerald-300"
                )} />
                {/* Progress bar (percent-used bar) */}
                <div className="w-20 h-1.5 bg-black/40 rounded-full overflow-hidden shrink-0">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      countdownDisplay.isUrgent ? "bg-gradient-to-r from-red-500 to-rose-400"
                        : countdownDisplay.isWarning ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                          : "bg-gradient-to-r from-emerald-500 to-teal-400"
                    )}
                    style={{ width: `${Math.round(countdownDisplay.percentUsed * 100)}%` }}
                  />
                </div>
                <span className={cn(
                  "text-sm font-mono font-semibold tabular-nums",
                  countdownDisplay.isUrgent
                    ? "text-white animate-pulse"
                    : countdownDisplay.isWarning
                      ? "text-amber-100"
                      : "text-emerald-100"
                )}>
                  {countdownDisplay.hours > 0 && `${countdownDisplay.hours.toString().padStart(2, '0')}:`}
                  {countdownDisplay.minutes.toString().padStart(2, '0')}
                  :{countdownDisplay.seconds.toString().padStart(2, '0')}
                </span>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-2 text-red-400">
                <Radio className="h-4 w-4 animate-pulse" />
                <span className="text-sm font-mono">{formatDuration(recordingDuration)}</span>
              </div>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={leaveCall}
              className="h-12 px-6 rounded-full"
            >
              <PhoneOff className="h-5 w-5 mr-2" />
              Leave
            </Button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <Button
              variant={copiedInvite ? "default" : "secondary"}
              size="sm"
              onClick={handleCopyInvite}
              className="h-10 w-10 p-0 rounded-full"
              title="Copy full invite details (code, link, password)"
            >
              {copiedInvite ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
            </Button>
            {isHost && (
              <>
                <Button
                  variant={isRecording ? "destructive" : "secondary"}
                  size="sm"
                  onClick={isRecording ? stopRecording : startRecording}
                  className="h-10 w-10 p-0 rounded-full"
                  title={isRecording ? "Stop Recording" : "Start Recording"}
                >
                  <Radio className="h-5 w-5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddParticipantsModal(true)}
                  className="h-10 w-10 p-0 rounded-full"
                  title="Add Participants"
                >
                  <UserPlus className="h-5 w-5" />
                </Button>
              </>
            )}
            <Button
              variant={showParticipants ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                setShowParticipants(!showParticipants);
                if (showChat) setShowChat(false);
              }}
              className="h-10 w-10 p-0 rounded-full relative"
              title="Participants"
            >
              <Users className="h-5 w-5" />
              {(participants.length > 0 || waitingQueue.length > 0) && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {participants.length + (waitingQueue.length > 0 ? ` +${waitingQueue.length}` : '')}
                </span>
              )}
              {waitingQueue.length > 0 && !showParticipants && (
                <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-zinc-900 animate-pulse" />
              )}
            </Button>
            <Button
              variant={showChat ? "default" : "secondary"}
              size="sm"
              onClick={() => {
                setShowChat(!showChat);
                if (showParticipants) setShowParticipants(false);
              }}
              className="h-10 w-10 p-0 rounded-full relative"
              title="Chat"
            >
              <MessageSquare className="h-5 w-5" />
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {chatMessages.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Waiting room notifications for host (floating alert) */}
      {isHost && waitingQueue.length > 0 && (
        <div className="absolute top-4 right-4 w-80 bg-gradient-to-br from-blue-950/95 to-gray-900/95 backdrop-blur-xl border border-blue-500/40 rounded-xl shadow-2xl animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="p-3 border-b border-blue-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <h4 className="text-sm font-semibold text-white">Waiting Room ({waitingQueue.length})</h4>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 font-medium"
              onClick={admitAll}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Admit All
            </Button>
          </div>
          <ScrollArea className="max-h-72">
            <div className="p-2.5 space-y-2">
              {waitingQueue.map(participant => (
                <div key={participant.userId} className="flex items-center justify-between p-2.5 bg-gray-800/70 rounded-lg border border-gray-700/60 hover:bg-gray-800 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0 ring-2 ring-blue-500/20">
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-[11px] font-semibold">
                        {getInitials(participant.userName || participant.userId)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="text-sm text-white truncate block font-medium">{participant.userName || participant.userId}</span>
                      <span className="text-[10px] text-blue-300/70">
                        {participant.requestedAt ? `Waiting ${Math.max(1, Math.floor((Date.now() - participant.requestedAt) / 1000))}s` : 'Requesting to join'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/40 rounded-full bg-emerald-900/20 border border-emerald-600/30"
                      onClick={() => admitParticipant(participant.userId)}
                      title="Admit participant"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/40 rounded-full bg-red-900/20 border border-red-600/30"
                      onClick={() => denyParticipant(participant.userId)}
                      title="Deny participant"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Tap-to-enable-audio fullscreen overlay (when autoplay is blocked 2+ times) */}
      {showAudioEnableOverlay && (
        <div className="absolute inset-0 z-[9999] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-gradient-to-br from-indigo-950 to-gray-900 border border-indigo-500/40 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-4 ring-blue-500/30 shadow-lg shadow-blue-500/30 animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5z"></path>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Audio Is Blocked</h2>
              <p className="text-sm text-indigo-200/80 leading-relaxed">
                Your browser prevented automatic audio playback.<br />
                Tap the button below <strong>once</strong> to hear all participants.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleEnableAllAudio}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-base shadow-xl shadow-blue-600/40 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-100 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H2v6h4l5 4V5z"></path>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              🔊 Enable Call Audio
            </Button>
            <p className="text-[11px] text-indigo-300/60">
              This permission is required by browsers to prevent unwanted sounds. You only need to do this once.
            </p>
          </div>
        </div>
      )}

      {/* Add Participants Modal */}
      <AddParticipantsModal
        open={showAddParticipantsModal}
        onOpenChange={setShowAddParticipantsModal}
        roomId={roomId}
        roomType={meetingId ? 'meeting' : 'call'}
        currentParticipantIds={currentParticipantIds}
        allTeamMembers={teamMembers}
        inviteDetails={{
          title: inviteDetails?.title,
          code: inviteDetails?.code || roomId,
          password: inviteDetails?.password ?? null,
          waitingRoomEnabled: inviteDetails?.waitingRoomEnabled ?? propWaitingRoomEnabled,
          startTime: inviteDetails?.startTime,
        }}
        onParticipantsAdded={(participantIds) => {
          onParticipantsAdded?.(participantIds);
          toast({
            title: "Invitations Sent",
            description: `${participantIds.length} participant(s) will be invited to this call.`,
            duration: 3000,
          });
        }}
      />
    </div>
  );
}