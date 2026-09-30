import { useEffect, useMemo, useRef, useState } from "react";
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
  Volume2,
  Bluetooth,
  Headphones,
  Phone,
  Check,
} from "lucide-react";
import type { AudioOutputDevice } from "@/lib/calling";

interface ControlButtonSpec {
  key: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
  /** Not rendered at all (e.g. screen share on devices without getDisplayMedia). */
  hidden?: boolean;
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
  /** When getDisplayMedia is missing (mobile browsers) the share button is hidden. */
  screenShareSupported?: boolean;
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
  /** Audio output routing (speaker / earpiece / bluetooth). */
  speakerDevices?: AudioOutputDevice[];
  selectedSinkId?: string;
  sinkSupported?: boolean;
  onSelectSpeaker?: (deviceId: string) => void;
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

function routeIcon(kind: AudioOutputDevice["kind"]) {
  if (kind === "bluetooth") return <Bluetooth className="h-4 w-4 shrink-0" />;
  if (kind === "headset") return <Headphones className="h-4 w-4 shrink-0" />;
  if (kind === "earpiece") return <Phone className="h-4 w-4 shrink-0" />;
  return <Volume2 className="h-4 w-4 shrink-0" />;
}

/**
 * Speaker-route popover (Google-Dialer-style output picker). Falls back to a
 * friendly system-routing notice on browsers without setSinkId (iOS Safari).
 */
function SpeakerRouteControl({
  devices,
  selectedSinkId,
  sinkSupported,
  onSelect,
}: {
  devices: AudioOutputDevice[];
  selectedSinkId: string;
  sinkSupported: boolean;
  onSelect: (deviceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside press (touch + mouse).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as any);
  }, [open]);

  const activeDevice = useMemo(
    () => devices.find((d) => (d.deviceId || "") === (selectedSinkId || "")),
    [devices, selectedSinkId],
  );

  if (!sinkSupported) {
    return (
      <div
        title="Audio routing follows the system — connect Bluetooth from Control Center"
        aria-label="Audio routing follows the system"
        className={cn(
          "relative flex h-12 w-12 shrink-0 cursor-help items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/60 backdrop-blur sm:h-11 sm:w-11",
          "phone-landscape:h-10 phone-landscape:w-10",
        )}
      >
        <Volume2 className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={activeDevice ? `Audio output: ${activeDevice.label}` : "Audio output"}
        aria-label="Audio output"
        aria-expanded={open}
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full border transition-all sm:h-11 sm:w-11",
          "phone-landscape:h-10 phone-landscape:w-10",
          "border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/20 active:scale-95",
          open && "border-transparent bg-white text-[#0B0F1A] hover:bg-white/90",
        )}
      >
        {activeDevice ? routeIcon(activeDevice.kind) : <Volume2 className="h-5 w-5" />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Audio output devices"
          className="absolute bottom-[calc(100%+0.6rem)] left-1/2 z-40 w-60 max-w-[80vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#141B2E]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Audio output
          </p>
          {(devices.length > 0 ? devices : [{ deviceId: "", label: "System default", kind: "default" as const }]).map((d) => {
            const active = (d.deviceId || "") === (selectedSinkId || "");
            return (
              <button
                key={d.deviceId || "system-default"}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSelect(d.deviceId);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm transition-colors",
                  active ? "bg-[#2563EB]/25 text-white" : "text-white/75 hover:bg-white/10",
                )}
              >
                {routeIcon(d.kind)}
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
      // Hidden entirely on devices without display capture (mobile browsers):
      // a disabled ghost button invited taps that could only ever fail.
      ...(props.screenShareSupported === false
        ? { hidden: true as const }
        : {}),
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
    <div className="pointer-events-auto flex w-full max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#141B2E]/85 px-2.5 py-2 backdrop-blur-xl sm:gap-2">
      {buttons.filter((spec) => !spec.hidden).map((spec) => (
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
      {props.onSelectSpeaker && (
        <SpeakerRouteControl
          devices={props.speakerDevices || []}
          selectedSinkId={props.selectedSinkId || ""}
          sinkSupported={props.sinkSupported !== false}
          onSelect={props.onSelectSpeaker}
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
      {/* Leave — ≥44px hit target on every device, never clipped, icon-only on
          small screens; label appears from sm up when there's room. */}
      <button
        type="button"
        onClick={props.onLeave}
        title={props.leaveLabel || "Leave"}
        aria-label={props.leaveLabel || "Leave"}
        className={cn(
          "flex h-12 min-h-[44px] min-w-[44px] max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-red-600 px-4 text-white transition-all hover:bg-red-500 active:scale-95 sm:h-11 sm:min-w-16 sm:px-5",
          "phone-landscape:h-10 phone-landscape:min-h-[40px]",
        )}
      >
        <PhoneOff className="h-5 w-5" />
        <span className="ml-1.5 hidden text-sm font-medium sm:inline">{props.leaveLabel || "Leave"}</span>
      </button>
    </div>
  );
}
