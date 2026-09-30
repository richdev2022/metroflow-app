import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { X, Users, MessageSquare, Mic, MicOff, VideoOff, Shield, UserMinus, Copy, Check, Info, Clock, UserCheck, CheckCheck, Volume2, Bluetooth, Headphones, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAPTION_AUTOHIDE_MS, latestCaptionKey, visibleCaptions, type AudioOutputDevice, type CaptionItem } from "@/lib/calling";
import type { LocalMediaState, RemoteParticipant } from "@/lib/calling";

export interface RoomChatMessage {
  id: string;
  userId: string;
  senderName: string;
  message: string;
  timestamp: string;
  isLocal?: boolean;
}

/** Caption segment — re-exported shape from lib/calling (rolling buffer item). */
export type CaptionSegment = CaptionItem;

export interface RoomAppParticipant {
  id: string;
  name: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  isGuest?: boolean;
  isLocal?: boolean;
}

/** One participant waiting for the host to admit them. */
export interface RoomWaitingEntry {
  participantId: string;
  userName: string;
  isGuest?: boolean;
  since?: string;
}

/** Sheet panel wrapper (right side on desktop, bottom sheet on mobile). */
export function SidePanel({
  title,
  icon,
  onClose,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141B2E]/95 backdrop-blur-xl",
        "absolute inset-x-3 bottom-24 z-30 max-h-[60vh] sm:inset-x-auto sm:right-4 sm:top-16 sm:bottom-24 sm:w-80",
        "animate-in slide-in-from-right-5 duration-200",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          {icon}
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label={`Close ${title}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
    </div>
  );
}

export function ParticipantsPanel({
  appParticipants,
  mediaParticipants,
  isHost,
  identity,
  localMediaState,
  waitingQueue = [],
  onAdmit,
  onDeny,
  onAdmitAll,
  onClose,
  onRemoveParticipant,
  onMuteParticipant,
}: {
  appParticipants: RoomAppParticipant[];
  mediaParticipants: RemoteParticipant[];
  isHost: boolean;
  identity: string;
  /** Local mic/cam flags for the local participant row. */
  localMediaState?: LocalMediaState;
  /** Participants currently waiting for host admission. */
  waitingQueue?: RoomWaitingEntry[];
  onAdmit?: (participantId: string) => void;
  onDeny?: (participantId: string) => void;
  onAdmitAll?: () => void;
  onClose: () => void;
  onRemoveParticipant?: (identity: string) => void;
  onMuteParticipant?: (identity: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const count = Math.max(appParticipants.length, mediaParticipants.length + 1);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <SidePanel title={`Participants (${count})`} icon={<Users className="h-4 w-4" />} onClose={onClose}>
      {/* Waiting room queue (host only) */}
      {isHost && waitingQueue.length > 0 && (
        <div className="border-b border-white/10 bg-amber-500/5">
          <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <Clock className="h-3.5 w-3.5" /> Waiting ({waitingQueue.length})
            </p>
            {onAdmitAll && (
              <button
                type="button"
                onClick={onAdmitAll}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/15"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Admit all
              </button>
            )}
          </div>
          <ul className="pb-2">
            {waitingQueue.map((entry) => (
              <li key={entry.participantId} className="flex items-center gap-3 px-4 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-200">
                  {(entry.userName || "?").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{entry.userName || "Guest"}</p>
                  <p className="text-[11px] text-amber-200/60">waiting to join{entry.isGuest ? " · guest" : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {onDeny && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-red-500/40 bg-transparent px-2.5 text-xs text-red-300 hover:bg-red-500/15"
                      onClick={() => onDeny(entry.participantId)}
                    >
                      <X className="h-3.5 w-3.5" /> Deny
                    </Button>
                  )}
                  {onAdmit && (
                    <Button
                      size="sm"
                      className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-500"
                      onClick={() => onAdmit(entry.participantId)}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Admit
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="divide-y divide-white/5">
        {appParticipants.map((p) => {
          const media = mediaParticipants.find((m) => m.id === p.id);
          const muted = p.isLocal
            ? localMediaState
              ? !localMediaState.audioEnabled
              : false
            : media
              ? media.audioMuted
              : !p.audioEnabled;
          const videoOff = p.isLocal
            ? localMediaState
              ? !localMediaState.videoEnabled
              : false
            : media
              ? media.videoMuted
              : false;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-xs font-semibold text-white">
                {(p.name || "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {p.name}
                  {p.isLocal && <span className="ml-1 text-white/50">(you)</span>}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-white/45">
                  {p.isHost && (
                    <>
                      <Shield className="h-3 w-3 text-amber-400" /> Host ·{" "}
                    </>
                  )}
                  {p.isGuest && "Guest"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {muted ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4 text-white/40" />}
                {videoOff && <VideoOff className="h-4 w-4 text-white/30" />}
                {isHost && !p.isLocal && onMuteParticipant && !muted && (
                  <button
                    type="button"
                    onClick={() => onMuteParticipant(p.id)}
                    title="Mute participant"
                    className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <MicOff className="h-4 w-4" />
                  </button>
                )}
                {isHost && !p.isLocal && onRemoveParticipant && (
                  <button
                    type="button"
                    onClick={() => onRemoveParticipant(p.id)}
                    title="Remove from call"
                    className="rounded-lg p-1.5 text-white/50 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-3">
        <Button variant="outline" size="sm" className="w-full gap-2 border-white/15 bg-transparent text-white hover:bg-white/10" onClick={copyInvite}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? "Link copied" : "Copy invite link"}
        </Button>
      </div>
    </SidePanel>
  );
}

export function ChatPanel({
  messages,
  onClose,
  onSend,
  currentUserId,
}: {
  messages: RoomChatMessage[];
  onClose: () => void;
  onSend: (text: string) => void;
  currentUserId: string;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <SidePanel title="Chat" icon={<MessageSquare className="h-4 w-4" />} onClose={onClose}>
      <div ref={listRef} className="flex h-full flex-col gap-3 p-4">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-xs text-white/40">No messages yet. Say hello!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.isLocal || m.userId === currentUserId ? "items-end" : "items-start")}>
            <span className="px-1 text-[11px] text-white/45">
              {m.isLocal || m.userId === currentUserId ? "You" : m.senderName} ·{" "}
              {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                m.isLocal || m.userId === currentUserId
                  ? "rounded-br-sm bg-[#2563EB] text-white"
                  : "rounded-bl-sm bg-white/10 text-white/90",
              )}
            >
              {m.message}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message everyone"
            maxLength={1000}
            className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
          />
          <Button type="submit" size="sm" disabled={!draft.trim()} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
            Send
          </Button>
        </form>
      </div>
    </SidePanel>
  );
}

/**
 * Captions overlay — ONE compact pill anchored bottom-center directly above
 * the control bar (never a stack of pills covering the video):
 *   - glass background (black/55 + backdrop-blur), max 2 lines, capped width,
 *   - previous final line sits small + dimmed above; the latest line updates
 *     in place (stable keys → no reflow jump),
 *   - auto-hides 4s after the last speech, reappears with the next one,
 *   - pointer-events-none except the small hide button.
 */
export function CaptionsOverlay({
  segments,
  enabled,
  onHide,
  className,
}: {
  segments: CaptionItem[];
  enabled: boolean;
  /** Dismiss the current pill — the next spoken line re-opens it. */
  onHide?: () => void;
  className?: string;
}) {
  const visible = useMemo(() => visibleCaptions(segments), [segments]);
  const [dimmed, setDimmed] = useState(false);
  // Any new/updated text resets the auto-hide timer.
  const speechKey = latestCaptionKey(segments);

  useEffect(() => {
    if (!enabled || !speechKey) {
      setDimmed(false);
      return;
    }
    setDimmed(false);
    const t = setTimeout(() => setDimmed(true), CAPTION_AUTOHIDE_MS);
    return () => clearTimeout(t);
  }, [speechKey, enabled]);

  if (!enabled || visible.length === 0) return null;

  const latestIdx = visible.length - 1;

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3",
        // Bottom-center, above the control bar (the overlay lives inside the
        // stage container, so it can never cover the dock itself). Extra
        // clearance on phones where the dock wraps to multiple rows.
        "bottom-5 phone-landscape:bottom-2 sm:bottom-2.5",
        className,
      )}
    >
      <div
        className={cn(
          "relative w-full max-w-[min(92%,640px)] transition-all duration-300",
          dimmed ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-black/55 px-4 py-2 ring-1 ring-white/10 backdrop-blur-md">
          {visible.map((seg, i) => {
            const isLatest = i === latestIdx;
            return (
              <p
                key={seg.id}
                className={cn(
                  "w-full text-center transition-all duration-200",
                  isLatest
                    ? "line-clamp-2 translate-y-0 text-sm leading-snug text-white opacity-100"
                    : "-translate-y-0.5 text-xs leading-snug text-white/55 opacity-60",
                )}
              >
                <span className={cn("mr-1.5 font-semibold", isLatest ? "text-[#60A5FA]" : "text-[#60A5FA]/70")}>
                  {seg.speakerName}:
                </span>
                {seg.text}
              </p>
            );
          })}
        </div>
        {onHide && (
          <button
            type="button"
            aria-label="Hide captions"
            title="Hide captions"
            onClick={onHide}
            className="pointer-events-auto absolute -right-1.5 -top-2.5 rounded-full bg-black/75 p-1 text-white/70 ring-1 ring-white/15 backdrop-blur transition-colors hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function routeIcon(kind: AudioOutputDevice["kind"]) {
  if (kind === "bluetooth") return <Bluetooth className="h-3.5 w-3.5 shrink-0" />;
  if (kind === "headset") return <Headphones className="h-3.5 w-3.5 shrink-0" />;
  if (kind === "earpiece") return <Phone className="h-3.5 w-3.5 shrink-0" />;
  return <Volume2 className="h-3.5 w-3.5 shrink-0" />;
}

export function MeetingInfoPanel({
  title,
  inviteDetails,
  providerLabel,
  startedAt,
  onClose,
  audioOutputs = [],
  selectedSinkId,
  sinkSupported,
  onSelectAudioOutput,
}: {
  title: string;
  inviteDetails?: { code?: string; password?: string | null; waitingRoomEnabled?: boolean } | null;
  providerLabel: string;
  startedAt: string | null;
  onClose: () => void;
  /** Speaker-route options (overflow menu section). */
  audioOutputs?: AudioOutputDevice[];
  selectedSinkId?: string;
  sinkSupported?: boolean;
  onSelectAudioOutput?: (deviceId: string) => void;
}) {
  return (
    <SidePanel title="Meeting details" icon={<Info className="h-4 w-4" />} onClose={onClose}>
      <dl className="space-y-3 p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-white/40">Room</dt>
          <dd className="text-white">{title || "Untitled"}</dd>
        </div>
        {inviteDetails?.code && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Invite code</dt>
            <dd className="font-mono text-white">{inviteDetails.code}</dd>
          </div>
        )}
        {inviteDetails?.password && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Password</dt>
            <dd className="font-mono text-white">{inviteDetails.password}</dd>
          </div>
        )}
        {startedAt && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/40">Started</dt>
            <dd className="text-white">{new Date(startedAt).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-white/40">Connection</dt>
          <dd className="text-white">{providerLabel}</dd>
        </div>
        {/* Audio output routing (Google-Dialer-style speaker selection). */}
        <div>
          <dt className="text-xs uppercase tracking-wide text-white/40">Audio output</dt>
          <dd>
            {sinkSupported ? (
              audioOutputs.length > 0 ? (
                <div className="mt-1.5 flex flex-col gap-1">
                  {audioOutputs.map((d) => {
                    const active = (d.deviceId || "") === (selectedSinkId || "");
                    return (
                      <button
                        key={d.deviceId || "system-default"}
                        type="button"
                        onClick={() => onSelectAudioOutput?.(d.deviceId)}
                        className={cn(
                          "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          active ? "bg-[#2563EB]/25 text-white ring-1 ring-[#2563EB]/60" : "text-white/70 hover:bg-white/10",
                        )}
                      >
                        {routeIcon(d.kind)}
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/50">No output devices found.</p>
              )
            ) : (
              <p className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">
                Audio routing follows the system — connect Bluetooth from Control Center.
              </p>
            )}
          </dd>
        </div>
      </dl>
    </SidePanel>
  );
}
