import { useCallback, useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { Socket } from 'socket.io-client';

/**
 * useMediasoupRoom
 * ----------------
 * Modern mediasoup client engine (Google-Meet-grade) implementing the
 * recommended consume flow from https://mediasoup.org/documentation/v3/:
 *
 *  1. join the socket room  (call:join / meeting:join)
 *  2. load rtpCapabilities  -> new Device()
 *  3. create send + recv WebRtcTransports
 *  4. produce mic / webcam tracks (appData.source tagged)
 *  5. DISCOVER existing producers via mediasoup:getProducers  (fix: this was
 *     missing server-side before, so late joiners were deaf & blind)
 *  6. consume new producers live via mediasoup:newProducer
 *  7. consumers start paused -> attach track -> mediasoup:resume
 *  8. handle producerClosed / peerLeft / disconnects and clean up
 */

export type MediaSource = 'mic' | 'webcam' | 'screen';

export interface RemoteStream {
  peerId: string;
  source: MediaSource;
  stream: MediaStream;
  consumerId: string;
  producerId: string;
}

export interface UseMediasoupRoomOptions {
  socket: Socket | null;
  socketRoomId: string; // resolved room id used for mediasoup signaling
  displayName: string;
  isGuest: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  /** emit join through meeting:join when true (meeting flow) */
  useMeetingJoin?: boolean;
  /** skip producing/consuming video (audio-only calls) */
  audioOnly?: boolean;
  onEnded?: (payload: { reason?: string }) => void;
}

export interface MediasoupRoomState {
  connected: boolean;
  joined: boolean;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  error: string | null;
}

export function useMediasoupRoom(opts: UseMediasoupRoomOptions) {
  const {
    socket,
    socketRoomId,
    displayName,
    isGuest,
    audioEnabled,
    videoEnabled,
    useMeetingJoin = false,
    audioOnly = false,
    onEnded,
  } = opts;

  const [state, setState] = useState<MediasoupRoomState>({
    connected: !!socket?.connected,
    joined: false,
    localStream: null,
    screenStream: null,
    remoteStreams: [],
    error: null,
  });

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<types.Transport | null>(null);
  const recvTransportRef = useRef<types.Transport | null>(null);
  const micProducerRef = useRef<types.Producer | null>(null);
  const camProducerRef = useRef<types.Producer | null>(null);
  const screenProducerRef = useRef<types.Producer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const consumersRef = useRef<Map<string, types.Consumer>>(new Map());
  const userIdRef = useRef<string>('');
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const remoteStreamsRef = useRef<RemoteStream[]>([]);

  // keep a ref mirror so async flows always see fresh list
  useEffect(() => {
    remoteStreamsRef.current = state.remoteStreams;
  }, [state.remoteStreams]);

  const setPartial = useCallback((patch: Partial<MediasoupRoomState>) => {
    if (mountedRef.current) setState((s) => ({ ...s, ...patch }));
  }, []);

  // ------------------------------------------------------------------ helpers

  const getUserId = useCallback(() => {
    if (!userIdRef.current) {
      const stored = localStorage.getItem('userId');
      userIdRef.current = isGuest || !stored
        ? `guest-${Math.random().toString(36).slice(2, 10)}`
        : stored;
    }
    return userIdRef.current;
  }, [isGuest]);

  // ------------------------------------------------------------- consume flow

  const consumeProducer = useCallback(
    async (producerId: string, peerId?: string, peerName?: string, appData?: any) => {
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      if (!socket || !device || !recvTransport) return;
      try {
        const source: MediaSource = appData?.source === 'screen'
          ? 'screen'
          : appData?.source === 'webcam'
            ? 'webcam'
            : 'mic';

        // Skip if we already consume this producer
        if (remoteStreamsRef.current.some((r) => r.producerId === producerId)) return;

        const response: any = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000);
          socket.emit(
            'mediasoup:consume',
            {
              transportId: recvTransport.id,
              producerId,
              rtpCapabilities: device.rtpCapabilities,
              roomId: socketRoomId,
            },
            (res: any) => { clearTimeout(timer); resolve(res || {}); },
          );
        });

        if (response.error || !response.id) {
          console.warn('[mediasoup] consume failed', producerId, response.error);
          return;
        }

        const consumer = await recvTransport.consume({
          id: response.id,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters,
          appData: { peerId, peerName, source },
        });
        consumersRef.current.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          consumersRef.current.delete(consumer.id);
        });

        // Recommended flow: consumer created paused server-side; resume after attach
        await new Promise<void>((resolve) => {
          socket.emit(
            'mediasoup:resume',
            { consumerId: consumer.id, roomId: socketRoomId },
            () => resolve(),
          );
          setTimeout(resolve, 3000);
        });

        const remoteStream = new MediaStream([consumer.track]);
        const entry: RemoteStream = {
          peerId: peerId || (consumer.appData as any)?.peerId || 'unknown',
          source,
          stream: remoteStream,
          consumerId: consumer.id,
          producerId,
        };

        if (mountedRef.current) {
          setState((s) => {
            // Replace any stream from the same peer+source (track replace scenario)
            const filtered = s.remoteStreams.filter(
              (r) => !(r.peerId === entry.peerId && r.source === entry.source),
            );
            const next = [...filtered, entry];
            remoteStreamsRef.current = next;
            return { ...s, remoteStreams: next };
          });
        }
      } catch (err) {
        console.error('[mediasoup] consume error', err);
      }
    },
    [socket, socketRoomId],
  );

  // ------------------------------------------------------------- transports

  const createSendTransport = useCallback(async () => {
    const device = deviceRef.current;
    if (!socket || !device) return null;
    const response: any = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000);
      socket.emit('mediasoup:createWebRtcTransport', { roomId: socketRoomId }, (res: any) => {
        clearTimeout(timer);
        resolve(res || {});
      });
    });
    if (response.error || !response.id) throw new Error(response.error || 'transport create failed');

    const transport = device.createSendTransport({
      id: response.id,
      iceParameters: response.iceParameters,
      iceCandidates: response.iceCandidates,
      dtlsParameters: response.dtlsParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    });

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit(
        'mediasoup:connectWebRtcTransport',
        { transportId: transport.id, dtlsParameters, roomId: socketRoomId },
        (res: any) => (res && res.error ? errback(new Error(res.error)) : callback()),
      );
    });

    transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      socket.emit(
        'mediasoup:produce',
        {
          transportId: transport.id,
          kind,
          rtpParameters,
          roomId: socketRoomId,
          appData,
          userId: getUserId(),
          userName: displayName,
        },
        (res: any) => (res && res.error ? errback(new Error(res.error)) : callback({ id: res.id })),
      );
    });

    sendTransportRef.current = transport;
    return transport;
  }, [socket, socketRoomId, displayName, getUserId]);

  const createRecvTransport = useCallback(async () => {
    const device = deviceRef.current;
    if (!socket || !device) return null;
    const response: any = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000);
      socket.emit('mediasoup:createWebRtcTransport', { roomId: socketRoomId }, (res: any) => {
        clearTimeout(timer);
        resolve(res || {});
      });
    });
    if (response.error || !response.id) throw new Error(response.error || 'transport create failed');

    const transport = device.createRecvTransport({
      id: response.id,
      iceParameters: response.iceParameters,
      iceCandidates: response.iceCandidates,
      dtlsParameters: response.dtlsParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    });
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit(
        'mediasoup:connectWebRtcTransport',
        { transportId: transport.id, dtlsParameters, roomId: socketRoomId },
        (res: any) => (res && res.error ? errback(new Error(res.error)) : callback()),
      );
    });
    recvTransportRef.current = transport;
    return transport;
  }, [socket, socketRoomId]);

  // ------------------------------------------------------------- producers

  const produceMic = useCallback(async (stream: MediaStream) => {
    const transport = sendTransportRef.current;
    if (!transport || !socket) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    try {
      micProducerRef.current = await transport.produce({
        track,
        appData: { source: 'mic' as MediaSource },
        codecOptions: { opusStereo: true, opusDtx: true },
      });
    } catch (err) {
      console.error('[mediasoup] mic produce failed', err);
    }
  }, [socket]);

  const produceCam = useCallback(async (stream: MediaStream) => {
    const transport = sendTransportRef.current;
    if (!transport || !socket || audioOnly) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      camProducerRef.current = await transport.produce({
        track,
        encodings: [
          { rid: 'l', maxBitrate: 150_000, scalabilityMode: 'L1T3' },
          { rid: 'm', maxBitrate: 500_000, scalabilityMode: 'L1T3' },
          { rid: 'h', maxBitrate: 1_200_000, scalabilityMode: 'L1T3' },
        ],
        codecOptions: { videoGoogleStartBitrate: 1000 },
        appData: { source: 'webcam' as MediaSource },
      });
    } catch (err) {
      console.error('[mediasoup] cam produce failed', err);
    }
  }, [socket, audioOnly]);

  const stopScreenShare = useCallback(async () => {
    try {
      if (screenProducerRef.current && socket) {
        socket.emit(
          'mediasoup:closeProducer',
          { roomId: socketRoomId, producerId: screenProducerRef.current.id },
          () => undefined,
        );
        try { screenProducerRef.current.close(); } catch { /* noop */ }
        screenProducerRef.current = null;
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setPartial({ screenStream: null });
    } catch (err) {
      console.error('[mediasoup] stop screen share failed', err);
    }
  }, [socket, socketRoomId, setPartial]);

  const startScreenShare = useCallback(async (): Promise<boolean> => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      screenStreamRef.current = displayStream;
      setPartial({ screenStream: displayStream });

      const track = displayStream.getVideoTracks()[0];
      track.addEventListener('ended', () => { void stopScreenShare(); });

      const transport = sendTransportRef.current;
      if (transport) {
        screenProducerRef.current = await transport.produce({
          track,
          appData: { source: 'screen' as MediaSource },
        });
        screenProducerRef.current.on('transportclose', () => {
          screenProducerRef.current = null;
        });
      }
      return true;
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        console.error('[mediasoup] screen share failed', err);
      }
      return false;
    }
  }, [setPartial, stopScreenShare]);

  // ------------------------------------------------------------- join

  const join = useCallback(async () => {
    if (!socket || joinedRef.current) return;
    try {
      // 1. socket room join
      const joinPayload = {
        roomId: socketRoomId,
        userId: getUserId(),
        userName: displayName,
        isHost: false,
        audioEnabled,
        videoEnabled: videoEnabled && !audioOnly,
        isGuest,
      };
      const joinRes: any = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), 15000);
        socket.emit(useMeetingJoin ? 'meeting:join' : 'call:join', joinPayload, (res: any) => {
          clearTimeout(timer);
          resolve(res || {});
        });
      });
      if (joinRes && joinRes.success === false) {
        setPartial({ error: joinRes.error || 'Failed to join room' });
        return;
      }

      // 2. device
      const rtpCapsRes: any = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000);
        socket.emit('mediasoup:getRouterRtpCapabilities', { roomId: socketRoomId }, (res: any) => {
          clearTimeout(timer);
          resolve(res || {});
        });
      });
      if (rtpCapsRes.error || !rtpCapsRes.rtpCapabilities) {
        setPartial({ error: rtpCapsRes.error || 'Failed to load router capabilities' });
        return;
      }
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapsRes.rtpCapabilities });
      deviceRef.current = device;

      // 3. transports
      await createSendTransport();
      await createRecvTransport();

      // 4. local media
      let localStream: MediaStream | null = null;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: videoEnabled && !audioOnly
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
            : false,
        });
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') {
          setPartial({ error: 'Camera/microphone permission denied. You can still view others.' });
        } else {
          console.error('[mediasoup] getUserMedia failed', err);
        }
      }

      if (localStream) {
        localStreamRef.current = localStream;
        setPartial({ localStream });
        if (!audioEnabled) localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        if (audioOnly || !videoEnabled) localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        await produceMic(localStream);
        if (videoEnabled && !audioOnly) await produceCam(localStream);
      }

      // 5. discover existing producers (CRITICAL for late joiners)
      const producersRes: any = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ producers: [] }), 15000);
        socket.emit('mediasoup:getProducers', { roomId: socketRoomId }, (res: any) => {
          clearTimeout(timer);
          resolve(res || { producers: [] });
        });
      });
      const existingProducers: any[] = producersRes.producers || [];
      for (const p of existingProducers) {
        await consumeProducer(p.producerId, p.peerId, p.peerName, p.appData);
      }

      joinedRef.current = true;
      setPartial({ joined: true });
    } catch (err: any) {
      console.error('[mediasoup] join failed', err);
      setPartial({ error: err?.message || 'Failed to join the call' });
    }
  }, [
    socket, socketRoomId, displayName, isGuest, audioEnabled, videoEnabled, audioOnly,
    useMeetingJoin, getUserId, createSendTransport, createRecvTransport,
    produceMic, produceCam, consumeProducer, setPartial,
  ]);

  // ------------------------------------------------------------- socket events

  useEffect(() => {
    if (!socket) return;
    const onNewProducer = (payload: any) => {
      void consumeProducer(
        payload.producerId,
        payload.peerId,
        payload.peerName,
        payload.appData,
      );
    };
    const onProducerClosed = (payload: any) => {
      if (!payload?.producerId) return;
      if (mountedRef.current) {
        setState((s) => {
          const next = s.remoteStreams.filter((r) => r.producerId !== payload.producerId);
          remoteStreamsRef.current = next;
          return { ...s, remoteStreams: next };
        });
      }
    };
    const onPeerLeft = (payload: any) => {
      if (!payload?.socketId) return;
      if (mountedRef.current) {
        setState((s) => {
          const next = s.remoteStreams.filter((r) => r.peerId !== payload.socketId);
          remoteStreamsRef.current = next;
          return { ...s, remoteStreams: next };
        });
      }
    };
    const onEnded = (payload: any) => {
      onEnded?.(payload);
    };

    socket.on('mediasoup:newProducer', onNewProducer);
    socket.on('mediasoup:producerClosed', onProducerClosed);
    socket.on('mediasoup:peerLeft', onPeerLeft);
    socket.on('call:ended', onEnded);
    socket.on('meeting:ended', onEnded);

    return () => {
      socket.off('mediasoup:newProducer', onNewProducer);
      socket.off('mediasoup:producerClosed', onProducerClosed);
      socket.off('mediasoup:peerLeft', onPeerLeft);
      socket.off('call:ended', onEnded);
      socket.off('meeting:ended', onEnded);
    };
  }, [socket, consumeProducer, onEnded]);

  // ------------------------------------------------------------- leave/cleanup

  const leave = useCallback(() => {
    try {
      if (socket && joinedRef.current) {
        if (useMeetingJoin) {
          socket.emit('meeting:leave', { meetingId: socketRoomId, userId: getUserId(), userName: displayName });
        } else {
          socket.emit('call:leave', { roomId: socketRoomId, userId: getUserId(), userName: displayName });
        }
        [screenProducerRef.current, micProducerRef.current, camProducerRef.current].forEach((p) => {
          if (p) {
            try {
              socket.emit('mediasoup:closeProducer', { roomId: socketRoomId, producerId: p.id });
            } catch { /* noop */ }
          }
        });
      }
    } catch { /* noop */ }
    try { micProducerRef.current?.close(); } catch { /* noop */ }
    try { camProducerRef.current?.close(); } catch { /* noop */ }
    try { screenProducerRef.current?.close(); } catch { /* noop */ }
    micProducerRef.current = null;
    camProducerRef.current = null;
    screenProducerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    consumersRef.current.forEach((c) => { try { c.close(); } catch { /* noop */ } });
    consumersRef.current.clear();
    try { sendTransportRef.current?.close(); } catch { /* noop */ }
    try { recvTransportRef.current?.close(); } catch { /* noop */ }
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    joinedRef.current = false;
  }, [socket, socketRoomId, useMeetingJoin, getUserId, displayName]);

  // cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------- media controls

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      return track.enabled;
    }
    return audioEnabled;
  }, [audioEnabled]);

  const toggleCam = useCallback(async (): Promise<boolean> => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      return track.enabled;
    }
    // No camera track yet (joined with video off) - try to acquire now
    if (audioOnly) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = stream.getVideoTracks()[0];
      localStreamRef.current?.addTrack(newTrack);
      if (mountedRef.current) setPartial({ localStream: localStreamRef.current });
      await produceCam(localStreamRef.current || stream);
      return true;
    } catch {
      return false;
    }
  }, [audioOnly, produceCam, setPartial]);

  const switchCamera = useCallback(async (facingMode: 'user' | 'environment') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      const newTrack = stream.getVideoTracks()[0];
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack) {
        localStreamRef.current?.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStreamRef.current?.addTrack(newTrack);
      if (mountedRef.current) setPartial({ localStream: localStreamRef.current });
      if (camProducerRef.current) {
        await camProducerRef.current.replaceTrack({ track: newTrack });
      }
      return true;
    } catch {
      return false;
    }
  }, [setPartial]);

  return {
    ...state,
    join,
    leave,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    switchCamera,
  };
}
