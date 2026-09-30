import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, VideoOff, MonitorUp, Loader2, Pin, PinOff } from "lucide-react";
import type { LocalMediaState, RemoteParticipant } from "@/lib/calling";

interface ParticipantTileProps {
  participant: RemoteParticipant | null;
  isLocal?: boolean;
  localStream?: MediaStream | null;
  label?: string;
  className?: string;
  isRoomAudioOnly?: boolean;
  large?: boolean;
  /** Local mic/cam flags — drives the local tile's badges. */
  localMediaState?: LocalMediaState;
  /** Local user is the current active speaker. */
  localSpeaking?: boolean;
  /** Tile is pinned to the stage (Google Meet "pin"). */
  pinned?: boolean;
  onTogglePin?: () => void;
  hidePin?: boolean;
}

const QUALITY_DOT: Record<RemoteParticipant["connectionQuality"], string | null> = {
  good: "bg-emerald-400",
  fair: "bg-amber-400",
  poor: "bg-red-400",
  unknown: null,
};

/**
 * One video tile in the call room grid. Renders remote camera video, a local
 * mirror, or an avatar fallback for audio-only participants. Tap/click the
 * tile to pin it to the stage (Google Meet behaviour). The tile is completely
 * provider-agnostic — it only knows MediaStream objects.
 */
export function ParticipantTile({
  participant,
  isLocal,
  localStream,
  label,
  className,
  isRoomAudioOnly,
  large,
  localMediaState,
  localSpeaking,
  pinned,
  onTogglePin,
  hidePin,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStream = isLocal ? localStream : participant?.videoStream || null;

  const audioEnabled = isLocal
    ? (localMediaState?.audioEnabled ?? true)
    : !participant?.audioMuted;
  const videoEnabled = isLocal
    ? (localMediaState?.videoEnabled ?? !!videoStream)
    : !participant?.videoMuted;
  const hasVideo = !!videoStream && videoEnabled;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!hasVideo) {
      if (el.srcObject) el.srcObject = null;
      return;
    }
    // Re-attach whenever the stream OR the enabled flag changes. On iOS Safari
    // a track that was disabled (camera off) can leave the <video> element
    // stuck on the last frame even after re-enable — forcing srcObject re-set
    // + play() makes OFF→ON deterministic on every browser.
    if (el.srcObject !== videoStream) {
      el.srcObject = videoStream;
    } else {
      el.srcObject = null;
      el.srcObject = videoStream;
    }
    el.play().catch(() => {});
  }, [videoStream, hasVideo]);

  const displayName = isLocal ? `${label || "You"} (You)` : participant?.name || label || "Guest";
  const initials = useMemo(() => {
    const source = (participant?.name || label || "G").trim();
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  }, [participant?.name, label]);

  const speaking = isLocal ? !!localSpeaking && audioEnabled : !!participant?.isSpeaking && !participant?.audioMuted;
  const quality = isLocal ? "unknown" : participant?.connectionQuality || "unknown";
  const qualityDot = QUALITY_DOT[quality];

  return (
    <div
      className={cn(
        "group/tile relative min-h-0 overflow-hidden rounded-2xl border bg-white/[0.06] backdrop-blur-sm transition-all duration-300",
        "animate-in fade-in zoom-in-95 duration-200",
        speaking
          ? "speak-glow border-emerald-400/80"
          : pinned
            ? "border-[#60A5FA]/70"
            : "border-white/10",
        className,
      )}
      onClick={onTogglePin && !hidePin ? onTogglePin : undefined}
      role={onTogglePin && !hidePin ? "button" : undefined}
      title={onTogglePin && !hidePin ? (pinned ? "Unpin participant" : "Pin participant") : undefined}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn("h-full w-full object-cover", isLocal && "scale-x-[-1]")}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-b from-white/[0.07] to-transparent px-2">
          <div
            className={cn(
              "relative flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white/15",
              "bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#60A5FA]",
              large ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg",
              speaking && "speak-glow rounded-full ring-emerald-300/40",
            )}
          >
            {initials || <Loader2 className="h-5 w-5 animate-spin text-white/60" />}
            {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />}
          </div>
          <span className="max-w-full truncate text-sm text-white/70">{displayName}</span>
          {isRoomAudioOnly && !isLocal && (
            <span className="text-[11px] uppercase tracking-wide text-white/35">audio only</span>
          )}
        </div>
      )}

      {isLocal && !audioEnabled && !hasVideo && (
        <div className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-black">
          mic off
        </div>
      )}

      {/* Pin affordance — hover on desktop, always visible once pinned. */}
      {onTogglePin && !hidePin && (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          className={cn(
            "absolute left-2 top-2 z-10 rounded-lg p-1.5 text-white backdrop-blur transition-all",
            pinned
              ? "bg-[#2563EB]/90 text-white opacity-100"
              : "bg-black/45 opacity-0 hover:bg-black/65 group-hover/tile:opacity-100 focus-visible:opacity-100",
            "max-sm:opacity-0", // touch: tap the tile itself to pin
            pinned && "max-sm:opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      )}

      {pinned && (
        <span className="absolute right-2 top-2 z-10 rounded-lg bg-[#2563EB]/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
          Pinned
        </span>
      )}

      {/* Name chip with initials avatar + status cluster */}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 max-w-[75%] items-center gap-1.5 rounded-lg bg-black/55 py-0.5 pl-0.5 pr-2 backdrop-blur-sm">
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#2563EB] to-[#60A5FA] text-[9px] font-bold text-white",
            )}
          >
            {initials || "?"}
          </span>
          <span className="truncate text-xs font-medium text-white">{displayName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {isLocal && hasVideo && (
            <span className="rounded-lg bg-black/55 px-1.5 py-1 text-[9px] font-bold tracking-wide text-emerald-300 backdrop-blur-sm" title="High definition">
              HD
            </span>
          )}
          {participant?.screenSharing && (
            <span className="rounded-lg bg-indigo-500/90 p-1 text-white" title="Sharing screen">
              <MonitorUp className="h-3 w-3" />
            </span>
          )}
          {qualityDot && (
            <span
              className={cn("h-2 w-2 rounded-full ring-1 ring-black/40", qualityDot)}
              title={`Connection: ${quality}`}
            />
          )}
          {audioEnabled ? (
            <span
              className={cn(
                "rounded-lg p-1 text-white backdrop-blur-sm",
                speaking ? "bg-emerald-500/90" : "bg-black/55",
              )}
              title={audioEnabled ? "Mic on" : "Muted"}
            >
              <Mic className="h-3 w-3" />
            </span>
          ) : (
            <span className="rounded-lg bg-red-500/90 p-1 text-white" title="Muted">
              <MicOff className="h-3 w-3" />
            </span>
          )}
          {!hasVideo && (
            <span className="rounded-lg bg-black/55 p-1 text-white/60 backdrop-blur-sm" title="Camera off">
              <VideoOff className="h-3 w-3" />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
