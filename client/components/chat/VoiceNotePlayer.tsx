import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { formatSeconds } from '@/lib/voice-recorder';
import { getMediaSourceCandidates } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

interface VoiceNotePlayerProps {
  /** Audio URL (chat media upload). May be relative ("/uploads/..") or absolute. */
  src: string;
  /** Sent (gradient bubble) vs received (muted bubble) styling. */
  isOwn: boolean;
}

/**
 * Compact WhatsApp-style voice-note player. Renders INSIDE a message bubble
 * and adapts to its colors: own messages use translucent white controls on
 * the gradient bubble, received messages use primary-tinted controls.
 * One HTMLAudioElement per instance; seekable progress + speed toggle.
 *
 * Playback hardening: the backend may return root-relative attachment URLs
 * (which 404 when the app and API live on different origins). We resolve the
 * URL via lib/media-url.ts and, if loading still fails, walk through the
 * alternate URL candidates (with "/api" stripped/added) before showing an
 * error state with a retry button.
 *
 * CORS note: plain <audio> playback does NOT need crossOrigin (CORS is only
 * required when reading raw samples via WebAudio). We therefore deliberately
 * keep crossOrigin unset — setting it would force the CDN to approve CORS and
 * would BREAK playback when it doesn't.
 */
export function VoiceNotePlayer({ src, isOwn }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekingRef = useRef(false);
  // Candidate URLs derived from `src` (resolved absolute + /api variants).
  const candidatesRef = useRef<string[]>([]);
  const candidateIdxRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by retry / fallback

  // Rebuild the candidate list whenever the message's attachment URL changes.
  useEffect(() => {
    candidatesRef.current = getMediaSourceCandidates(src);
    candidateIdxRef.current = 0;
    // No URL at all -> nothing to load; show the unavailable state.
    setFailed(candidatesRef.current.length === 0);
    setAttempt(a => a + 1);
  }, [src]);

  const advanceToNextCandidate = useCallback(() => {
    const candidates = candidatesRef.current;
    if (candidateIdxRef.current + 1 < candidates.length) {
      // Try the next URL variant before declaring failure.
      candidateIdxRef.current += 1;
      setFailed(false);
      setAttempt(a => a + 1);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const candidates = candidatesRef.current;
    if (candidates.length === 0) return;
    const activeUrl = candidates[Math.min(candidateIdxRef.current, candidates.length - 1)];

    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeedIdx(0);
    audio.src = activeUrl;

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
    const onError = () => {
      audio.pause();
      if (!advanceToNextCandidate()) {
        setFailed(true);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Kick off metadata preload immediately (preload="metadata").
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [src, attempt, advanceToNextCandidate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = PLAYBACK_SPEEDS[speedIdx];
      audio.play().catch(() => {
        // Autoplay/race failure — surface the retry UI rather than dying silently.
        if (!advanceToNextCandidate()) setFailed(true);
      });
    } else {
      audio.pause();
    }
  };

  const retry = () => {
    // Restart from the first candidate on an explicit user retry.
    candidateIdxRef.current = 0;
    setFailed(false);
    setAttempt(a => a + 1);
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

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 w-full min-w-[210px] rounded-lg px-2 py-1.5',
          isOwn ? 'bg-white/15 text-white' : 'bg-red-500/10 text-red-600 dark:text-red-400'
        )}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-0 text-[11px] leading-tight truncate">
          Voice note unavailable
        </span>
        <button
          type="button"
          onClick={retry}
          aria-label="Retry voice note"
          title="Retry"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90',
            isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-500/15 hover:bg-red-500/25'
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

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
