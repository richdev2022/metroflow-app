import { useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { useSocket } from '../hooks/useSocket';
import { Button } from './ui/button';
import { api } from '../lib/api-client';
import { unwrapApiData } from '../lib/api-response';
import { Maximize2, Mic, MicOff, Minimize2, PhoneOff, Radio, ScreenShare, ScreenShareOff, MessageSquare, UserPlus, Users, Video, VideoOff, X } from 'lucide-react';
import type { Recording, TeamMember } from '@shared/api';
import { Avatar, AvatarFallback } from './ui/avatar';

interface VideoCallRoomProps {
  roomId: string;
  onLeave: () => void;
  userName: string;
  isHost: boolean;
  waitingRoomEnabled: boolean;
  meetingId?: string;
  callId?: string;
  callType?: 'audio' | 'video';
  teamMembers?: TeamMember[];
  currentParticipantIds?: string[];
  onParticipantsAdded?: (participantIds: string[]) => void;
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

export default function VideoCallRoom({
  roomId,
  onLeave,
  userName,
  isHost,
  waitingRoomEnabled,
  meetingId,
  callId,
  callType = 'video',
  teamMembers = [],
  currentParticipantIds = [],
  onParticipantsAdded,
}: VideoCallRoomProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [sendTransport, setSendTransport] = useState<types.Transport | null>(null);
  const [recvTransport, setRecvTransport] = useState<types.Transport | null>(null);
  const [localAudioProducer, setLocalAudioProducer] = useState<types.Producer | null>(null);
  const [localVideoProducer, setLocalVideoProducer] = useState<types.Producer | null>(null);
  const [localScreenProducer, setLocalScreenProducer] = useState<types.Producer | null>(null);
  const [consumers, setConsumers] = useState<Map<string, types.Consumer>>(new Map());
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(!isHost && waitingRoomEnabled);
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [isAddingParticipants, setIsAddingParticipants] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; userId: string; userName: string; content: string; timestamp: Date }>>([]);
  const [isLocalTalking, setIsLocalTalking] = useState(false);
  const [isScreenShareExpanded, setIsScreenShareExpanded] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
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
  
  const { socket, isConnected, joinMeeting, joinCall, leaveMeeting, startScreenShare: emitScreenShareStart, stopScreenShare: emitScreenShareStop, startRecording: emitRecordingStart, stopRecording: emitRecordingStop, sendMeetingChat } = useSocket({
    userId: localStorage.getItem('userId') || '',
    businessId: localStorage.getItem('businessId') || '',
  });

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

  const emitMediaState = (nextState: Partial<{ audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean }>) => {
    socket?.emit('call:media-state', {
      roomId,
      audioEnabled: nextState.audioEnabled ?? isAudioEnabled,
      videoEnabled: nextState.videoEnabled ?? isVideoEnabled,
      screenSharing: nextState.screenSharing ?? isScreenSharing,
    });
  };

  useEffect(() => {
    audioEnabledRef.current = isAudioEnabled;
  }, [isAudioEnabled]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Stop all media tracks
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach(track => track.stop());
        localMediaStreamRef.current = null;
      }
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach(track => track.stop());
        localAudioStreamRef.current = null;
      }
      if (localVideoRef.current?.srcObject) {
        (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      if (localScreenRef.current?.srcObject) {
        (localScreenRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      
      // Close transports
      if (sendTransport) {
        try {
          sendTransport.close();
        } catch (e) { /* ignore */ }
      }
      if (recvTransport) {
        try {
          recvTransport.close();
        } catch (e) { /* ignore */ }
      }
      
      // Close producers
      if (localAudioProducer) {
        try {
          localAudioProducer.close();
        } catch (e) { /* ignore */ }
      }
      if (localVideoProducer) {
        try {
          localVideoProducer.close();
        } catch (e) { /* ignore */ }
      }
      if (localScreenProducer) {
        try {
          localScreenProducer.close();
        } catch (e) { /* ignore */ }
      }
      
      // Close all consumers
      consumers.forEach(consumer => {
        try {
          consumer.close();
        } catch (e) { /* ignore */ }
      });
    };
  }, []);

  // Initialize device and get router capabilities
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    let isMounted = true;

    const initializeDevice = async () => {
      try {
        const newDevice = new Device();
        
        socket.emit('mediasoup:getRouterRtpCapabilities', { roomId }, (response: any) => {
          if (!isMounted) return;
          
          if (response?.error) {
            setConnectionError(response.error);
            return;
          }

          const routerRtpCapabilities = response.routerRtpCapabilities || response.rtpCapabilities;
          
          newDevice.load({ routerRtpCapabilities })
            .then(() => {
              if (isMounted) {
                setDevice(newDevice);
                setConnectionError('');
              }
            })
            .catch((error) => {
              if (isMounted) {
                console.error('Error loading device:', error);
                setConnectionError('Unable to initialize media device for this room.');
              }
            });
        });
      } catch (error) {
        if (isMounted) {
          console.error('Error initializing device:', error);
        }
      }
    };

    initializeDevice();

    // Listen for new producers from other peers
    const handleNewProducer = ({ producerId, kind, peerId, peerName, appData }: any) => {
      if (!isMounted) return;
      console.log('New producer:', producerId, kind, 'from peer:', peerId);
      
      setPeers(prev => {
        const newPeers = new Map(prev);
        const resolvedPeerId = peerId || producerId;
        const peer = newPeers.get(resolvedPeerId) || { id: resolvedPeerId, producers: [], name: peerName };
        if (!peer.producers.some(producer => producer.producerId === producerId)) {
          peer.producers.push({ producerId, kind, appData });
        }
        if (appData?.screenShare) peer.screenSharing = true;
        newPeers.set(resolvedPeerId, peer);
        return newPeers;
      });
      
      // If we have a recv transport, consume this producer
      if (recvTransport) {
        consume(producerId, kind);
      }
    };

    socket.on('mediasoup:newProducer', handleNewProducer);

    return () => {
      isMounted = false;
      socket.off('mediasoup:newProducer', handleNewProducer);
      // Clean up device, transports, producers, consumers
      setDevice(null);
      setSendTransport(null);
      setRecvTransport(null);
    };
  }, [socket, isConnected, roomId]);

  // Create transports when device is ready
  useEffect(() => {
    if (!device || !socket || !isConnected) return;
    
    let isMounted = true;

    const createTransports = async () => {
      // Create send transport
      socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'send' }, async (response: any) => {
        if (!isMounted) return;
        
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
          if (!isMounted) return;
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
          if (!isMounted) return;
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

        setSendTransport(transport);
      });

      // Create recv transport
      socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'recv' }, async (response: any) => {
        if (!isMounted) return;
        
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
          if (!isMounted) return;
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

        setRecvTransport(transport);
      });
    };

    createTransports();
    
    return () => {
      isMounted = false;
    };
  }, [device, socket, isConnected, roomId]);

  // When recv transport is ready, consume any existing producers
  useEffect(() => {
    if (!recvTransport || !socket) return;

    socket.emit('mediasoup:getProducers', { roomId }, (response: any) => {
      if (response?.error) {
        setConnectionError(response.error);
        return;
      }

      (response.producers || []).forEach(({ producerId, kind, peerId, peerName, appData }: any) => {
        setPeers(prev => {
          const newPeers = new Map(prev);
          const resolvedPeerId = peerId || producerId;
          const peer = newPeers.get(resolvedPeerId) || { id: resolvedPeerId, producers: [], name: peerName };
          if (!peer.producers.some(producer => producer.producerId === producerId)) {
            peer.producers.push({ producerId, kind, appData });
          }
          if (appData?.screenShare) peer.screenSharing = true;
          newPeers.set(resolvedPeerId, peer);
          return newPeers;
        });

        if (!consumers.has(producerId)) {
          consume(producerId, kind);
        }
      });
    });
  }, [recvTransport, socket, roomId]);

  const consume = async (producerId: string, kind: types.MediaKind) => {
    if (!recvTransport || !device || !socket) return;

    try {
      socket.emit('mediasoup:consume', {
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.recvRtpCapabilities,
        roomId
      }, async (response: any) => {
        if (response?.error) {
          setConnectionError(response.error);
          return;
        }

        const { id, rtpParameters, producerId: prodId, appData } = response;
        
        const consumer = await recvTransport.consume({
          id,
          producerId: prodId,
          kind,
          rtpParameters,
          appData,
        });

        // Resume the consumer
        socket.emit('mediasoup:resume', { consumerId: id, roomId }, (response: any) => {
          if (response?.error) {
            setConnectionError(response.error);
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

      // Attach local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Set up audio analysis for talking detection
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const source = audioContext.createMediaStreamSource(stream);
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      source.connect(analyserRef.current);
      
      // Start animation loop to check audio levels
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
        
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };
      checkAudioLevel();

      // Produce audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { userName }
        });
        setLocalAudioProducer(audioProducer);
      }

      // Produce video
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
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (localAudioProducer) {
      localAudioProducer.close();
      setLocalAudioProducer(null);
    }
    if (localVideoProducer) {
      localVideoProducer.close();
      setLocalVideoProducer(null);
    }
    if (localScreenProducer) {
      localScreenProducer.close();
      setLocalScreenProducer(null);
    }
    if (localMediaStreamRef.current) {
      localMediaStreamRef.current.getTracks().forEach(track => track.stop());
      localMediaStreamRef.current = null;
    }
    if (localScreenRef.current?.srcObject) {
      const tracks = (localScreenRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      localScreenRef.current.srcObject = null;
    }
    if (localVideoRef.current?.srcObject) {
      const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }
    localAudioStreamRef.current = null;
    lastLocalTalkingRef.current = false;
    setIsLocalTalking(false);
  };

  const toggleAudio = () => {
    if (localAudioProducer) {
      if (isAudioEnabled) {
        localAudioProducer.pause();
        // Also mute the track for good measure
        if (localAudioStreamRef.current) {
          localAudioStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
        }
      } else {
        localAudioProducer.resume();
        // Unmute the track
        if (localAudioStreamRef.current) {
          localAudioStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
        }
      }
      const nextAudioEnabled = !isAudioEnabled;
      setIsAudioEnabled(nextAudioEnabled);
      if (!nextAudioEnabled) {
        lastLocalTalkingRef.current = false;
        setIsLocalTalking(false);
        socket?.emit('call:audio-level', { roomId, isTalking: false, userName });
      }
      emitMediaState({ audioEnabled: nextAudioEnabled });
    }
  };

  const toggleVideo = () => {
    if (localVideoProducer) {
      if (isVideoEnabled) {
        localVideoProducer.pause();
        // Disable video track
        if (localMediaStreamRef.current) {
          localMediaStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = false;
          });
        }
      } else {
        localVideoProducer.resume();
        // Enable video track
        if (localMediaStreamRef.current) {
          localMediaStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = true;
          });
        }
      }
      const nextVideoEnabled = !isVideoEnabled;
      setIsVideoEnabled(nextVideoEnabled);
      emitMediaState({ videoEnabled: nextVideoEnabled });
    }
  };

  const startScreenShare = async () => {
    if (!sendTransport) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      if (localScreenRef.current) {
        localScreenRef.current.srcObject = stream;
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
    if (localScreenProducer) {
      localScreenProducer.close();
      setLocalScreenProducer(null);
    }
    if (localScreenRef.current?.srcObject) {
      const tracks = (localScreenRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsScreenSharing(false);
    emitScreenShareStop(roomId);
    emitMediaState({ screenSharing: false });
  };

  const leaveCall = async () => {
    if (isRecording) {
      await stopRecording();
    }
    stopLocalMedia();
    consumers.forEach(consumer => consumer.close());
    sendTransport?.close();
    recvTransport?.close();
    socket?.emit('call:audio-level', { roomId, isTalking: false, userName });
    socket?.emit('call:media-state', {
      roomId,
      audioEnabled: false,
      videoEnabled: false,
      screenSharing: false,
    });
    onLeave();
  };

  const sendChatMessage = (content: string) => {
    if (!socket) return;

    const message = {
      id: Date.now().toString(),
      userId: localStorage.getItem('userId') || '',
      userName,
      content,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, message]);
    sendMeetingChat(roomId, content);
  };

  const verifyPassword = () => {
    if (!enteredPassword.trim()) {
      setPasswordError('Please enter a password');
      return;
    }

    if (!socket) return;

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
    if (!socket) return;
    socket.emit('waiting-room:admit', { meetingId: roomId, participantId });
    setWaitingRoomParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const denyParticipant = (participantId: string) => {
    if (!socket) return;
    socket.emit('waiting-room:deny', { meetingId: roomId, participantId });
    setWaitingRoomParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const admitAll = () => {
    if (!socket) return;
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

  const startLocalRecorder = () => {
    const stream = localVideoRef.current?.srcObject as MediaStream | null;
    if (!stream || typeof MediaRecorder === 'undefined') return;

    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.start(1000);
    mediaRecorderRef.current = recorder;
  };

  const stopLocalRecorder = () => {
    return new Promise<{ storageUrl: string; size: number; blob?: Blob }>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve({ storageUrl: '', size: 0 });
        return;
      }

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const storageUrl = blob.size > 0 ? await blobToDataUrl(blob) : '';
        mediaRecorderRef.current = null;
        // Don't clear chunks here - we'll clear them in stopRecording
        resolve({ storageUrl, size: blob.size, blob });
      };

      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        recorder.onstop?.(new Event('stop'));
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
      startLocalRecorder();
      emitRecordingStart(roomId);
    } catch (error) {
      console.error('Error starting recording:', error);
      setConnectionError('Recording could not be started.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    const { storageUrl, size, blob } = await stopLocalRecorder();

    if (!activeRecording) {
      setIsRecording(false);
      emitRecordingStop(roomId);
      recordedChunksRef.current = [];
      return;
    }

    try {
      const duration = recordingDuration;
      
      // Create form data
      const formData = new FormData();
      
      // If we have the blob, add it as file
      if (blob) {
        formData.append('file', blob, `recording-${activeRecording.id}.webm`);
      }
      
      // Add duration
      formData.append('duration', duration.toString());
      
      // Upload the recording
      await api.post(`/recordings/${activeRecording.id}/upload`, formData);
      
      setActiveRecording(null);
      setIsRecording(false);
      setRecordingDuration(0);
      emitRecordingStop(roomId);
      recordedChunksRef.current = [];
    } catch (error) {
      console.error('Error stopping recording:', error);
      setConnectionError('Recording could not be saved.');
      recordedChunksRef.current = [];
    }
  };

  const addParticipantsToCall = async () => {
    if (!callId || selectedInvitees.length === 0) return;

    setIsAddingParticipants(true);
    try {
      await api.post(`/calls/${callId}/participants`, {
        participantIds: selectedInvitees,
      });

      selectedInvitees.forEach(targetUserId => {
        socket?.emit('call:invite', { callId, targetUserId, type: callType });
      });

      onParticipantsAdded?.(selectedInvitees);
      setSelectedInvitees([]);
    } catch (error) {
      console.error('Error adding participants:', error);
      setConnectionError('Could not add participants to this call.');
    } finally {
      setIsAddingParticipants(false);
    }
  };

  const inviteableMembers = teamMembers.filter(member => {
    const currentUserId = localStorage.getItem('userId') || '';
    return member.id !== currentUserId && !currentParticipantIds.includes(member.id);
  });

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

    const handlePasswordRequired = () => {
      setRequiresPassword(true);
    };

    const handleWaitingRoomRequest = ({ participantId, participantName }: any) => {
      setWaitingRoomParticipants(prev => [...prev, { id: participantId, name: participantName }]);
    };

    const handleAdmitted = () => {
      setIsInWaitingRoom(false);
    };

    socket.on('room:passwordRequired', handlePasswordRequired);
    socket.on('waiting-room:request', handleWaitingRoomRequest);
    socket.on('waiting-room:admitted', handleAdmitted);

    return () => {
      socket.off('room:passwordRequired', handlePasswordRequired);
      socket.off('waiting-room:request', handleWaitingRoomRequest);
      socket.off('waiting-room:admitted', handleAdmitted);
    };
  }, [socket]);

  // Listen for screen share events
  useEffect(() => {
    if (!socket) return;

    const handleScreenShareStarted = ({ userId, userName: peerName }: any) => {
      console.log('Screen share started by:', peerName);
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer: Peer = newPeers.get(userId) || { id: userId, producers: [], name: peerName };
        peer.name = peer.name || peerName;
        peer.screenSharing = true;
        newPeers.set(userId, peer);
        return newPeers;
      });
    };

    const handleScreenShareStopped = ({ userId }: any) => {
      console.log('Screen share stopped by:', userId);
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(userId);
        if (peer) {
          peer.screenSharing = false;
          newPeers.set(userId, peer);
        }
        return newPeers;
      });
    };

    const handleAudioLevel = ({ userId, userName: peerName, isTalking }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer: Peer = newPeers.get(userId) || { id: userId, producers: [], name: peerName };
        peer.name = peer.name || peerName;
        peer.isTalking = Boolean(isTalking);
        newPeers.set(userId, peer);
        return newPeers;
      });
    };

    const handleMediaState = ({ userId, audioEnabled, videoEnabled, screenSharing }: any) => {
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer: Peer = newPeers.get(userId) || { id: userId, producers: [] };
        peer.audioEnabled = audioEnabled;
        peer.videoEnabled = videoEnabled;
        peer.screenSharing = screenSharing;
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

    const handleRecordingPaused = (recording: any) => {
      console.log('Recording paused:', recording);
    };

    const handleRecordingStopped = (recording: any) => {
      console.log('Recording stopped:', recording);
      setIsRecording(false);
      setRecordingDuration(0);
    };

    socket.on('recording:started', handleRecordingStarted);
    socket.on('recording:paused', handleRecordingPaused);
    socket.on('recording:stopped', handleRecordingStopped);

    return () => {
      socket.off('recording:started', handleRecordingStarted);
      socket.off('recording:paused', handleRecordingPaused);
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
    };

    socket.on('meeting-chat:message', handleIncomingMessage);

    return () => {
      socket.off('meeting-chat:message', handleIncomingMessage);
    };
  }, [socket]);

  // Join meeting/call when connected
  useEffect(() => {
    if (socket && isConnected && roomId && !isInWaitingRoom && !requiresPassword) {
      if (meetingId) {
        joinMeeting(roomId);
      } else {
        joinCall(roomId);
      }
    }

    return () => {
      if (socket && isConnected && roomId) {
        if (meetingId) {
          leaveMeeting(roomId);
        }
      }
    };
  }, [socket, isConnected, roomId, isInWaitingRoom, requiresPassword, joinMeeting, joinCall, leaveMeeting, meetingId]);

  // Start local media when component mounts
  useEffect(() => {
    if (device && sendTransport) {
      startLocalMedia();
    }
  }, [device, sendTransport]);

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
                if (e.key === 'Enter') {
                  verifyPassword();
                }
              }}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {passwordError && (
              <p className="text-red-400 text-sm">{passwordError}</p>
            )}

            <Button
              onClick={verifyPassword}
              className="w-full"
            >
              Enter Meeting
            </Button>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <Button
              onClick={leaveCall}
              variant="outline"
              className="w-full"
            >
              Leave
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
              <Button
                onClick={toggleAudio}
                variant="secondary"
                className="flex-1"
                size="sm"
              >
                {isAudioEnabled ? '🎤 Microphone On' : '🔇 Microphone Off'}
              </Button>
              <Button
                onClick={toggleVideo}
                variant="secondary"
                className="flex-1"
                size="sm"
              >
                {isVideoEnabled ? '📹 Camera On' : '📷 Camera Off'}
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <Button
              onClick={leaveCall}
              variant="outline"
              className="w-full"
            >
              Leave
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
  const participantGridClass = hasScreenShare && isScreenShareExpanded
    ? 'min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 content-start pr-1'
    : 'min-h-0 flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 content-start';
  const participantTileClass = 'relative min-h-[190px] bg-zinc-900 rounded-lg overflow-hidden aspect-video border border-white/10';
  const screenTileClass = hasScreenShare && isScreenShareExpanded
    ? 'relative min-h-[320px] h-full bg-zinc-950 rounded-lg overflow-hidden border border-white/10'
    : 'relative min-h-[220px] bg-zinc-950 rounded-lg overflow-hidden aspect-video border border-white/10';

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-black">
      {connectionError && (
        <div className="bg-red-950 text-red-100 px-4 py-2 text-sm text-center">
          {connectionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={`h-full min-h-0 gap-3 p-3 sm:p-4 ${hasScreenShare && isScreenShareExpanded ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,26rem)]' : 'flex flex-col'}`}>
          {hasScreenShare && (
            <div className={`${screenTileClass} ${isScreenShareExpanded ? 'xl:min-h-0' : ''}`}>
              <div className={`grid h-full gap-3 ${remoteScreenShares.length + (isScreenSharing ? 1 : 0) > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                {remoteScreenShares.map(({ peer, producer, consumer }) => (
                  <div key={`screen-${peer.id}-${producer.producerId}`} className="relative min-h-[220px] overflow-hidden rounded-lg bg-zinc-950">
                    <video
                      ref={(el) => {
                        if (el) {
                          remoteVideosRef.current.set(producer.producerId, el);
                          if (consumer?.track) {
                            const stream = new MediaStream([consumer.track]);
                            el.srcObject = stream;
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      className="h-full w-full object-contain"
                    />
                    <div className="absolute bottom-3 left-3 rounded-md bg-black/80 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">
                      {peer.name || peer.id}'s Screen
                    </div>
                  </div>
                ))}
                {isScreenSharing && (
                  <div className="relative min-h-[220px] overflow-hidden rounded-lg bg-slate-950">
                    <video
                      ref={localScreenRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-contain"
                    />
                    <div className="absolute bottom-3 left-3 rounded-md bg-black/80 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">
                      Your Screen
                    </div>
                  </div>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/70 text-white hover:bg-black/90"
                onClick={() => setIsScreenShareExpanded(prev => !prev)}
                aria-label={isScreenShareExpanded ? 'Collapse screen share preview' : 'Expand screen share preview'}
                title={isScreenShareExpanded ? 'Collapse screen share preview' : 'Expand screen share preview'}
              >
                {isScreenShareExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </Button>
            </div>
          )}

          <div className={participantGridClass}>
            {/* Local video */}
            <div className={participantTileClass}>
              {callType === 'video' && isVideoEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-zinc-900">
                  <Avatar className={`h-24 w-24 sm:h-28 sm:w-28 xl:h-32 xl:w-32 ${avatarBaseClass} ${isLocalTalking ? talkingRingClass : ''}`}>
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-4xl font-bold text-white">
                      {getInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              {callType === 'video' && isVideoEnabled && isLocalTalking && (
                <div className="absolute inset-0 rounded-lg ring-4 ring-emerald-400/80 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.45),0_0_36px_rgba(52,211,153,0.45)] pointer-events-none"></div>
              )}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md bg-black/80 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">
                <span>You</span>
              </div>
              <div className="absolute bottom-3 right-3 z-10 rounded-full bg-black/80 p-2 text-white backdrop-blur-sm">
                {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 text-red-400" />}
              </div>
            </div>

            {/* Remote videos */}
            {Array.from(peers.values()).map(peer => {
              const videoProducer = peer.producers.find(producer => {
                const consumer = consumers.get(producer.producerId);
                return producer.kind === 'video' && consumer && !isScreenShareProducer(producer, consumer);
              });
              const audioProducers = peer.producers.filter(({ kind }) => kind === 'audio');
              const videoConsumer = videoProducer ? consumers.get(videoProducer.producerId) : undefined;
              const displayName = peer.name || peer.id;
              const showVideo = Boolean(videoConsumer && peer.videoEnabled !== false);

              return (
                <div key={peer.id} className={participantTileClass}>
                  {showVideo && videoProducer ? (
                    <video
                      ref={(el) => {
                        if (el) {
                          remoteVideosRef.current.set(videoProducer.producerId, el);
                          if (videoConsumer?.track) {
                            const stream = new MediaStream([videoConsumer.track]);
                            el.srcObject = stream;
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-zinc-900">
                      <Avatar className={`h-24 w-24 sm:h-28 sm:w-28 xl:h-32 xl:w-32 ${avatarBaseClass} ${peer.isTalking ? talkingRingClass : ''}`}>
                        <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-pink-600 text-4xl font-bold text-white">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  {showVideo && peer.isTalking && (
                    <div className="absolute inset-0 rounded-lg ring-4 ring-emerald-400/80 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.45),0_0_36px_rgba(52,211,153,0.45)] pointer-events-none"></div>
                  )}
                  {audioProducers.map(({ producerId }) => {
                    const consumer = consumers.get(producerId);
                    if (!consumer?.track) return null;
                    return (
                      <audio
                        key={producerId}
                        ref={(el) => {
                          if (el) {
                            el.srcObject = new MediaStream([consumer.track]);
                            el.autoplay = true;
                          }
                        }}
                        autoPlay
                      />
                    );
                  })}
                  <div className="absolute bottom-3 left-3 flex max-w-[70%] items-center gap-2 rounded-md bg-black/80 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">
                    <span className="truncate">{displayName}</span>
                  </div>
                  <div className="absolute bottom-3 right-3 rounded-full bg-black/80 p-2 text-white backdrop-blur-sm">
                    {peer.audioEnabled === false ? <MicOff className="h-5 w-5 text-red-400" /> : <Mic className="h-5 w-5" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="bg-gradient-to-r from-red-900 to-red-800 text-white px-6 py-3 flex items-center justify-center gap-3 text-base font-semibold border-b border-red-700">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
            <span>REC</span>
          </div>
          <div className="text-red-100">
            {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-gray-900/95 p-5 flex items-center justify-center gap-5 flex-wrap backdrop-blur-xl border-t border-gray-800">
        <Button
          onClick={toggleAudio}
          variant={isAudioEnabled ? "secondary" : "destructive"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          {isAudioEnabled ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
        </Button>

        <Button
          onClick={toggleVideo}
          variant={isVideoEnabled ? "secondary" : "destructive"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          {isVideoEnabled ? <Video className="h-7 w-7" /> : <VideoOff className="h-7 w-7" />}
        </Button>

        <Button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          variant={isScreenSharing ? "destructive" : "secondary"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          {isScreenSharing ? <ScreenShareOff className="h-7 w-7" /> : <ScreenShare className="h-7 w-7" />}
        </Button>

        <Button
          onClick={() => setShowParticipants(!showParticipants)}
          variant={showParticipants ? "default" : "secondary"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          <Users className="h-7 w-7" />
        </Button>

        <Button
          onClick={() => setShowChat(!showChat)}
          variant={showChat ? "default" : "secondary"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          <MessageSquare className="h-7 w-7" />
        </Button>

        <Button
          onClick={isRecording ? stopRecording : startRecording}
          variant={isRecording ? "destructive" : "secondary"}
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          <Radio className="h-7 w-7" />
        </Button>

        <Button
          onClick={leaveCall}
          variant="destructive"
          className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all"
        >
          <PhoneOff className="h-7 w-7" />
        </Button>
      </div>

      {/* Waiting room panel (host only) */}
      {waitingRoomParticipants.length > 0 && !showChat && !showParticipants && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl backdrop-blur-xl">
          <div className="p-5 border-b border-gray-800 bg-gray-900/80">
            <h3 className="font-semibold text-white text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Waiting Room ({waitingRoomParticipants.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {waitingRoomParticipants.map(participant => (
              <div key={participant.id} className="p-4 rounded-xl bg-gray-800/80 border border-gray-700 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-lg font-bold text-white">
                      {getInitials(participant.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="font-semibold text-white truncate">
                    {participant.name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => admitParticipant(participant.id)}
                  >
                    Admit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => denyParticipant(participant.id)}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {waitingRoomParticipants.length > 1 && (
            <div className="p-4 border-t border-gray-800 bg-gray-900/70">
              <Button
                size="sm"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={admitAll}
              >
                Admit All
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Participants panel */}
      {showParticipants && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl backdrop-blur-xl">
          <div className="p-5 border-b border-gray-800 bg-gray-900/80">
            <h3 className="font-semibold text-white text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Participants ({1 + Array.from(peers.values()).length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {callId && inviteableMembers.length > 0 && (
              <div className="mb-5 rounded-xl border border-gray-700 bg-gray-800/70 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-200">
                  <span>Add Participants</span>
                  <UserPlus className="h-4 w-4 text-gray-400" />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {inviteableMembers.map(member => {
                    const checked = selectedInvitees.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-100 hover:bg-gray-700/80 cursor-pointer transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedInvitees(prev =>
                              event.target.checked
                                ? [...prev, member.id]
                                : prev.filter(id => id !== member.id)
                            );
                          }}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <Avatar className="h-8 w-8 mr-2">
                          <AvatarFallback className="bg-gray-700 text-sm font-semibold text-gray-200">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate">{member.name}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedInvitees.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedInvitees.map(id => {
                      const member = teamMembers.find(item => item.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-700 px-3 py-1 text-xs text-gray-200"
                        >
                          <span className="truncate">{member?.name || id}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${member?.name || 'participant'}`}
                            onClick={() => setSelectedInvitees(prev => prev.filter(item => item !== id))}
                            className="hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={addParticipantsToCall}
                  disabled={selectedInvitees.length === 0 || isAddingParticipants}
                >
                  {isAddingParticipants ? 'Adding...' : 'Add to Call'}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                In Call
              </div>
              <div className="p-3 rounded-xl bg-gray-800/80 border border-gray-700 flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-lg font-bold text-white">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">
                    You
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                    {isAudioEnabled ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3 text-red-400" />}
                    {isAudioEnabled ? 'Mic on' : 'Mic off'}
                    {' • '}
                    {callType === 'video' && (isVideoEnabled ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3 text-red-400" />)}
                    {callType === 'video' && (isVideoEnabled ? 'Camera on' : 'Camera off')}
                  </div>
                </div>
              </div>

              {Array.from(peers.values()).map(peer => (
                <div key={peer.id} className="p-3 rounded-xl bg-gray-800/80 border border-gray-700 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-pink-600 text-lg font-bold text-white">
                      {getInitials(peer.name || peer.id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">
                      {peer.name || peer.id}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                      {peer.audioEnabled === false ? (
                        <MicOff className="h-3 w-3 text-red-400" />
                      ) : (
                        <Mic className="h-3 w-3" />
                      )}
                      {peer.audioEnabled === false ? 'Mic off' : 'Mic on'}
                    </div>
                  </div>
                </div>
              ))}

              {Array.from(peers.values()).length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">
                  Waiting for participants...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {showChat && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl backdrop-blur-xl">
          <div className="p-5 border-b border-gray-800 bg-gray-900/80">
            <h3 className="font-semibold text-white text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chat
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              chatMessages.map(msg => (
                <div key={msg.id} className="text-sm p-3 rounded-xl bg-gray-800/80 border border-gray-700">
                  <div className="font-semibold text-white break-words flex items-center gap-2">
                    {msg.userName}
                    <span className="text-xs text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-gray-200 break-words mt-1">
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-800 bg-gray-900/70">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 border border-gray-700 bg-gray-800/90 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder-gray-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const value = e.currentTarget.value.trim();
                    if (value) {
                      sendChatMessage(value);
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
              <Button
                size="sm"
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                  const value = input.value.trim();
                  if (value) {
                    sendChatMessage(value);
                    input.value = '';
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
