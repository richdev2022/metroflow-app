import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  MessageSquare,
  Users,
  Captions,
  MoreVertical,
  PhoneOff,
  PictureInPicture2,
  SwitchCamera,
} from "lucide-react";

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
  /** Collapse the call into a floating bubble (call keeps running). */
  onMinimize?: () => void;
  onLeave: () => void;
  leaveLabel?: string;
  /** Mobile: swap video between front/back camera. */
  onSwitchCamera?: () => void;
  showSwitchCamera?: boolean;
  /** Audio-only room — camera control disabled. */
  audioOnlyRoom?: boolean;
}

function CtrlButton({ spec, small }: { spec: ControlButtonSpec; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={spec.onClick}
      disabled={spec.disabled}
      title={spec.label}
      aria-label={spec.label}
      aria-pressed={spec.active}
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all sm:h-11 sm:w-11",
        "phone-landscape:h-10 phone-landscape:w-10",
        "border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/20 active:scale-95",
        spec.active && "border-transparent bg-white text-[#0B0F1A] hover:bg-white/90",
        spec.danger && "border-transparent bg-red-600 text-white hover:bg-red-500",
        spec.disabled && "cursor-not-allowed opacity-40 hover:bg-white/10",
      )}
    >
      {spec.icon}
      {spec.badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {spec.badge > 9 ? "9+" : spec.badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The room's bottom control dock. Icon-only buttons that wrap onto extra rows
 * on narrow screens — nothing is ever clipped (fixes iOS Safari cutoffs).
 * Safe-area padding is applied by the footer wrapper.
 */
export function ControlBar(props: ControlBarProps) {
  const buttons: ControlButtonSpec[] = [
    {
      key: "mic",
      icon: props.audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />,
      label: props.audioEnabled ? "Mute microphone" : "Unmute microphone",
      active: !props.audioEnabled,
      onClick: props.onToggleAudio,
    },
    {
      key: "cam",
      icon: props.videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />,
      label: props.videoEnabled ? "Turn camera off" : "Turn camera on",
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
      key: "captions",
      icon: <Captions className="h-5 w-5" />,
      label: props.captionsEnabled ? "Hide captions" : "Live captions",
      active: props.captionsEnabled,
      disabled: !props.captionsSupported,
      onClick: props.onToggleCaptions,
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
  ];

  return (
    <div className="pointer-events-auto flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#141B2E]/85 px-2.5 py-2 backdrop-blur-xl sm:gap-2">
      {buttons.map((spec) => (
        <CtrlButton key={spec.key} spec={spec} />
      ))}
      {props.showSwitchCamera && (
        <CtrlButton
          spec={{
            key: "flip",
            icon: <SwitchCamera className="h-5 w-5" />,
            label: "Switch camera",
            onClick: props.onSwitchCamera || (() => {}),
          }}
        />
      )}
      {props.onMinimize && (
        <CtrlButton
          spec={{
            key: "minimize",
            icon: <PictureInPicture2 className="h-5 w-5" />,
            label: "Minimize call",
            onClick: props.onMinimize,
          }}
        />
      )}
      {props.onMore && (
        <CtrlButton
          spec={{
            key: "more",
            icon: <MoreVertical className="h-5 w-5" />,
            label: "More options",
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
          "flex h-12 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-500 active:scale-95 sm:h-11 sm:w-16",
          "phone-landscape:h-10",
        )}
      >
        <PhoneOff className="h-5 w-5" />
        <span className="ml-1.5 hidden text-sm font-medium sm:inline">{props.leaveLabel || "Leave"}</span>
      </button>
    </div>
  );
}
