import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  userId?: string;
  businessId?: string;
}

export const useSocket = ({ userId, businessId }: UseSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userId || !businessId) return;

    // Connect to Socket.io server
    const socket = io('/', {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Socket.io server');
      setIsConnected(true);
      
      // Mark user as online
      socket.emit('user-online', userId, businessId);
      
      // Set up keep-alive ping every 30 seconds
      keepAliveIntervalRef.current = setInterval(() => {
        socket.emit('user-keep-alive', userId, businessId);
      }, 30000);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Socket.io server');
      setIsConnected(false);
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
    });

    // Cleanup on unmount
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      socket.disconnect();
    };
  }, [userId, businessId]);

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('join-conversation', conversationId);
  }, []);

  // --- Call events
  const joinCall = useCallback((roomId: string) => {
    socketRef.current?.emit('call:join', { roomId });
  }, []);

  const inviteToCall = useCallback((callId: string, targetUserId: string, type: 'audio' | 'video') => {
    socketRef.current?.emit('call:invite', { callId, targetUserId, type });
  }, []);

  const acceptCall = useCallback((callId: string) => {
    socketRef.current?.emit('call:accept', { callId });
  }, []);

  const rejectCall = useCallback((callId: string) => {
    socketRef.current?.emit('call:reject', { callId });
  }, []);

  const endCall = useCallback((callId: string) => {
    socketRef.current?.emit('call:end', { callId });
  }, []);

  // --- Meeting events
  const joinMeeting = useCallback((meetingId: string) => {
    socketRef.current?.emit('meeting:join', { meetingId });
  }, []);

  const leaveMeeting = useCallback((meetingId: string) => {
    socketRef.current?.emit('meeting:leave', { meetingId });
  }, []);

  const endMeeting = useCallback((meetingId: string) => {
    socketRef.current?.emit('meeting:end', { meetingId });
  }, []);

  // --- Recording events
  const startRecording = useCallback((meetingId: string) => {
    socketRef.current?.emit('recording:start', { meetingId });
  }, []);

  const stopRecording = useCallback((meetingId: string) => {
    socketRef.current?.emit('recording:stop', { meetingId });
  }, []);

  // --- Screen sharing events
  const startScreenShare = useCallback((roomId: string) => {
    socketRef.current?.emit('screen-share:start', { roomId });
  }, []);

  const stopScreenShare = useCallback((roomId: string) => {
    socketRef.current?.emit('screen-share:stop', { roomId });
  }, []);

  // --- In-meeting chat
  const sendMeetingChat = useCallback((roomId: string, message: string) => {
    socketRef.current?.emit('meeting-chat:message', { roomId, message });
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  const updateUserPresence = useCallback((status: 'online' | 'offline' | 'busy' | 'calling' | 'in-meeting' | 'away' | 'do-not-disturb') => {
    socketRef.current?.emit('user-presence', status);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinConversation,
    joinCall,
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
