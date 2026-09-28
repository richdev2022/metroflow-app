import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  Calendar,
  CheckSquare,
  MessageSquare,
  Video,
  CreditCard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Inbox,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
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
    case 'message':
      return <MessageSquare className="h-4 w-4" />;
    case 'call':
      return <Video className="h-4 w-4" />;
    case 'payment':
    case 'credit':
      return <ArrowDownToLine className="h-4 w-4" />;
    case 'debit':
      return <ArrowUpFromLine className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

/** Per-type accent colors for the leading icon chip. */
function getNotificationChipClass(type: string): string {
  switch (type) {
    case 'meeting':
      return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
    case 'task':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'chat':
    case 'message':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
    case 'call':
      return 'bg-teal-500/15 text-teal-600 dark:text-teal-400';
    case 'payment':
    case 'credit':
      return 'bg-green-500/15 text-green-600 dark:text-green-400';
    case 'debit':
      return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300';
  }
}

function formatRelativeTime(dateString?: string | null) {
  if (!dateString) return 'Just now';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Start of "today" (local midnight). */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function NotificationRow({
  notification,
  onOpen,
  onAction,
}: {
  notification: Notification;
  onOpen: (n: Notification) => void;
  onAction: (e: React.MouseEvent, n: Notification, action: string) => void;
}) {
  const unread = !notification.isRead;
  const isCallAction = notification.actionType === 'accept_call';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(notification);
        }
      }}
      className={cn(
        'group relative flex w-full cursor-pointer gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors animate-in fade-in slide-in-from-top-1 duration-200 outline-none last:border-b-0 focus-visible:bg-muted/60 hover:bg-muted/50',
        unread && 'bg-primary/[0.06] hover:bg-primary/[0.09]'
      )}
    >
      {/* Unread dot */}
      {unread && (
        <span
          aria-hidden="true"
          className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/20"
        />
      )}

      <div
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          unread ? getNotificationChipClass(notification.type) : 'bg-muted text-muted-foreground'
        )}
      >
        {getNotificationIcon(notification.type)}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('min-w-0 truncate text-sm', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85')}>
            {notification.title}
          </p>
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {formatRelativeTime(notification.createdAt || (notification as any).created_at)}
          </span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {notification.message}
        </p>

        {notification.isActionable && !notification.actionTaken && (
          <div className="flex flex-wrap gap-2 pt-1.5">
            {isCallAction && (
              <>
                <Button
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={(e) => onAction(e, notification, 'accept')}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg px-3 text-xs"
                  onClick={(e) => onAction(e, notification, 'decline')}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Decline
                </Button>
              </>
            )}
            {['view_meeting', 'view_task', 'view_chat', 'view_wallet'].includes(
              notification.actionType || ''
            ) && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 rounded-lg px-3 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(notification);
                }}
              >
                View
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    takeAction,
  } = useNotifications();

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

  // Group into Today / Earlier (rows are newest-first from the API).
  const { today, earlier } = useMemo(() => {
    const boundary = startOfToday().getTime();
    const todayItems: Notification[] = [];
    const earlierItems: Notification[] = [];
    notifications.forEach((n) => {
      const ts = new Date(n.createdAt || (n as any).created_at).getTime();
      if (isNaN(ts) || ts >= boundary) todayItems.push(n);
      else earlierItems.push(n);
    });
    return { today: todayItems, earlier: earlierItems };
  }, [notifications]);

  const renderBody = () => {
    if (isLoading && notifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading notifications…</p>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Inbox className="h-7 w-7 text-muted-foreground/70" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">You're all caught up</p>
            <p className="text-xs text-muted-foreground">
              New notifications about calls, chats and payments will appear here.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div>
        {today.length > 0 && (
          <section aria-label="Today">
            <h4 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Today
            </h4>
            {today.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={handleNotificationClick} onAction={handleAction} />
            ))}
          </section>
        )}
        {earlier.length > 0 && (
          <section aria-label="Earlier">
            <h4 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Earlier
            </h4>
            {earlier.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={handleNotificationClick} onAction={handleAction} />
            ))}
          </section>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-primary hover:text-primary"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="h-10 w-10 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Popover open={open && !isMobile} onOpenChange={(next) => !isMobile && setOpen(next)}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            className="relative h-10 w-10 rounded-full"
            onClick={() => setOpen((prev) => !prev)}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive p-0 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 p-0 shadow-xl"
        >
          {renderHeader()}
          <ScrollArea className="h-[420px]">
            {renderBody()}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Mobile: full-screen sheet */}
      {isMobile && open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Notifications">
          <div
            className="sheet-backdrop-fade absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="sheet-slide-up absolute inset-x-0 bottom-0 top-14 flex flex-col overflow-hidden rounded-t-2xl border border-border/70 bg-background shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            {renderHeader()}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              {renderBody()}
            </div>
            <div className="shrink-0 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default NotificationBell;
