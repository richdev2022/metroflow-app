import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Video, VideoOff, MonitorUp, Loader2, Pin, PinOff, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
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

function QualityIcon({ quality }: { quality: RemoteParticipant["connectionQuality"] }) {
  if (quality === "good") return <SignalHigh className="h-3 w-3" />;
  if (quality === "fair") return <SignalMedium className="h-3 w-3" />;
  if (quality === "poor") return <SignalLow className="h-3 w-3" />;
  return null;
}

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== videoStream) {
      el.srcObject = videoStream || null;
    }
    if (videoStream) {
      el.play().catch(() => {});
    }
  }, [videoStream]);

  const displayName = isLocal ? `${label || "You"} (You)` : participant?.name || label || "Guest";
  const initials = useMemo(() => {
    const source = (participant?.name || label || "G").trim();
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  }, [participant?.name, label]);

  const audioEnabled = isLocal
    ? (localMediaState?.audioEnabled ?? true)
    : !participant?.audioMuted;
  const videoEnabled = isLocal
    ? (localMediaState?.videoEnabled ?? !!videoStream)
    : !participant?.videoMuted;

  const speaking = isLocal ? !!localSpeaking && audioEnabled : !!participant?.isSpeaking && !participant?.audioMuted;
  const hasVideo = isLocal ? (!!videoStream && videoEnabled) : !!videoStream && videoEnabled;
  const quality = isLocal ? "unknown" : participant?.connectionQuality || "unknown";

  return (
    <div
      className={cn(
        "group/tile relative min-h-0 overflow-hidden rounded-2xl border bg-[#141B2E] transition-all duration-300",
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-b from-[#141B2E] to-[#0B0F1A] px-2">
          <div
            className={cn(
              "relative flex items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] font-semibold text-white",
              large ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg",
              speaking && "speak-glow rounded-full",
            )}
          >
            {initials || <Loader2 className="h-5 w-5 animate-spin text-white/60" />}
            {speaking && <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400/25" />}
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

      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="max-w-[70%] truncate rounded-lg bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {displayName}
        </span>
        <span className="flex items-center gap-1">
          {participant?.screenSharing && (
            <span className="rounded-lg bg-indigo-500/90 p-1 text-white" title="Sharing screen">
              <MonitorUp className="h-3 w-3" />
            </span>
          )}
          {quality !== "unknown" && (
            <span
              className={cn(
                "rounded-lg bg-black/55 p-1 text-white backdrop-blur-sm",
                quality === "poor" && "text-amber-400",
              )}
              title={`Connection: ${quality}`}
            >
              <QualityIcon quality={quality} />
            </span>
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
          {hasVideo ? (
            <span className="rounded-lg bg-black/55 p-1 text-white backdrop-blur-sm" title="Camera on">
              <Video className="h-3 w-3" />
            </span>
          ) : (
            <span className="rounded-lg bg-black/55 p-1 text-white/60 backdrop-blur-sm" title="Camera off">
              <VideoOff className="h-3 w-3" />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
