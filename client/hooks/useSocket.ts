import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  userId?: string;
  businessId?: string;
  userName?: string;
}

// Resolve the socket server URL.
// Priority: VITE_SOCKET_URL > origin of VITE_API_BASE_URL > same origin.
// In production the API is usually on a different origin than the static app,
// so the socket must explicitly target it.
function resolveSocketUrl(): string {
  const env = (k: string) => (import.meta as any).env?.[k] as string | undefined;
  const explicit = env('VITE_SOCKET_URL')?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const apiBase = env('VITE_API_BASE_URL')?.trim();
  if (apiBase) {
    try {
      return new URL(apiBase).origin;
    } catch { /* relative base - fall through */ }
  }
  return '';
}

// Extra handshake auth (e.g. guest token) that can be set before connecting.
let singletonExtraAuth: { token?: string; guestToken?: string } = {};

// ----------------------------------------------------------------------
// Conversation room registry (reconnect-safe joins).
//
// The socket.io server forgets room membership the moment a client socket
// disconnects (network blip, laptop sleep, server restart). After an
// auto-reconnect the client silently stopped receiving `message:created`
// for the open thread — messages only appeared after leaving and
// re-entering the chat. We therefore remember every conversation the app
// explicitly joined and re-emit 'join-conversation' for ALL of them on
// every (re)connect inside the singleton 'connect' handler.
// ----------------------------------------------------------------------
const joinedConversations = new Set<string>();

// Fired from the same 'connect' handler, but only for RE-connects (the very
// first connect is skipped). Consumers use it to refetch data that may have
// changed while the socket was offline (new messages, read state…).
const singletonReconnectedListeners = new Set<() => void>();

export function onSocketReconnected(cb: () => void) {
  singletonReconnectedListeners.add(cb);
}

export function offSocketReconnected(cb: () => void) {
  singletonReconnectedListeners.delete(cb);
}

/**
 * Set extra socket handshake auth (guest token etc).
 * Drops any existing singleton so the next connection picks up the new auth.
 */
export function setSocketAuth(auth: { token?: string; guestToken?: string } | null) {
  singletonExtraAuth = auth || {};
  if (singletonSocket) {
    try { singletonSocket.removeAllListeners(); singletonSocket.disconnect(); } catch {}
    singletonSocket = null;
    singletonLastCreds = null;
  }
  // A brand-new socket's first connect is an initial connect, not a reconnect.
  singletonEverConnected = false;
}

let singletonSocket: Socket | null = null;
let singletonRefCount = 0;
let singletonConnectedListeners = new Set<(connected: boolean) => void>();
let singletonLastCreds: { userId: string; businessId: string } | null = null;
let singletonKeepAliveInterval: NodeJS.Timeout | null = null;
let singletonEverConnected = false;

function ensureSingletonSocket(userId: string, businessId: string, userName: string) {
  const credsMatch = singletonLastCreds?.userId === userId && singletonLastCreds?.businessId === businessId;
  if (singletonSocket && credsMatch && singletonSocket.connected) {
    return singletonSocket;
  }
  if (singletonSocket && !credsMatch) {
    try { singletonSocket.removeAllListeners(); singletonSocket.disconnect(); } catch {}
    singletonSocket = null;
  }
  if (!singletonSocket) {
    singletonLastCreds = { userId, businessId };
    const token = singletonExtraAuth.token ?? localStorage.getItem('token') ?? undefined;
    const auth: Record<string, string> = {};
    if (token) auth.token = token;
    if (singletonExtraAuth.guestToken) auth.guestToken = singletonExtraAuth.guestToken;
    const url = resolveSocketUrl();
    // withCredentials stays false: auth travels in the handshake auth payload
    // (auth.token), not cookies. Sending credentials makes the browser reject
    // any wildcard/reflect-less CORS response from the server.
    const socket = url ? io(url, {
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      withCredentials: false,
      auth,
    }) : io({
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      withCredentials: false,
      auth,
    });
    singletonSocket = socket;

    socket.on('connect', () => {
      console.log('[Socket] Singleton connected');
      // Server-verified identity comes from the handshake token; this event
      // keeps legacy presence behavior working.
      if (businessId) {
        socket.emit('user-online', userId, businessId, userName || localStorage.getItem('userName') || '');
      }
      // Re-join every conversation room: the server forgot our room membership
      // while the socket was down (fires on the initial connect too — re-joining
      // an already-joined room is a harmless no-op server-side).
      joinedConversations.forEach((id) => {
        try { socket.emit('join-conversation', id); } catch {}
      });
      const isReconnect = singletonEverConnected;
      singletonEverConnected = true;
      if (isReconnect) {
        singletonReconnectedListeners.forEach((fn) => {
          try { fn(); } catch {}
        });
      }
      singletonConnectedListeners.forEach(fn => fn(true));
      if (singletonKeepAliveInterval) clearInterval(singletonKeepAliveInterval);
      singletonKeepAliveInterval = setInterval(() => {
        try { if (businessId) socket.emit('user-keep-alive', userId, businessId); } catch {}
      }, 30000);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Singleton disconnected');
      singletonConnectedListeners.forEach(fn => fn(false));
      if (singletonKeepAliveInterval) {
        clearInterval(singletonKeepAliveInterval);
        singletonKeepAliveInterval = null;
      }
    });
  } else if (credsMatch && !singletonSocket.connected) {
    // socket exists but reconnecting; listeners still in place
  }
  return singletonSocket;
}

export function getSingletonSocket(): Socket | null {
  return singletonSocket;
}

export const useSocket = ({ userId, businessId, userName }: UseSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState<boolean>(() => singletonSocket?.connected ?? false);
  const localSubscribedRef = useRef(false);

  useEffect(() => {
    // Guests connect with a generated id and no businessId
    if (!userId) return;
    const resolvedUserName = userName || localStorage.getItem('userName') || '';
    const resolvedBusinessId = businessId || '';

    ensureSingletonSocket(userId, resolvedBusinessId, resolvedUserName);
    singletonRefCount += 1;
    localSubscribedRef.current = true;

    const listener = (c: boolean) => setIsConnected(c);
    singletonConnectedListeners.add(listener);
    if (singletonSocket?.connected) {
      setIsConnected(true);
    }

    return () => {
      singletonRefCount = Math.max(0, singletonRefCount - 1);
      singletonConnectedListeners.delete(listener);
      localSubscribedRef.current = false;
      if (singletonRefCount === 0) {
        if (singletonKeepAliveInterval) {
          clearInterval(singletonKeepAliveInterval);
          singletonKeepAliveInterval = null;
        }
        if (singletonSocket) {
          try { singletonSocket.disconnect(); } catch {}
          singletonSocket = null;
          singletonLastCreds = null;
        }
      }
    };
  }, [userId, businessId, userName]);

  const getSocket = useCallback(() => singletonSocket, []);

  /** Join a conversation room AND remember it so reconnects re-join
   *  automatically (see joinedConversations above). */
  const joinConversation = useCallback((conversationId: string) => {
    if (!conversationId) return;
    joinedConversations.add(conversationId);
    if (singletonSocket?.connected) {
      singletonSocket.emit('join-conversation', conversationId);
    }
    // Not connected yet: the singleton 'connect' handler re-emits every
    // registered join, so nothing else to do here.
  }, []);

  /** Leave a conversation room and stop re-joining it on reconnects. The
   *  'leave-conversation' emit is best-effort (older servers ignore it). */
  const leaveConversation = useCallback((conversationId: string) => {
    if (!conversationId) return;
    joinedConversations.delete(conversationId);
    try { singletonSocket?.emit('leave-conversation', conversationId); } catch {}
  }, []);

  // --- Call events
  const joinCall = useCallback((roomId: string, opts?: {
    userId?: string;
    userName?: string;
    isHost?: boolean;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    isGuest?: boolean;
  }, callback?: (resp: any) => void) => {
    singletonSocket?.emit('call:join', {
      roomId,
      userId: opts?.userId,
      userName: opts?.userName,
      isHost: opts?.isHost,
      audioEnabled: opts?.audioEnabled,
      videoEnabled: opts?.videoEnabled,
      isGuest: opts?.isGuest,
    }, callback);
  }, []);

  const leaveCall = useCallback((roomId: string, opts?: { userId?: string; userName?: string }) => {
    singletonSocket?.emit('call:leave', {
      roomId,
      userId: opts?.userId,
      userName: opts?.userName,
    });
  }, []);

  const inviteToCall = useCallback((callId: string, targetUserId: string, type: 'audio' | 'video', opts?: { callerName?: string; roomId?: string }) => {
    singletonSocket?.emit('call:invite', { callId, targetUserId, type, callerName: opts?.callerName, roomId: opts?.roomId });
  }, []);

  const acceptCall = useCallback((callId: string) => {
    singletonSocket?.emit('call:accept', { callId });
  }, []);

  const rejectCall = useCallback((callId: string) => {
    singletonSocket?.emit('call:reject', { callId });
  }, []);

  const endCall = useCallback((callId: string) => {
    singletonSocket?.emit('call:end', { callId });
  }, []);

  // --- Meeting events
  const joinMeeting = useCallback((meetingId: string, opts?: {
    userId?: string;
    userName?: string;
    isHost?: boolean;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }, callback?: (resp: any) => void) => {
    singletonSocket?.emit('meeting:join', {
      meetingId,
      userId: opts?.userId,
      userName: opts?.userName,
      isHost: opts?.isHost,
      audioEnabled: opts?.audioEnabled,
      videoEnabled: opts?.videoEnabled,
    }, callback);
  }, []);

  const leaveMeeting = useCallback((meetingId: string, opts?: { userId?: string; userName?: string }) => {
    singletonSocket?.emit('meeting:leave', {
      meetingId,
      userId: opts?.userId,
      userName: opts?.userName,
    });
  }, []);

  const endMeeting = useCallback((meetingId: string) => {
    singletonSocket?.emit('meeting:end', { meetingId });
  }, []);

  // --- Recording events
  const startRecording = useCallback((meetingId: string) => {
    singletonSocket?.emit('recording:start', { meetingId });
  }, []);

  const stopRecording = useCallback((meetingId: string) => {
    singletonSocket?.emit('recording:stop', { meetingId });
  }, []);

  // --- Screen sharing events
  const startScreenShare = useCallback((roomId: string) => {
    singletonSocket?.emit('screen-share:start', { roomId });
  }, []);

  const stopScreenShare = useCallback((roomId: string) => {
    singletonSocket?.emit('screen-share:stop', { roomId });
  }, []);

  // --- In-meeting chat
  const sendMeetingChat = useCallback((roomId: string, message: string, opts?: { userId?: string; userName?: string }) => {
    singletonSocket?.emit('meeting-chat:message', {
      roomId,
      message,
      userId: opts?.userId,
      senderName: opts?.userName || localStorage.getItem('userName') || undefined,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    singletonSocket?.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback: (...args: any[]) => void) => {
    singletonSocket?.off(event, callback);
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    singletonSocket?.emit(event, ...args);
  }, []);

  const updateUserPresence = useCallback((status: 'online' | 'offline' | 'busy' | 'calling' | 'in-meeting' | 'away' | 'do-not-disturb') => {
    singletonSocket?.emit('user-presence', status);
  }, []);

  const onReconnected = useCallback((cb: () => void) => {
    onSocketReconnected(cb);
  }, []);

  const offReconnected = useCallback((cb: () => void) => {
    offSocketReconnected(cb);
  }, []);

  return {
    socket: singletonSocket,
    getSocket,
    isConnected,
    joinConversation,
    leaveConversation,
    onReconnected,
    offReconnected,
    joinCall,
    leaveCall,
    inviteToCall,
    acceptCall,
    rejectCall,
    endCall,
    joinMeeting,
    leaveMeeting,
    endMeeting,
    startRecording,
    stopRecording,
    startScreenShare,
    stopScreenShare,
    sendMeetingChat,
    updateUserPresence,
    on,
    off,
    emit,
  };
};
