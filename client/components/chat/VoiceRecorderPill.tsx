import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pickVoiceMimeType, voiceNoteExtension, formatDuration } from '@/lib/voice-recorder';

interface VoiceRecorderPillProps {
  /** Called with the recorded audio file when the user taps send. */
  onSend: (file: File) => void;
  /** Called when the user discards the recording. */
  onCancel: () => void;
  /** Called when the mic cannot be started (permission denied, no device…). */
  onError: (message: string) => void;
}

/**
 * WhatsApp-style voice recording pill. Mounts over the composer while
 * recording: pulsing red dot, elapsed timer, cancel + send buttons.
 * Owns the MediaRecorder + MediaStream lifecycle and cleans up on unmount.
 */
export function VoiceRecorderPill({ onSend, onCancel, onError }: VoiceRecorderPillProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    let timer: number | undefined;
    let disposed = false;

    const cleanupMedia = () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickVoiceMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(250); // gather chunks periodically for reliable blobs
        startedAtRef.current = Date.now();
        setStarting(false);
        timer = window.setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 200);
      } catch (err: any) {
        if (disposed) return;
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        const message = denied
          ? 'Microphone access was denied. Allow mic permission in your browser settings to record voice notes.'
          : 'Could not access the microphone. Please check your device and try again.';
        cleanupMedia();
        onError(message);
        onCancel();
      }
    };

    start();

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAndCollect = (): Promise<{ blob: Blob; mimeType: string } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') return resolve(null);
      const mimeType = recorder.mimeType || pickVoiceMimeType() || 'audio/webm';
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolve({ blob, mimeType });
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  };

  const handleCancel = () => {
    if (sendingRef.current) return;
    chunksRef.current = [];
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  };

  const handleSend = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const result = await stopAndCollect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (!result || result.blob.size === 0) {
        onCancel();
        return;
      }
      const ext = voiceNoteExtension(result.mimeType);
      const file = new File([result.blob], `voice-note-${Date.now()}.${ext}`, {
        type: result.mimeType || 'audio/webm',
      });
      onSend(file);
    } catch {
      onError('Failed to finish the recording. Please try again.');
      onCancel();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-1 bg-red-500/5 border border-red-500/30 rounded-2xl px-3 py-2 min-h-[52px]">
      {starting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Requesting microphone…</span>
        </>
      ) : (
        <>
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
          </span>
          <span className="text-sm font-semibold tabular-nums min-w-[44px] text-foreground">
            {formatDuration(elapsedMs)}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">Recording voice note…</span>
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <Mic className="h-4 w-4 text-red-500 animate-pulse" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={handleCancel}
              disabled={sending}
              title="Cancel recording"
              aria-label="Cancel recording"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 shadow-sm shadow-blue-600/30 text-white"
              onClick={handleSend}
              disabled={sending}
              title="Send voice note"
              aria-label="Send voice note"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </span>
        </>
      )}
    </div>
  );
}
