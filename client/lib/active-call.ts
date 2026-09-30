/**
 * Global active-call state.
 *
 * The CallRoom instance lives at the App root (mounted once by
 * <ActiveCallHost/>) so a call keeps running — audio, video, chat, captions —
 * while the user minimizes it to a floating bubble and navigates anywhere in
 * the app (WhatsApp-style). Entry points (Calls, Meetings, Chat, guest join
 * pages) hand fully-built CallRoomProps to startCall() and never mount the
 * room themselves.
 */
import type { CallRoomProps } from "@/components/call-room/CallRoom";

export interface ActiveCallState {
  /** Props for the CallRoom currently joined (null when no call). */
  props: CallRoomProps | null;
  /** True while the call is collapsed into the floating bubble. */
  minimized: boolean;
  /** Local camera preview stream (reported by CallRoom for the bubble). */
  localStream: MediaStream | null;
  callType: "audio" | "video";
  /** Epoch ms when the call started (drives the bubble timer). */
  startedAt: number;
}

let state: ActiveCallState = {
  props: null,
  minimized: false,
  localStream: null,
  callType: "video",
  startedAt: 0,
};

const listeners = new Set<() => void>();

function emit() {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      // listener errors must never break the store
    }
  }
}

export function subscribeActiveCall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveCallState(): ActiveCallState {
  return state;
}

export function useActiveCallSelector<T>(selector: (s: ActiveCallState) => T): T {
  // Implemented with useSyncExternalStore in the hook file — this helper is
  // kept for non-React consumers.
  return selector(state);
}

/** Join a call (or meeting) room. Replaces any existing call. */
export function startCall(props: CallRoomProps, callType: "audio" | "video" = "video") {
  // Leaving any previous call is the previous onLeave's job; a new call simply
  // takes over (the host unmounts the old CallRoom, its cleanup runs).
  state = { props, minimized: false, localStream: null, callType, startedAt: Date.now() };
  emit();
}

/** Collapse the running call into the floating bubble. */
export function minimizeCall() {
  if (!state.props) return;
  state = { ...state, minimized: true };
  emit();
}

/** Restore the full-screen room. */
export function maximizeCall() {
  if (!state.props) return;
  state = { ...state, minimized: false };
  emit();
}

/** Report the local camera stream (for the bubble preview). */
export function reportLocalStream(stream: MediaStream | null) {
  if (state.localStream === stream) return;
  state = { ...state, localStream: stream };
  emit();
}

/** End/leave the active call entirely. */
export function endCall() {
  if (!state.props) return;
  const prev = state.props;
  state = { props: null, minimized: false, localStream: null, callType: "video", startedAt: 0 };
  emit();
  try {
    prev.onLeave?.();
  } catch {
    // onLeave must never crash the host
  }
}

/** True when the current user already has a call running. */
export function hasActiveCall(): boolean {
  return !!state.props;
}
