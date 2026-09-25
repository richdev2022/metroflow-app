import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  userId?: string;
  businessId?: string;
  userName?: string;
}

let singletonSocket: Socket | null = null;
let singletonRefCount = 0;
let singletonConnectedListeners = new Set<(connected: boolean) => void>();
let singletonLastCreds: { userId: string; businessId: string } | null = null;
let singletonKeepAliveInterval: NodeJS.Timeout | null = null;
// True while the singleton is a guest-authenticated socket (see connectAsGuest)
let singletonIsGuest = false;

function ensureSingletonSocket(userId: string, businessId: string, userName: string) {
  // While a guest socket owns the singleton, keep it intact so guest identity
  // (auth.guestToken) is not replaced by a user-authenticated socket.
  if (singletonSocket && singletonIsGuest) {
    return singletonSocket;
  }
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
    singletonIsGuest = false;
    const socket = io({
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      withCredentials: true,
      // Send the auth token on handshake so the backend can verify identity
      auth: { token: localStorage.getItem('token') || undefined }
    });
    singletonSocket = socket;

    socket.on('connect', () => {
      console.log('[Socket] Singleton connected');
      socket.emit('user-online', userId, businessId, userName || localStorage.getItem('userName') || '');
      singletonConnectedListeners.forEach(fn => fn(true));
      if (singletonKeepAliveInterval) clearInterval(singletonKeepAliveInterval);
      singletonKeepAliveInterval = setInterval(() => {
        try { socket.emit('user-keep-alive', userId, businessId); } catch {}
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

/**
 * Replace the singleton socket with a guest-authenticated one.
 * Used by public guest join pages (/join/meeting/:code, /join/call/:code).
 * The backend reads `auth.guestToken` on handshake to verify guest identity.
 */
export function connectAsGuest(guestToken: string): Socket {
  if (singletonKeepAliveInterval) {
    clearInterval(singletonKeepAliveInterval);
    singletonKeepAliveInterval = null;
  }
  if (singletonSocket) {
    try { singletonSocket.removeAllListeners(); singletonSocket.disconnect(); } catch {}
  }
  singletonRefCount = 0;
  singletonLastCreds = null;

  const socket = io({
    transports: ['polling', 'websocket'],
    path: '/socket.io',
    withCredentials: true,
    auth: { guestToken }
  });
  singletonSocket = socket;
  singletonIsGuest = true;

  socket.on('connect', () => {
    console.log('[Socket] Guest socket connected');
    singletonConnectedListeners.forEach(fn => fn(true));
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Guest socket disconnected');
    singletonConnectedListeners.forEach(fn => fn(false));
  });

  return socket;
}

/**
 * Tear down the guest socket created by connectAsGuest, so a subsequent
 * useSocket() call recreates a normal user-authenticated singleton.
 */
export function disconnectAsGuest(): void {
  if (singletonSocket && singletonIsGuest) {
    try { singletonSocket.removeAllListeners(); singletonSocket.disconnect(); } catch {}
    singletonSocket = null;
    singletonIsGuest = false;
  }
  if (singletonKeepAliveInterval) {
    clearInterval(singletonKeepAliveInterval);
    singletonKeepAliveInterval = null;
  }
}

/**
 * Verify a room password via the `room:verifyPassword` socket event (ack-based).
 */
export function verifyRoomPassword(roomId: string, password: string): Promise<{ valid: boolean; roomType?: string }> {
  return new Promise((resolve) => {
    const socket = singletonSocket;
    if (!socket || !roomId || !socket.connected) {
      resolve({ valid: false });
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => finish({ valid: false }), 10000);
    const finish = (result: { valid: boolean; roomType?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    try {
      socket.emit('room:verifyPassword', { roomId, password }, (response: any) => {
        finish({
          valid: Boolean(response?.valid ?? response?.success),
          roomType: response?.roomType,
        });
      });
    } catch {
      finish({ valid: false });
    }
  });
}

export const useSocket = ({ userId, businessId, userName }: UseSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState<boolean>(() => singletonSocket?.connected ?? false);
  const localSubscribedRef = useRef(false);

  useEffect(() => {
    // Only ensure a user socket when real credentials exist. Guests (empty
    // creds) still subscribe below so `isConnected` reflects the guest socket.
    if (userId && businessId) {
      const resolvedUserName = userName || localStorage.getItem('userName') || '';
      ensureSingletonSocket(userId, businessId, resolvedUserName);
    }
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

  const joinConversation = useCallback((conversationId: string) => {
    singletonSocket?.emit('join-conversation', conversationId);
  }, []);

  // --- Call events
  const joinCall = useCallback((roomId: string, opts?: {
    userId?: string;
    userName?: string;
    isHost?: boolean;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }, callback?: (resp: any) => void) => {
    singletonSocket?.emit('call:join', {
      roomId,
      userId: opts?.userId,
      userName: opts?.userName,
      isHost: opts?.isHost,
      audioEnabled: opts?.audioEnabled,
      videoEnabled: opts?.videoEnabled,
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
  const sendMeetingChat = useCallback((roomId: string, message: string) => {
    singletonSocket?.emit('meeting-chat:message', { roomId, message });
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

  return {
    socket: singletonSocket,
    getSocket,
    isConnected,
    joinConversation,
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
    verifyRoomPassword,
    updateUserPresence,
    on,
    off,
    emit,
  };
};
