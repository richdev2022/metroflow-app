import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Users, ListTodo, LogOut, UserCircle2, Moon, Sun, Activity, Target, Lightbulb, CreditCard, Wallet, Banknote, Loader2, Settings, History, Kanban, Calendar, CalendarDays, MessageSquare, Video, Mic, Phone, Sparkles } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { AnnouncementTicker } from "./AnnouncementTicker";
import { BrandMark } from "./BrandLogo";
import { useTheme } from "next-themes";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";
import { useToast } from "@/components/ui/use-toast";
import { KycModal } from "./KycModal";
import { AudioUtils } from "@/lib/audio-utils";
import IncomingCallModal, { IncomingCallData } from "./IncomingCallModal";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSocket } from "@/hooks/useSocket";
import { unwrapApiData } from "@/lib/api-response";
import { Conversation } from "@shared/api";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import AppTour, { restartAppTour } from "./AppTour";
import { Compass } from "lucide-react";

const APP_TITLE = (typeof document !== "undefined" && document.title) || "Metricorex — Business OS";

type NotificationCtorOptions = NotificationOptions & { requireInteraction?: boolean };

export default function Layout({ children }: { children: React.ReactNode }) {
  console.log("Layout loaded - v2");
  const location = useLocation();
  const navigate = useNavigate();
  const userName = localStorage.getItem("userName") || "User";
  const userAvatar = (() => {
    try { return localStorage.getItem("userAvatar") || ""; } catch { return ""; }
  })();
  const userId = localStorage.getItem("userId") || "";
  const businessId = localStorage.getItem("businessId") || "";
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const [showSubscriptionAlert, setShowSubscriptionAlert] = useState(false);
  const [alertType, setAlertType] = useState<'expired' | 'trial_ended'>('expired');
  const [audioContextInitialized, setAudioContextInitialized] = useState(false);

  const [totalUnread, setTotalUnread] = useState(0);
  const [meetingsUnread, setMeetingsUnread] = useState(0);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  const fetchedUnreadRef = useRef(false);
  const callNotificationRef = useRef<Notification | null>(null);
  const [isHidden, setIsHidden] = useState(() => (typeof document !== "undefined" ? document.hidden : false));

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const { socket, isConnected, on, off } = useSocket({
    userId,
    businessId,
    userName,
  });

  // Initialize AudioContext on first user interaction
  useEffect(() => {
    const initializeAudio = async () => {
      if (!audioContextInitialized) {
        await AudioUtils.initAudioContext();
        setAudioContextInitialized(true);
      }
    };

    document.addEventListener('click', initializeAudio, { once: true });
    document.addEventListener('keydown', initializeAudio, { once: true });

    return () => {
      document.removeEventListener('click', initializeAudio);
      document.removeEventListener('keydown', initializeAudio);
    };
  }, [audioContextInitialized]);

  // Request Web Notification permission on first user interaction (the same
  // unlock gesture that resumes the AudioContext). Denial is ignored silently.
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;

    const requestPermission = () => {
      try {
        Promise.resolve(Notification.requestPermission()).catch(() => {});
      } catch {}
      document.removeEventListener('click', requestPermission);
      document.removeEventListener('keydown', requestPermission);
      document.removeEventListener('touchstart', requestPermission);
    };

    document.addEventListener('click', requestPermission);
    document.addEventListener('keydown', requestPermission);
    document.addEventListener('touchstart', requestPermission);

    return () => {
      document.removeEventListener('click', requestPermission);
      document.removeEventListener('keydown', requestPermission);
      document.removeEventListener('touchstart', requestPermission);
    };
  }, []);

  // Track tab visibility for background notifications + title badges
  useEffect(() => {
    const onVisibility = () => setIsHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const showNotification = useCallback((title: string, options?: NotificationCtorOptions): Notification | null => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;
    try {
      // Android Chrome only supports SW notifications; ignore that failure.
      return new Notification(title, options);
    } catch {
      return null;
    }
  }, []);

  const closeCallNotification = useCallback(() => {
    try {
      callNotificationRef.current?.close();
    } catch {}
    callNotificationRef.current = null;
  }, []);

  const fetchTotalUnread = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.get('/chat/conversations');
      const convs = unwrapApiData<(Conversation & { unreadCount?: number })[]>(res.data, '') || [];
      const sum = convs.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
      setTotalUnread(sum);
    } catch (e) {
      // silently fail
    }
  }, [userId]);

  useEffect(() => {
    if (userId && !fetchedUnreadRef.current) {
      fetchedUnreadRef.current = true;
      fetchTotalUnread();
      const interval = window.setInterval(fetchTotalUnread, 15000);
      return () => clearInterval(interval);
    }
  }, [userId, fetchTotalUnread]);

  // Listen for new message notifications
  useEffect(() => {
    if (!isConnected || !socket) return;

    const handleNewMsgNotif = (data: any) => {
      // Backend `message:created` payload IS the message object; the mock's
      // `chat:new-message-notification` wraps it as { conversationId, message }.
      const msg = data?.message || data || {};
      const currentSenderId = msg.senderId || msg.sender_id || data?.senderId || "";
      if (currentSenderId && currentSenderId !== userId) {
        setTotalUnread(prev => prev + 1);

        // Tab hidden -> OS notification + sound (AudioContext keeps running
        // while hidden, unlike throttled timers).
        if (typeof document !== "undefined" && document.hidden) {
          const senderName = data?.senderName || msg.senderName || msg.sender_name || "Someone";
          const attachmentType = String(data?.attachmentType || msg.attachmentType || "");
          const preview = (data?.content || msg.content || "").toString().slice(0, 120);
          const body = preview
            || (attachmentType.startsWith("audio") ? "🎤 Voice note" : "Sent an attachment");
          const conversationId = data?.conversationId || msg.conversationId || msg.conversation_id || "general";
          showNotification(`New message from ${senderName}`, {
            body,
            icon: "/favicon.ico",
            tag: `chat-${conversationId}`,
          });
          AudioUtils.ensureInitialized().catch(() => {});
          AudioUtils.playNotification().catch(() => {});
        }
      }
    };

    const handleReadUpdated = (data: { conversationId: string; userId: string }) => {
      if (data.userId === userId) {
        fetchTotalUnread();
      }
    };

    on('chat:new-message-notification', handleNewMsgNotif);
    on('message:created', handleNewMsgNotif);
    on('chat:read-updated', handleReadUpdated);
    on('conversation:read', handleReadUpdated);
    return () => {
      off('chat:new-message-notification', handleNewMsgNotif);
      off('message:created', handleNewMsgNotif);
      off('chat:read-updated', handleReadUpdated);
      off('conversation:read', handleReadUpdated);
    };
  }, [isConnected, socket, userId, on, off, fetchTotalUnread, showNotification]);

  // Global in-app popups: new chat messages + meeting invites (badge, sound, toast)
  useEffect(() => {
    if (!isConnected || !socket) return;

    // Personal chat push (works anywhere in the app). The chat page handles
    // its own sound for the open conversation, so stay quiet on /chat.
    // When the tab is hidden this path is covered by the OS notification
    // above — don't double up sounds/toasts.
    const handleChatPush = (data: any) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const msg = data?.message || data || {};
      const senderId = data?.senderId || msg.senderId || msg.sender_id || "";
      if (!senderId || senderId === userId) return;

      const senderName = data?.senderName || msg.senderName || msg.sender_name || "Someone";
      const conversationName = data?.conversationName || "";
      const preview = (data?.content || msg.content || "").toString().slice(0, 120);
      const hasAttachment = !!(data?.attachmentType || msg.attachmentType || msg.attachmentUrl || msg.attachment_url);

      if (location.pathname !== "/chat") {
        AudioUtils.ensureInitialized().catch(() => {});
        AudioUtils.playNotification().catch(() => {});
        sonnerToast(senderName + (conversationName && data?.conversationType === "group" ? ` · ${conversationName}` : ""), {
          description: preview || (hasAttachment ? "📎 Sent an attachment" : "New message"),
          duration: 5000,
          action: { label: "Open", onClick: () => navigate("/chat") },
        });
      }
    };

    const handleMeetingCreated = (meeting: any) => {
      if (!meeting) return;
      if (location.pathname === "/meetings") return;
      setMeetingsUnread((prev) => prev + 1);
      AudioUtils.ensureInitialized().catch(() => {});
      AudioUtils.playNotification().catch(() => {});
      sonnerToast("New meeting invitation", {
        description: meeting.title ? `You were invited to “${meeting.title}”` : "You were invited to a meeting",
        duration: 6000,
        action: { label: "View", onClick: () => navigate("/meetings") },
      });
    };

    on("chat:new-message-notification", handleChatPush);
    on("meeting:created", handleMeetingCreated);
    return () => {
      off("chat:new-message-notification", handleChatPush);
      off("meeting:created", handleMeetingCreated);
    };
  }, [isConnected, socket, userId, on, off, location.pathname, navigate]);

  // Clear the meetings dot whenever the user views the meetings screen
  useEffect(() => {
    if (location.pathname === "/meetings") setMeetingsUnread(0);
  }, [location.pathname]);

  // Listen for incoming calls
  useEffect(() => {
    if (!isConnected || !socket) return;

    const handleIncomingCall = (data: any) => {
      AudioUtils.ensureInitialized().catch(() => {});
      const callData: IncomingCallData = {
        callId: data.callId,
        callCode: data.callCode,
        from: data.from,
        fromName: data.fromName || data.callerName,
        callerName: data.callerName || data.fromName,
        type: data.type || 'video',
        roomId: data.roomId || data.callId,
        callLink: data.callLink,
        hasPassword: data.hasPassword,
        waitingRoomEnabled: data.waitingRoomEnabled,
      };
      incomingCallRef.current = callData;
      setIncomingCall(callData);

      // Persistent OS notification alongside the modal + ringtone so the
      // ring is discoverable while the tab is hidden.
      closeCallNotification();
      callNotificationRef.current = showNotification(
        `Incoming call from ${callData.callerName || callData.fromName || "Someone"}`,
        {
          body: callData.type === "audio" ? "📞 Audio call" : "🎥 Video call",
          icon: "/favicon.ico",
          tag: "call",
          requireInteraction: true,
        }
      );
    };

    const handleAccepted = (data: any) => {
      const current = incomingCallRef.current;
      if (current && data.callId === current.callId) {
        incomingCallRef.current = null;
        setIncomingCall(null);
      }
      AudioUtils.stopAllRingtones();
      closeCallNotification();
    };

    const handleRejected = (data: any) => {
      const current = incomingCallRef.current;
      if (current && data.callId === current.callId) {
        incomingCallRef.current = null;
        setIncomingCall(null);
      }
      AudioUtils.stopAllRingtones();
      closeCallNotification();
    };

    const handleEnded = (data: any) => {
      const current = incomingCallRef.current;
      if (current && data.callId === current.callId) {
        incomingCallRef.current = null;
        setIncomingCall(null);
      }
      AudioUtils.stopAllRingtones();
      closeCallNotification();
    };

    on('call:incoming', handleIncomingCall);
    on('call:accepted', handleAccepted);
    on('call:rejected', handleRejected);
    on('call:ended', handleEnded);
    return () => {
      off('call:incoming', handleIncomingCall);
      off('call:accepted', handleAccepted);
      off('call:rejected', handleRejected);
      off('call:ended', handleEnded);
    };
  }, [isConnected, socket, on, off, showNotification, closeCallNotification]);

  // Close the persistent call notification when the call modal closes
  useEffect(() => {
    if (!incomingCall) closeCallNotification();
  }, [incomingCall, closeCallNotification]);

  // Document title management. Priority: incoming-call flash > unread count
  // while hidden > normal app title.
  useEffect(() => {
    if (incomingCall) {
      let showingCallTitle = true;
      document.title = "📞 Incoming call...";
      const interval = window.setInterval(() => {
        showingCallTitle = !showingCallTitle;
        document.title = showingCallTitle ? "📞 Incoming call..." : APP_TITLE;
      }, 1000);
      return () => {
        window.clearInterval(interval);
        document.title = APP_TITLE;
      };
    }

    if (isHidden && totalUnread > 0) {
      document.title = `(${totalUnread}) Messages`;
      return () => {
        document.title = APP_TITLE;
      };
    }

    document.title = APP_TITLE;
  }, [incomingCall, isHidden, totalUnread]);

  // KYC State
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [kycCheckingPath, setKycCheckingPath] = useState<string | null>(null);

  const handleKycProtectedNavigation = async (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setKycCheckingPath(path);
    try {
      const response = await api.get('/kyc/status');
      const status = normalizeKycStatus(response.data);
      if (status.user_kyc_status === 'verified') {
        navigate(path);
      } else {
        setKycStatus(status);
        setShowKycModal(true);
      }
    } catch (error) {
       console.error("KYC check failed", error);
    } finally {
      setKycCheckingPath(null);
    }
  };

  useEffect(() => {
    const checkSubscription = async () => {
      // Skip check on subscription page or login
      if (location.pathname === '/subscription' || location.pathname === '/login') return;

      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await api.get('/subscription/current');

        if (response.data.success) {
          const sub = response.data.subscription;
          const isTrial = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date();
          const isPaid = sub.plan_price > 0 && sub.subscription_status === 'active';
          
          // Check if user is on Free plan (price 0) and trial has ended
          if (sub.plan_price === "0.00" || sub.plan_price === 0) {
             if (sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
                setAlertType('trial_ended');
                setShowSubscriptionAlert(true);
             }
          }
          
          // Or if status is cancelled/expired for paid plans (though logic above covers plan_price > 0)
          // If status is not active and not trial
          if (sub.subscription_status !== 'active' && !isTrial && sub.plan_price > 0) {
              setAlertType('expired');
              setShowSubscriptionAlert(true);
          }
        }
      } catch (error: any) {
         // Silently fail for network errors in background checks
         if (error.message && !error.message.includes("Unable to connect")) {
            console.error("Subscription check failed", error);
         }
      }
    };

    checkSubscription();
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("businessId");
    localStorage.removeItem("userName");
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <SidebarProvider>
      <AlertDialog open={showSubscriptionAlert} onOpenChange={setShowSubscriptionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Subscription Required</AlertDialogTitle>
            <AlertDialogDescription>
              {alertType === 'trial_ended' 
                ? "Your free trial has ended. Please subscribe to a plan to continue accessing features."
                : "Your subscription has expired. Please renew your subscription to continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate('/subscription')}>
              View Plans
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {kycStatus && (
        <KycModal 
           open={showKycModal} 
           onOpenChange={setShowKycModal} 
           status={kycStatus}
           onSuccess={() => setShowKycModal(false)}
        />
      )}

      <IncomingCallModal
        call={incomingCall}
        onClose={() => setIncomingCall(null)}
      />

      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
            <BrandMark size={32} />
            <span className="font-bold text-xl group-data-[collapsible=icon]:hidden truncate">Metricorex</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/dashboard")} tooltip="Dashboard" data-tour="nav-dashboard">
                <Link to="/dashboard">
                  <BarChart3 />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/tasks")} tooltip="Tasks" data-tour="nav-tasks">
                <Link to="/tasks">
                  <ListTodo />
                  <span>Tasks</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/board")} tooltip="Board" data-tour="nav-board">
                <Link to="/board">
                  <Kanban />
                  <span>Board</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/backlog")} tooltip="Backlog" data-tour="nav-backlog">
                <Link to="/backlog">
                  <ListTodo className="opacity-70" /> 
                  <span>Backlog</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/ideas")} tooltip="Ideas" data-tour="nav-ideas">
                <Link to="/ideas">
                  <Lightbulb />
                  <span>Ideas</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/meetings")} tooltip="Meetings" data-tour="nav-meetings" className="[&]:overflow-visible">
                <Link to="/meetings" className="relative flex items-center gap-2 w-full min-w-0">
                  <Calendar />
                  <span>Meetings</span>
                  {meetingsUnread > 0 && (
                    <>
                      {/* Expanded: small dot pinned to the end of the row */}
                      <span className="ml-auto flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-sidebar group-data-[collapsible=icon]:hidden" />
                      {/* Collapsed (icon-only): dot on the icon corner */}
                      <span className="absolute top-1 right-1 z-10 hidden h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-sidebar group-data-[collapsible=icon]:block" />
                    </>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/calendar")} tooltip="Calendar" data-tour="nav-calendar">
                <Link to="/calendar">
                  <CalendarDays />
                  <span>Calendar</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/chat")} tooltip="Chat" data-tour="nav-chat" className="[&]:overflow-visible">
                <Link to="/chat" className="relative flex items-center gap-2 w-full min-w-0">
                  <MessageSquare />
                  <span>Chat</span>
                  {totalUnread > 0 && (
                    <>
                      {/* Expanded: count pill inline after the label (never
                          clipped — it lives inside the flex row, no negative
                          offsets), styled like modern sidebar badges */}
                      <span
                        className={cn(
                          "ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white shadow-md shadow-red-500/30 ring-2 ring-sidebar group-data-[collapsible=icon]:hidden",
                          totalUnread > 99 && "text-[9px]"
                        )}
                      >
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                      {/* Collapsed (icon-only): dot on the icon corner */}
                      <span className="absolute top-1 right-1 z-10 hidden h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-sidebar group-data-[collapsible=icon]:block" />
                    </>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/metric-ai")} tooltip="MetricAi" data-tour="nav-metric-ai">
                <Link to="/metric-ai">
                  <Sparkles className="text-indigo-500" />
                  <span>MetricAi</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/calls")} tooltip="Calls" data-tour="nav-calls">
                <Link to="/calls">
                  <Video />
                  <span>Calls</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/recordings")} tooltip="Recordings" data-tour="nav-recordings">
                <Link to="/recordings">
                  <Mic />
                  <span>Recordings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/team")} tooltip="Team" data-tour="nav-team">
                <Link to="/team">
                  <Users />
                  <span>Team</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/ranking")} tooltip="Ranking" data-tour="nav-ranking">
                <Link to="/ranking">
                  <Target />
                  <span>Ranking</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/activity-logs")} tooltip="Activity Log" data-tour="nav-activity-logs">
                <Link to="/activity-logs">
                  <Activity />
                  <span>Activity Log</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/wallet")} tooltip="Wallet" data-tour="nav-wallet">
                <Link to="/wallet" onClick={(e) => handleKycProtectedNavigation(e, "/wallet")}>
                  {kycCheckingPath === "/wallet" ? <Loader2 className="animate-spin" /> : <Wallet />}
                  <span>Wallet</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/payroll")} tooltip="Payroll" data-tour="nav-payroll">
                <Link to="/payroll" onClick={(e) => handleKycProtectedNavigation(e, "/payroll")}>
                  {kycCheckingPath === "/payroll" ? <Loader2 className="animate-spin" /> : <Banknote />}
                  <span>Payroll</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/transfer-history")} tooltip="Transfer History" data-tour="nav-transfer-history">
                <Link to="/transfer-history">
                  <History />
                  <span>Transfer History</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/subscription")} tooltip="Subscription" data-tour="nav-subscription">
                <Link to="/subscription">
                  <CreditCard />
                  <span>Subscription</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/profile")} tooltip="Profile" data-tour="nav-profile">
                <Link to="/profile">
                  <UserCircle2 />
                  <span>Profile</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings" data-tour="nav-settings">
                <Link to="/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Guided product tour — replays the first-run walkthrough */}
              <SidebarMenuButton
                onClick={restartAppTour}
                tooltip="Take the tour"
                data-tour="restart-tour"
              >
                <Compass />
                <span>Take the tour</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setTheme(theme === "dark" ? "light" : "dark")} tooltip="Toggle Theme">
                {theme === "dark" ? <Sun /> : <Moon />}
                <span>Toggle Theme</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarSeparator />
            <SidebarMenuItem>
              {/* Avatar menu entry -> Profile page */}
              <SidebarMenuButton asChild tooltip="View profile">
                <Link to="/profile" className="flex items-center gap-2 min-w-0">
                  <span className="h-6 w-6 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 text-primary-foreground text-[10px] font-bold">
                    {userAvatar ? (
                      <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      userName.substring(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="truncate">{userName}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Logout" className="text-destructive hover:text-destructive">
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      {/* min-w-0: MAIN is a flex item of the sidebar wrapper — without it the
          automatic minimum size propagates the widest intrinsic child (e.g. the
          MetricAi header's nowrap subtitle) and the whole app scrolls
          horizontally on phones (measured: 433px on a 390px viewport). */}
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 flex-row">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
          </div>
          <div className="flex items-center gap-2">
            {/* Avatar menu -> Profile page (all breakpoints, incl. mobile) */}
            <Link
              to="/profile"
              title="View profile"
              aria-label="View profile"
              className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-violet-600 text-white text-xs font-bold shadow-sm ring-1 ring-border transition-transform hover:scale-105"
            >
              {userAvatar ? (
                <img src={userAvatar} alt={`${userName} avatar`} className="h-full w-full object-cover" />
              ) : (
                userName.substring(0, 2).toUpperCase()
              )}
            </Link>
            <NotificationBell />
          </div>
        </header>
        {/* Announcement bar (polls /public/app-config; renders nothing when
            there is no active announcement or it was dismissed) */}
        <AnnouncementTicker />
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 overflow-x-hidden min-w-0">
          {children}
        </div>
      </SidebarInset>
      {/* First-run guided tour (skip/next/back, restartable from the sidebar) */}
      <AppTour />
    </SidebarProvider>
  );
}
