import { useEffect, useRef, useState, useCallback } from 'react';
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
}

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: Date;
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
  
  // Call duration state
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [maxMeetingDuration, setMaxMeetingDuration] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  
  // Countdown interval ref
  const countdownIntervalRef = useRef<number | null>(null);

  // Room state
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(!isHost && waitingRoomEnabled);
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [connectionError, setConnectionError] = useState('');

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
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const lastLocalTalkingRef = useRef(false);
  const audioEnabledRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
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
  
  const { socket, isConnected, joinMeeting, joinCall, leaveMeeting, startScreenShare: emitScreenShareStart, stopScreenShare: emitScreenShareStop, startRecording: emitRecordingStart, stopRecording: emitRecordingStop, sendMeetingChat } = useSocket({
    userId: localStorage.getItem('userId') || '',
    businessId: localStorage.getItem('businessId') || '',
  });

  const { toast } = useToast();

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

  // Listen for participant events
  useEffect(() => {
    if (!socket) return;
    
    const handleParticipantJoined = ({ userId, userName: name, isHost: hostStatus }: any) => {
      if (!isMountedRef.current) return;
      
      setParticipants(prev => {
        // Don't add if already exists
        if (prev.some(p => p.id === userId)) return prev;
        
        return [...prev, {
          id: userId,
          name: name || 'Unknown',
          isHost: hostStatus || false,
          joinedAt: new Date()
        }];
      });
    };
    
    const handleParticipantLeft = ({ userId }: any) => {
      if (!isMountedRef.current) return;
      setParticipants(prev => prev.filter(p => p.id !== userId));
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
      
      setParticipants((data.participantsList || data.participants_list || []).map((p: any) => ({
        id: p.userId || p.user_id || p.id,
        name: p.userName || p.user_name || p.name || 'Unknown',
        isHost: p.isHost || p.is_host || false,
        joinedAt: p.joinedAt || p.joined_at ? new Date(p.joinedAt || p.joined_at) : new Date()
      })));
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
    
    socket.on('call:participant-joined', handleParticipantJoined);
    socket.on('call:participant-left', handleParticipantLeft);
    socket.on('call:participants-list', handleParticipantsList);
    socket.on('invitation:joined', handleInvitationJoined);
    socket.on('call:participant-media-state', handleParticipantMediaState);
    socket.on('call:ended', () => {
      // Cleanup countdown
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Show toast
      toast({
        title: "Call Ended",
        description: "The call has ended due to duration limit.",
        duration: 3000,
      });
      // Leave the call
      leaveCall();
    });
    
    return () => {
      socket.off('call:participant-joined', handleParticipantJoined);
      socket.off('call:participant-left', handleParticipantLeft);
      socket.off('call:participants-list', handleParticipantsList);
      socket.off('invitation:joined', handleInvitationJoined);
      socket.off('call:participant-media-state', handleParticipantMediaState);
      socket.off('call:ended');
    };
  }, [socket, toast]);

  // Join meeting/call when connected and not in waiting room or password screen
  useEffect(() => {
    if (!socket || !isConnected || !roomId || isInWaitingRoom || requiresPassword || isVerifyingInvitation || hasJoinedRef.current) return;
    
    hasJoinedRef.current = true;
    
    // Join the room
    if (meetingId) {
      joinMeeting(roomId);
    } else {
      joinCall(roomId);
    }
    
    // Request the current participants list
      socket.emit('call:get-participants', { roomId }, (response: any) => {
        if (!isMountedRef.current) return;
        
        if (response?.error) {
          console.error('Error fetching participants:', response.error);
          return;
        }
        
        const endsAtVal = response?.endsAt || response?.ends_at;
        if (endsAtVal) {
          setEndsAt(new Date(endsAtVal));
        }
        const maxDurationVal = response?.maxMeetingDuration || response?.max_meeting_duration;
        if (maxDurationVal) {
          setMaxMeetingDuration(maxDurationVal);
        }
        
        if (response?.participants || response?.participants_list) {
          const participantsList = response.participants || response.participants_list;
          setParticipants(participantsList.map((p: any) => ({
            id: p.userId || p.user_id || p.id,
            name: p.userName || p.user_name || p.name || 'Unknown',
            isHost: p.isHost || p.is_host || false,
            joinedAt: p.joinedAt || p.joined_at ? new Date(p.joinedAt || p.joined_at) : new Date(),
            audioEnabled: p.audioEnabled || p.audio_enabled,
            videoEnabled: p.videoEnabled || p.video_enabled,
            screenSharing: p.screenSharing || p.screen_sharing,
          })));
        }
      });
    
    // Notify others that we've joined
    socket.emit('call:join', { 
      roomId, 
      userId: localStorage.getItem('userId') || '',
      userName,
      isHost,
      audioEnabled: isAudioEnabled,
      videoEnabled: isVideoEnabled,
    });
    
    // If we came from an invitation, notify others
    if (invitationToken) {
      socket.emit('invitation:joined', { 
        roomId, 
        userId: localStorage.getItem('userId') || '',
        userName 
      });
    }

    return () => {
      if (socket && isConnected && roomId && meetingId) {
        leaveMeeting(roomId);
      }
      hasJoinedRef.current = false;
    };
  }, [socket, isConnected, roomId, isInWaitingRoom, requiresPassword, isVerifyingInvitation, meetingId, joinMeeting, joinCall, leaveMeeting, userName, isHost, isAudioEnabled, isVideoEnabled, invitationToken]);

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
    if (!socket || !roomId) return;
    
    const state = {
      roomId,
      audioEnabled: nextState.audioEnabled ?? isAudioEnabled,
      videoEnabled: nextState.videoEnabled ?? isVideoEnabled,
      screenSharing: nextState.screenSharing ?? isScreenSharing,
    };
    
    socket.emit('call:media-state', state);
    // Also emit to update participant list
    socket.emit('call:participant-media-state', {
      roomId,
      userId: localStorage.getItem('userId') || '',
      ...state,
    });
  }, [socket, roomId, isAudioEnabled, isVideoEnabled, isScreenSharing]);

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
      document.body.removeChild(audioEl);
      remoteAudiosRef.current.delete(producerId);
    }
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
          const audioEl = document.createElement('audio');
          audioEl.srcObject = new MediaStream([consumer.track]);
          audioEl.autoplay = true;
          document.body.appendChild(audioEl);
          remoteAudiosRef.current.set(prodId, audioEl);
        }

        consumer.on('trackended', () => {
          console.log('Consumer track ended:', prodId);
          const audioEl = remoteAudiosRef.current.get(prodId);
          if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
            document.body.removeChild(audioEl);
            remoteAudiosRef.current.delete(prodId);
          }
          removeProducerFromPeerRef.current(prodId);
        });

        consumer.on('transportclose', () => {
          console.log('Consumer transport closed:', prodId);
          const audioEl = remoteAudiosRef.current.get(prodId);
          if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
            document.body.removeChild(audioEl);
            remoteAudiosRef.current.delete(prodId);
          }
          removeProducerFromPeerRef.current(prodId);
        });

        socket.emit('mediasoup:resume', { consumerId: id, roomId }, (resumeResponse: any) => {
          if (resumeResponse?.error) {
            setConnectionError(resumeResponse.error);
            return;
          }
          console.log('Consumer resumed');
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      
      localAudioStreamRef.current = stream;
      localMediaStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

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
          socket?.emit('call:audio-level', { roomId, isTalking: talking, userName });
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

  const leaveCall = async () => {
    if (isRecording) await stopRecording();
    stopLocalMedia();
    
    // Cleanup countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    consumers.forEach(consumer => { try { consumer.close(); } catch (e) { /* ignore */ } });
    sendTransport?.close();
    recvTransport?.close();
    
    // Notify others that we're leaving
    socket?.emit('call:leave', { 
      roomId, 
      userId: localStorage.getItem('userId') || '',
      userName 
    });
    
    socket?.emit('call:audio-level', { roomId, isTalking: false, userName });
    socket?.emit('call:media-state', {
      roomId,
      audioEnabled: false,
      videoEnabled: false,
      screenSharing: false,
    });
    onLeave();
  };

  const sendChatMessage = () => {
    if (!socket || !chatInput.trim() || !roomId) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      userId: localStorage.getItem('userId') || '',
      userName,
      content: chatInput.trim(),
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, message]);
    sendMeetingChat(roomId, chatInput.trim());
    setChatInput('');
  };

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
    socket.emit('waiting-room:admit', { meetingId: roomId, participantId });
    setWaitingRoomParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const denyParticipant = (participantId: string) => {
    if (!socket || !roomId) return;
    socket.emit('waiting-room:deny', { meetingId: roomId, participantId });
    setWaitingRoomParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const admitAll = () => {
    if (!socket || !roomId) return;
    waitingRoomParticipants.forEach(p => {
      socket.emit('waiting-room:admit', { meetingId: roomId, participantId: p.id });
    });
    setWaitingRoomParticipants([]);
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
    const handleWaitingRoomRequest = ({ participantId, participantName }: any) => {
      setWaitingRoomParticipants(prev => [...prev, { id: participantId, name: participantName }]);
    };
    const handleAdmitted = () => setIsInWaitingRoom(false);

    socket.on('room:passwordRequired', handlePasswordRequired);
    socket.on('waiting-room:request', handleWaitingRoomRequest);
    socket.on('waiting-room:admitted', handleAdmitted);

    return () => {
      socket.off('room:passwordRequired', handlePasswordRequired);
      socket.off('waiting-room:request', handleWaitingRoomRequest);
      socket.off('waiting-room:admitted', handleAdmitted);
    };
  }, [socket]);

  // Listen for screen share and media state events
  useEffect(() => {
    if (!socket) return;

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
    socket.on('call:audio-level', handleAudioLevel);
    socket.on('call:media-state', handleMediaState);

    return () => {
      socket.off('screen-share:started', handleScreenShareStarted);
      socket.off('screen-share:stopped', handleScreenShareStopped);
      socket.off('call:audio-level', handleAudioLevel);
      socket.off('call:media-state', handleMediaState);
    };
  }, [socket]);

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

    const handleIncomingMessage = ({ userId, message, timestamp, userName: senderName }: any) => {
      const currentUserId = localStorage.getItem('userId') || '';
      if (userId === currentUserId) return;

      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        userId,
        userName: senderName || userId,
        content: message,
        timestamp: new Date(timestamp)
      }]);
      AudioUtils.playNotification();
    };

    socket.on('meeting-chat:message', handleIncomingMessage);

    return () => {
      socket.off('meeting-chat:message', handleIncomingMessage);
    };
  }, [socket]);

  // Start local media when transports are ready
  useEffect(() => {
    if (device && sendTransport) {
      startLocalMedia();
    }
  }, [device, sendTransport]);

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

  // Render participants list
  const renderParticipantsList = () => {
    // Combine local user with remote participants
    const allParticipants: Participant[] = [
      {
        id: localStorage.getItem('userId') || 'local',
        name: userName,
        isHost: isHost,
        joinedAt: new Date(),
        isLocal: true,
        audioEnabled: isAudioEnabled,
        videoEnabled: isVideoEnabled,
        screenSharing: isScreenSharing,
        isTalking: isLocalTalking,
      },
      ...participants
    ];
    
    return (
      <div className="space-y-2">
        {allParticipants.map(participant => (
          <div key={participant.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-800">
            <div className="flex items-center gap-3">
              <Avatar className={`h-8 w-8 ${participant.isTalking ? talkingRingClass : avatarBaseClass}`}>
                <AvatarFallback className="bg-blue-600 text-white text-xs">
                  {getInitials(participant.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-white">
                  {participant.name}
                  {participant.isLocal && <span className="text-gray-400 text-xs ml-1">(You)</span>}
                </p>
                {participant.isHost && (
                  <p className="text-xs text-blue-400">Host</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {participant.audioEnabled !== undefined && (
                <Badge variant={participant.audioEnabled ? "default" : "secondary"} className="text-xs">
                  {participant.audioEnabled ? "Mic On" : "Mic Off"}
                </Badge>
              )}
              {participant.videoEnabled !== undefined && callType === 'video' && (
                <Badge variant={participant.videoEnabled ? "default" : "secondary"} className="text-xs">
                  {participant.videoEnabled ? "Camera On" : "Camera Off"}
                </Badge>
              )}
              {participant.screenSharing && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                  Sharing
                </Badge>
              )}
            </div>
          </div>
        ))}
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
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-black items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
            <p className="text-gray-300">Please wait for the host to admit you</p>
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

        {/* Participants Panel */}
        {showParticipants && (
          <div className="w-80 border-l border-gray-800 bg-gray-900/95 backdrop-blur-sm flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Participants ({participants.length + 1})</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowParticipants(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4">
                {renderParticipantsList()}
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

        {/* Chat Panel */}
        {showChat && (
          <div className="w-80 border-l border-gray-800 bg-gray-900/95 backdrop-blur-sm flex flex-col">
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
      <div className="shrink-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
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
            {timeRemaining && (
              <div className="flex items-center gap-2 text-yellow-400">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-mono">{timeRemaining}</span>
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
              {participants.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {participants.length}
                </span>
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

      {/* Waiting room notifications for host */}
      {isHost && waitingRoomParticipants.length > 0 && (
        <div className="absolute top-4 right-4 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Waiting Room ({waitingRoomParticipants.length})</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
              onClick={admitAll}
            >
              Admit All
            </Button>
          </div>
          <ScrollArea className="max-h-60">
            <div className="p-2 space-y-2">
              {waitingRoomParticipants.map(participant => (
                <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                        {getInitials(participant.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-white">{participant.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                      onClick={() => admitParticipant(participant.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={() => denyParticipant(participant.id)}
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

      {/* Add Participants Modal */}
      <AddParticipantsModal
        open={showAddParticipantsModal}
        onOpenChange={setShowAddParticipantsModal}
        roomId={roomId}
        roomType={meetingId ? 'meeting' : 'call'}
        currentParticipantIds={currentParticipantIds}
        allTeamMembers={teamMembers}
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