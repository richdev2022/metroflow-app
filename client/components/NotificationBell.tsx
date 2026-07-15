import React, { useState } from 'react';
import { Bell, Check, X, Calendar, CheckSquare, MessageSquare, Video, CreditCard, ArrowDownToLine, ArrowUpFromLine, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Notification } from '@shared/api';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'meeting':
      return <Calendar className="h-4 w-4" />;
    case 'task':
      return <CheckSquare className="h-4 w-4" />;
    case 'chat':
      return <MessageSquare className="h-4 w-4" />;
    case 'call':
      return <Video className="h-4 w-4" />;
    case 'credit':
      return <ArrowDownToLine className="h-4 w-4" />;
    case 'debit':
      return <ArrowUpFromLine className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, takeAction } = useNotifications();

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
    setOpen(false);
  };

  const handleAction = async (e: React.MouseEvent, notification: Notification, action: string) => {
    e.stopPropagation();
    await takeAction(notification.id, action);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px]"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            Mark all read
          </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                    !notification.isRead && "bg-muted/30"
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                    "mt-1 rounded-full p-2",
                    !notification.isRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("font-medium", !notification.isRead && "font-semibold")}>
                          {notification.title}
                        </p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      {notification.isActionable && !notification.actionTaken && (
                        <div className="flex gap-2 mt-2">
                          {notification.actionType === 'accept_call' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => handleAction(e, notification, 'accept')}
                              >
                                <Check className="h-4 w-4 mr-1" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => handleAction(e, notification, 'decline')}
                              >
                                <X className="h-4 w-4 mr-1" /> Decline
                              </Button>
                            </>
                          )}
                          {notification.actionType === 'view_meeting' && (
                            <Button size="sm" variant="default">
                              View
                            </Button>
                          )}
                          {notification.actionType === 'view_task' && (
                            <Button size="sm" variant="default">
                              View
                            </Button>
                          )}
                          {notification.actionType === 'view_chat' && (
                            <Button size="sm" variant="default">
                              View
                            </Button>
                          )}
                          {notification.actionType === 'view_wallet' && (
                            <Button size="sm" variant="default">
                              View
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
