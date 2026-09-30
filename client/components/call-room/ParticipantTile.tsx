import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Loader2 } from "lucide-react";
import type { RemoteParticipant } from "@/lib/calling";

interface ParticipantTileProps {
  participant: RemoteParticipant | null;
  isLocal?: boolean;
  localStream?: MediaStream | null;
  label?: string;
  className?: string;
  isRoomAudioOnly?: boolean;
  large?: boolean;
}

/**
 * One video tile in the call room grid. Renders remote camera video, a local
 * mirror, or an avatar fallback for audio-only participants. The tile is
 * completely provider-agnostic — it only knows MediaStream objects.
 */
export function ParticipantTile({
  participant,
  isLocal,
  localStream,
  label,
  className,
  isRoomAudioOnly,
  large,
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

  const speaking = participant?.isSpeaking && !participant?.audioMuted;
  const hasVideo = !!videoStream && !(isLocal ? false : participant?.videoMuted);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[#141B2E] transition-all",
        speaking ? "border-emerald-400/70 ring-2 ring-emerald-400/40" : "border-white/10",
        className,
      )}
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#141B2E] to-[#0B0F1A]">
          <div
            className={cn(
              "flex items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] font-semibold text-white",
              large ? "h-24 w-24 text-3xl" : "h-14 w-14 text-lg",
            )}
          >
            {initials || <Loader2 className="h-5 w-5 animate-spin text-white/60" />}
          </div>
          <span className="max-w-[80%] truncate text-sm text-white/70">{displayName}</span>
          {isRoomAudioOnly && !isLocal && (
            <span className="text-[11px] uppercase tracking-wide text-white/35">audio only</span>
          )}
        </div>
      )}

      {isLocal && !hasVideo && localStream?.getAudioTracks().length === 0 && (
        <div className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-black">
          no microphone
        </div>
      )}

      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="max-w-[70%] truncate rounded-lg bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {displayName}
        </span>
        <span className="flex items-center gap-1">
          {(participant?.audioMuted ?? !isLocal) && (
            <span className="rounded-lg bg-red-500/90 p-1 text-white" title="Muted">
              <MicOff className="h-3 w-3" />
            </span>
          )}
          {participant?.screenSharing && (
            <span className="rounded-lg bg-indigo-500/90 p-1 text-white" title="Sharing screen">
              <MonitorUp className="h-3 w-3" />
            </span>
          )}
          {participant?.connectionQuality === "poor" && (
            <span className="rounded-lg bg-amber-500/90 p-1 text-white" title="Poor connection">
              <Loader2 className="h-3 w-3 animate-pulse" />
            </span>
          )}
        </span>
      </div>

      {isLocal && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-80">
          {localStream?.getAudioTracks().length ? (
            <span className="rounded-lg bg-black/45 p-1 text-white">
              <Mic className="h-3 w-3" />
            </span>
          ) : (
            <span className="rounded-lg bg-black/45 p-1 text-white/60">
              <MicOff className="h-3 w-3" />
            </span>
          )}
          {hasVideo ? (
            <span className="rounded-lg bg-black/45 p-1 text-white">
              <Video className="h-3 w-3" />
            </span>
          ) : (
            <span className="rounded-lg bg-black/45 p-1 text-white/60">
              <VideoOff className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
