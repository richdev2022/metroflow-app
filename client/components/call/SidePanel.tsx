import { useEffect, useRef, useState } from 'react';
import { X, Send, Search, ShieldCheck, Copy, Link2, MessageSquare, Users, MicOff, VideoOff, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PanelParticipant {
  id: string;
  name: string;
  isHost?: boolean;
  isGuest?: boolean;
  isLocal?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

export interface PanelChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string | Date;
  isLocal?: boolean;
}

export type PanelTab = 'people' | 'chat' | 'info';

interface SidePanelProps {
  open: boolean;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  meetingTitle: string;
  meetingCode: string;
  inviteLink: string;
  participants: PanelParticipant[];
  messages: PanelChatMessage[];
  localUserId: string;
  onSendMessage: (text: string) => void;
  onCopyInvite: () => void;
}

export function SidePanel({
  open,
  tab,
  onTabChange,
  onClose,
  meetingTitle,
  meetingCode,
  inviteLink,
  participants,
  messages,
  localUserId,
  onSendMessage,
  onCopyInvite,
}: SidePanelProps) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, tab]);

  const filtered = participants.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const fmtTime = (ts: string | Date) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!open) return null;

  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[340px] max-w-[85vw] flex-col border-l border-white/10 bg-[#181926]/98 backdrop-blur-xl">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex gap-1">
          <button
            onClick={() => onTabChange('people')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              tab === 'people' ? 'bg-indigo-500/25 text-indigo-200' : 'text-white/60 hover:bg-white/5',
            )}
          >
            <Users className="h-3.5 w-3.5" /> People ({participants.length})
          </button>
          <button
            onClick={() => onTabChange('chat')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              tab === 'chat' ? 'bg-indigo-500/25 text-indigo-200' : 'text-white/60 hover:bg-white/5',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </button>
          <button
            onClick={() => onTabChange('info')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              tab === 'info' ? 'bg-indigo-500/25 text-indigo-200' : 'text-white/60 hover:bg-white/5',
            )}
          >
            <Link2 className="h-3.5 w-3.5" /> Info
          </button>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {tab === 'people' && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people"
              className="border-white/10 bg-white/5 pl-9 text-sm text-white placeholder:text-white/35"
            />
          </div>
          <div className="space-y-1">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm text-white/90">
                    <span className="truncate">{p.name}</span>
                    {p.isLocal && <span className="text-xs text-white/45">(You)</span>}
                    {p.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                  </div>
                  {p.isGuest && <div className="text-[11px] text-white/40">Guest</div>}
                </div>
                {p.audioEnabled === false && <MicOff className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                {p.videoEnabled === false && <VideoOff className="h-3.5 w-3.5 shrink-0 text-white/35" />}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-white/40">No matches</p>
            )}
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-white/20" />
                <p className="text-sm text-white/45">Messages sent here are visible to everyone in the call</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn('flex flex-col', m.userId === localUserId ? 'items-end' : 'items-start')}>
                {m.userId !== localUserId && (
                  <span className="mb-0.5 px-1 text-[11px] font-medium text-indigo-300">{m.userName}</span>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
                    m.userId === localUserId
                      ? 'rounded-br-md bg-indigo-500 text-white'
                      : 'rounded-bl-md bg-white/10 text-white/90',
                  )}
                >
                  {m.message}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-white/35">{fmtTime(m.timestamp)}</span>
              </div>
            ))}
          </div>
          <form
            className="border-t border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              onSendMessage(text);
              setDraft('');
            }}
          >
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Send a message"
                className="border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim()}
                className="shrink-0 rounded-full bg-indigo-500 hover:bg-indigo-600"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      )}

      {tab === 'info' && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-white">{meetingTitle}</h3>
            <p className="mt-1 text-xs text-white/50">Meeting code</p>
            <p className="mt-0.5 font-mono text-sm tracking-wider text-indigo-300">{meetingCode}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-xs font-medium text-white/70">Joining link</p>
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 break-all rounded-lg bg-black/30 p-2 font-mono text-[11px] text-white/60">
                {inviteLink}
              </p>
            </div>
            <Button
              onClick={onCopyInvite}
              className="mt-3 w-full rounded-full bg-indigo-500 text-white hover:bg-indigo-600"
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy invite link
            </Button>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs leading-relaxed text-emerald-200/90">
              This call is secured with end-to-end encrypted transport (SRTP/DTLS).
              Nobody outside this call can listen in.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
