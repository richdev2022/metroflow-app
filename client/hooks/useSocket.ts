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

  const on = (event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
  };

  const off = (event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.off(event, callback);
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinConversation,
    on,
    off,
  };
};
