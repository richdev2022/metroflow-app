import { cn } from "@/lib/utils";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, MessageSquare, Users, Captions, MoreVertical, PhoneOff } from "lucide-react";

interface ControlButtonSpec {
  key: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
  onClick: () => void;
}

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  participantsOpen: boolean;
  captionsEnabled: boolean;
  captionsSupported: boolean;
  unreadChat: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onToggleCaptions: () => void;
  onMore?: () => void;
  onLeave: () => void;
  leaveLabel?: string;
  /** Mobile: swap video between front/back camera. */
  onSwitchCamera?: () => void;
  showSwitchCamera?: boolean;
  /** Compact layout for small screens. */
  compactMode?: boolean;
  /** Audio-only room — camera control disabled. */
  audioOnlyRoom?: boolean;
}

function CtrlButton({
  spec,
  compact,
}: {
  spec: ControlButtonSpec;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={spec.onClick}
      disabled={spec.disabled}
      title={spec.label}
      aria-label={spec.label}
      aria-pressed={spec.active}
      className={cn(
        "relative flex items-center justify-center rounded-full transition-all",
        compact ? "h-11 w-11" : "h-12 w-12",
        "border border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/20",
        spec.active && "bg-white text-[#0B0F1A] hover:bg-white/90",
        spec.danger && "border-transparent bg-red-600 text-white hover:bg-red-500",
        spec.disabled && "cursor-not-allowed opacity-40 hover:bg-white/10",
      )}
    >
      {spec.icon}
      {!compact && (spec.active ? spec.label : spec.label)}
      {spec.badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {spec.badge > 9 ? "9+" : spec.badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The room's bottom control dock. Provider-agnostic — every action maps to a
 * CallingClient call or an app-level socket event handled by the container.
 */
export function ControlBar(props: ControlBarProps) {
  const compact = props.compactMode;
  const buttons: ControlButtonSpec[] = [
    {
      key: "mic",
      icon: props.audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />,
      label: props.audioEnabled ? "Mute" : "Unmute",
      active: !props.audioEnabled,
      onClick: props.onToggleAudio,
    },
    {
      key: "cam",
      icon: props.videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />,
      label: props.videoEnabled ? "Stop video" : "Start video",
      active: !props.videoEnabled,
      disabled: props.audioOnlyRoom,
      onClick: props.onToggleVideo,
    },
    {
      key: "share",
      icon: props.screenSharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />,
      label: props.screenSharing ? "Stop sharing" : "Share screen",
      active: props.screenSharing,
      onClick: props.onToggleScreenShare,
    },
    {
      key: "chat",
      icon: <MessageSquare className="h-5 w-5" />,
      label: "Chat",
      active: props.chatOpen,
      badge: props.unreadChat,
      onClick: props.onToggleChat,
    },
    {
      key: "participants",
      icon: <Users className="h-5 w-5" />,
      label: "Participants",
      active: props.participantsOpen,
      onClick: props.onToggleParticipants,
    },
    {
      key: "captions",
      icon: <Captions className="h-5 w-5" />,
      label: props.captionsEnabled ? "Hide captions" : "Captions",
      active: props.captionsEnabled,
      disabled: !props.captionsSupported,
      onClick: props.onToggleCaptions,
    },
  ];

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#141B2E]/85 px-3 py-2 backdrop-blur-xl",
        "max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {buttons.map((spec) => (
        <CtrlButton key={spec.key} spec={spec} compact={compact} />
      ))}
      {props.showSwitchCamera && (
        <CtrlButton
          compact={compact}
          spec={{
            key: "flip",
            icon: <MoreVertical className="h-5 w-5" />,
            label: "Switch camera",
            onClick: props.onSwitchCamera || (() => {}),
          }}
        />
      )}
      {props.onMore && (
        <CtrlButton
          compact={compact}
          spec={{
            key: "more",
            icon: <MoreVertical className="h-5 w-5" />,
            label: "More",
            onClick: props.onMore,
          }}
        />
      )}
      <button
        type="button"
        onClick={props.onLeave}
        title={props.leaveLabel || "Leave"}
        aria-label={props.leaveLabel || "Leave"}
        className={cn(
          "flex items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-500",
          compact ? "h-12 w-14" : "h-12 w-16",
        )}
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}
