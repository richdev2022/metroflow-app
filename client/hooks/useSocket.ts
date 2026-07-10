import { useEffect, useRef, useState } from 'react';
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

  const joinConversation = (conversationId: string) => {
    socketRef.current?.emit('join-conversation', conversationId);
  };

  // --- Call events
  const inviteToCall = (callId: string, targetUserId: string, type: 'audio' | 'video') => {
    socketRef.current?.emit('call:invite', { callId, targetUserId, type });
  };

  const acceptCall = (callId: string) => {
    socketRef.current?.emit('call:accept', { callId });
  };

  const rejectCall = (callId: string) => {
    socketRef.current?.emit('call:reject', { callId });
  };

  const endCall = (callId: string) => {
    socketRef.current?.emit('call:end', { callId });
  };

  // --- Meeting events
  const joinMeeting = (meetingId: string) => {
    socketRef.current?.emit('meeting:join', { meetingId });
  };

  const leaveMeeting = (meetingId: string) => {
    socketRef.current?.emit('meeting:leave', { meetingId });
  };

  const endMeeting = (meetingId: string) => {
    socketRef.current?.emit('meeting:end', { meetingId });
  };

  // --- Recording events
  const startRecording = (meetingId: string) => {
    socketRef.current?.emit('recording:start', { meetingId });
  };

  const stopRecording = (meetingId: string) => {
    socketRef.current?.emit('recording:stop', { meetingId });
  };

  // --- Screen sharing events
  const startScreenShare = (meetingId: string) => {
    socketRef.current?.emit('screen-share:start', { meetingId });
  };

  const stopScreenShare = (meetingId: string) => {
    socketRef.current?.emit('screen-share:stop', { meetingId });
  };

  // --- In-meeting chat
  const sendMeetingChat = (meetingId: string, message: string) => {
    socketRef.current?.emit('meeting-chat:message', { meetingId, message });
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
  };

  const off = (event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.off(event, callback);
  };

  const emit = (event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinConversation,
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
    on,
    off,
    emit,
  };
};
