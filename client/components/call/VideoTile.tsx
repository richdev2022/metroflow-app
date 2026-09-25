import { useEffect, useRef } from 'react';
import { Mic, MicOff, MonitorUp, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VideoTileProps {
  /** stream to render (null for audio-only / video-off) */
  stream?: MediaStream | null;
  name: string;
  isLocal?: boolean;
  audioEnabled?: boolean;
  videoAvailable?: boolean;
  isTalking?: boolean;
  isScreenShare?: boolean;
  isGuest?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  className?: string;
  mirrored?: boolean;
  showControlsOnHover?: boolean;
}

const AVATAR_COLORS = [
  'bg-gradient-to-br from-blue-500 to-indigo-600',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-violet-500 to-purple-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-amber-500 to-orange-600',
  'bg-gradient-to-br from-cyan-500 to-sky-600',
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function VideoTile({
  stream,
  name,
  isLocal,
  audioEnabled = true,
  videoAvailable = true,
  isTalking,
  isScreenShare,
  isGuest,
  isPinned,
  onPin,
  className,
  mirrored = true,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => undefined);
    }
    if (!stream) el.srcObject = null;
  }, [stream]);

  const showVideo = !!stream && videoAvailable;

  return (
    <div
      className={cn(
        'group relative overflow-hidden bg-[#1f2033] select-none',
        isScreenShare ? 'rounded-lg' : 'rounded-xl',
        isTalking && !isScreenShare && 'ring-2 ring-emerald-400/90',
        className,
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'h-full w-full object-cover',
            isScreenShare && 'object-contain bg-black',
            isLocal && mirrored && !isScreenShare && 'scale-x-[-1]',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div
            className={cn(
              'flex items-center justify-center rounded-full text-white font-semibold shadow-lg',
              colorFor(name),
              isScreenShare ? 'h-16 w-16 text-lg' : 'h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl',
            )}
          >
            {initialsOf(name)}
          </div>
        </div>
      )}

      {/* name / status bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-6">
        {audioEnabled ? (
          <Mic className="h-3.5 w-3.5 text-white/90" />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-rose-400" />
        )}
        <span className="truncate text-xs font-medium text-white/95">
          {name}
          {isLocal && ' (You)'}
          {isGuest && <span className="ml-1 rounded bg-white/15 px-1 py-px text-[10px]">Guest</span>}
        </span>
      </div>

      {isScreenShare && (
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
          <MonitorUp className="h-3 w-3" /> Screen
        </div>
      )}

      {onPin && showVideo && !isLocal && (
        <button
          onClick={onPin}
          className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/75"
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
