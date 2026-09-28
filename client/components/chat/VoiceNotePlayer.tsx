import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatSeconds } from '@/lib/voice-recorder';
import { cn } from '@/lib/utils';

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

interface VoiceNotePlayerProps {
  /** Audio URL (chat media upload). */
  src: string;
  /** Sent (gradient bubble) vs received (muted bubble) styling. */
  isOwn: boolean;
}

/**
 * Compact WhatsApp-style voice-note player. Renders INSIDE a message bubble
 * and adapts to its colors: own messages use translucent white controls on
 * the gradient bubble, received messages use primary-tinted controls.
 * One HTMLAudioElement per instance; seekable progress + speed toggle.
 */
export function VoiceNotePlayer({ src, isOwn }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeedIdx(0);

    const syncDuration = () => {
      // MediaRecorder webm files often report Infinity until fully parsed;
      // the seek-to-huge-time trick forces Chrome to compute the real length.
      if (audio.duration === Infinity) {
        const onSeeked = () => {
          audio.removeEventListener('seeked', onSeeked);
          audio.currentTime = 0;
          if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
        };
        audio.addEventListener('seeked', onSeeked);
        try {
          audio.currentTime = 1e101;
        } catch {
          audio.removeEventListener('seeked', onSeeked);
        }
        return;
      }
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };

    const onLoadedMetadata = () => syncDuration();
    const onDurationChange = () => syncDuration();
    const onTimeUpdate = () => {
      if (!seekingRef.current) setCurrentTime(audio.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      try {
        audio.currentTime = 0;
      } catch {}
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.removeAttribute('src');
      audioRef.current = null;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = PLAYBACK_SPEEDS[speedIdx];
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleSeek = (value: number) => {
    setCurrentTime(value);
    const audio = audioRef.current;
    if (audio && isFinite(value)) {
      try {
        audio.currentTime = value;
      } catch {}
    }
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIdx + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIdx(nextIdx);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = PLAYBACK_SPEEDS[nextIdx];
  };

  const maxDuration = duration > 0 ? duration : Math.max(currentTime, 0.1);
  const speed = PLAYBACK_SPEEDS[speedIdx];

  return (
    <div className={cn('flex items-center gap-2 w-full min-w-[210px] py-0.5', isOwn ? 'text-white' : 'text-foreground')}>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90',
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-primary/10 hover:bg-primary/20 text-primary'
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <input
        type="range"
        min={0}
        max={maxDuration}
        step={0.1}
        value={Math.min(currentTime, maxDuration)}
        aria-label="Seek voice note"
        onChange={(e) => handleSeek(Number(e.target.value))}
        onPointerDown={() => {
          seekingRef.current = true;
        }}
        onPointerUp={() => {
          seekingRef.current = false;
        }}
        onPointerCancel={() => {
          seekingRef.current = false;
        }}
        onKeyDown={() => {
          seekingRef.current = true;
        }}
        onKeyUp={() => {
          seekingRef.current = false;
        }}
        style={{ accentColor: isOwn ? '#ffffff' : 'hsl(var(--primary))' }}
        className="flex-1 min-w-0 h-1.5 cursor-pointer"
      />

      <span className="text-[10px] tabular-nums opacity-75 shrink-0 min-w-[30px] text-right">
        {formatSeconds(duration > 0 ? duration : currentTime)}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        title="Playback speed"
        aria-label={`Playback speed ${speed}x`}
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors',
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-muted hover:bg-accent text-muted-foreground'
        )}
      >
        {speed}x
      </button>
    </div>
  );
}
