/**
 * <ActiveCallHost/> — mounts the single CallRoom instance at the App root.
 *
 * While a call is active the room stays mounted (media, socket presence and
 * state all survive). "Minimized" simply hides the full-screen layer and
 * shows a draggable floating bubble with the local camera preview, the call
 * timer, expand and end buttons.
 */
import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { Maximize2, PhoneOff, Video, VideoOff } from "lucide-react";
import {
  endCall,
  getActiveCallState,
  maximizeCall,
  subscribeActiveCall,
  type ActiveCallState,
} from "@/lib/active-call";
import { CallRoom } from "./CallRoom";
import { cn } from "@/lib/utils";

function useActiveCall(): ActiveCallState {
  return useSyncExternalStore(subscribeActiveCall, getActiveCallState, getActiveCallState);
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Draggable minimized call bubble (WhatsApp/Meet style). */
function MinimizedCallBubble({ state }: { state: ActiveCallState }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAt = state.startedAt || Date.now();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Default position: bottom-right with safe margins.
  useEffect(() => {
    if (pos) return;
    const margin = 16;
    const x = window.innerWidth - 236 - margin;
    const y = window.innerHeight - 96 - margin;
    setPos({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [pos]);

  // Keep the bubble inside the viewport on resize/rotate.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        if (!p) return p;
        const margin = 8;
        return {
          x: Math.min(Math.max(margin, p.x), Math.max(margin, window.innerWidth - 236 - margin)),
          y: Math.min(Math.max(margin, p.y), Math.max(margin, window.innerHeight - 72 - margin)),
        };
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const stream = state.localStream;
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play().catch(() => undefined);
  }, [stream]);

  if (!pos) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = e.clientX - d.dx;
    const ny = e.clientY - d.dy;
    const margin = 8;
    if (Math.abs(nx - pos.x) > 3 || Math.abs(ny - pos.y) > 3) d.moved = true;
    setPos({
      x: Math.min(Math.max(margin, nx), Math.max(margin, window.innerWidth - 236 - margin)),
      y: Math.min(Math.max(margin, ny), Math.max(margin, window.innerHeight - 72 - margin)),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const showVideo = state.callType === "video" && !!stream && stream.getVideoTracks().length > 0;

  return (
    <div
      className="fixed z-[95] touch-none select-none"
      style={{ left: pos.x, top: pos.y, width: 236 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-white/15 bg-[#10162A]/95 shadow-2xl shadow-black/50 backdrop-blur-xl transition-shadow",
          dragging && "shadow-black/80 ring-2 ring-white/25",
        )}
      >
        <div
          className="flex cursor-grab items-center gap-2.5 p-2 active:cursor-grabbing"
          onClick={() => {
            if (!dragRef.current?.moved) maximizeCall();
          }}
        >
          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[#0B0F1A]">
            {showVideo ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {state.callType === "video" ? (
                  <VideoOff className="h-4 w-4 text-white/40" />
                ) : (
                  <Video className="h-4 w-4 text-white/40" />
                )}
              </div>
            )}
            <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Call in progress
            </p>
            <p className="mt-0.5 font-mono text-sm text-white">{formatDuration(now - startedAt)}</p>
          </div>
          <button
            type="button"
            aria-label="Expand call"
            title="Expand call"
            className="shrink-0 rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              if (!dragRef.current?.moved) maximizeCall();
            }}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="End call"
            title="End call"
            className="shrink-0 rounded-lg bg-red-600 p-2 text-white transition-colors hover:bg-red-500"
            onClick={(e) => {
              e.stopPropagation();
              endCall();
            }}
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Renders the active call (full-screen room or minimized bubble). */
export function ActiveCallHost() {
  const state = useActiveCall();
  const props = state.props;

  if (!props) return null;

  return (
    <>
      {/* The room stays mounted while minimized so media keeps flowing.
          Hidden via opacity/pointer-events — NOT display:none — so WebRTC
          video elements and audio playback are never paused by the browser. */}
      <div
        aria-hidden={state.minimized}
        className={cn(
          "fixed inset-0",
          state.minimized && "opacity-0 pointer-events-none",
        )}
        style={{ zIndex: state.minimized ? -1 : 90 }}
      >
        {/* Keyed per call — starting a NEW call always mounts a FRESH room
            instance (no zombie "Connected" header, stale timer, chat or
            panels carried over from the previous call). The old instance's
            unmount cleanup destroys its media client. */}
        <CallRoom
          key={`${props.callId || props.meetingId || props.roomId || "room"}-${state.startedAt}`}
          {...props}
          onLeave={() => {
            // Clear the store first, then run the page-level cleanup that the
            // entry point provided (end-call API, dialog close, navigation…).
            endCall();
          }}
        />
      </div>
      {state.minimized && <MinimizedCallBubble state={state} />}
    </>
  );
}

export default ActiveCallHost;
