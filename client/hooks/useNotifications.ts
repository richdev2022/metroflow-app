import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useSocket } from './useSocket';
import type { Notification, GetNotificationsResponse, GetNotificationsQuery } from '@shared/api';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { socket, on } = useSocket({
    userId: localStorage.getItem('userId') || '',
    businessId: localStorage.getItem('businessId') || '',
  });

  const fetchNotifications = useCallback(async (query: GetNotificationsQuery = {}) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.unreadOnly) params.set('unreadOnly', 'true');

      const response = await api.get<GetNotificationsResponse>(`/notifications?${params.toString()}`);
      if (response.data.success) {
        setNotifications(response.data.data.notifications);
        setUnreadCount(response.data.data.notifications.filter(n => !n.isRead).length);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await api.patch(`/notifications/${notificationId}/read`);
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, []);

  const takeAction = useCallback(async (notificationId: string, action: string) => {
    try {
      const response = await api.post(`/notifications/${notificationId}/action`, { action });
      if (response.data.success) {
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...response.data.data } : n
        ));
        if (!response.data.data.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error('Failed to take notification action:', error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications({ limit: 50 });
  }, [fetchNotifications]);

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, on]);

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    takeAction,
  };
}
