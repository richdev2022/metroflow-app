import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, MessageSquare, Users, Info, PhoneOff, Hand, MoreVertical, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ControlBarProps {
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  peopleOpen: boolean;
  infoOpen?: boolean;
  handRaised?: boolean;
  unreadChatCount?: number;
  participantCount: number;
  audioOnly?: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  onToggleInfo?: () => void;
  onToggleHand?: () => void;
  onInvite?: () => void;
  onLeave: () => void;
}

function CtrlButton({
  active,
  danger,
  badge,
  label,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  danger?: boolean;
  badge?: number;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12',
        danger
          ? 'bg-rose-500 text-white hover:bg-rose-600'
          : active
            ? 'bg-white text-gray-900 hover:bg-white/90'
            : 'bg-white/10 text-white hover:bg-white/20',
        className,
      )}
    >
      {children}
      {typeof badge === 'number' && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

export function ControlBar({
  micOn,
  camOn,
  screenSharing,
  chatOpen,
  peopleOpen,
  infoOpen,
  handRaised,
  unreadChatCount = 0,
  participantCount,
  audioOnly,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onToggleChat,
  onTogglePeople,
  onToggleInfo,
  onToggleHand,
  onInvite,
  onLeave,
}: ControlBarProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-[#181926]/95 px-2.5 py-2 shadow-2xl backdrop-blur sm:gap-2 sm:px-4">
      <CtrlButton
        label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        active={!micOn}
        danger={!micOn}
        onClick={onToggleMic}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </CtrlButton>

      {!audioOnly && (
        <CtrlButton
          label={camOn ? 'Turn off camera' : 'Turn on camera'}
          active={!camOn}
          danger={!camOn}
          onClick={onToggleCam}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </CtrlButton>
      )}

      <div className="mx-0.5 h-7 w-px bg-white/10 sm:mx-1" />

      <CtrlButton
        label={screenSharing ? 'Stop sharing' : 'Present screen'}
        active={screenSharing}
        onClick={onToggleScreen}
        className="hidden sm:flex"
      >
        {screenSharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
      </CtrlButton>

      {onToggleHand && (
        <CtrlButton
          label={handRaised ? 'Lower hand' : 'Raise hand'}
          active={handRaised}
          onClick={onToggleHand}
          className="hidden sm:flex"
        >
          <Hand className="h-5 w-5" />
        </CtrlButton>
      )}

      {onInvite && (
        <CtrlButton label="Copy invite link" onClick={onInvite} className="hidden sm:flex">
          <Copy className="h-5 w-5" />
        </CtrlButton>
      )}

      <CtrlButton
        label="Chat with everyone"
        active={chatOpen}
        badge={unreadChatCount}
        onClick={onToggleChat}
      >
        <MessageSquare className="h-5 w-5" />
      </CtrlButton>

      <CtrlButton
        label={`Participants (${participantCount})`}
        active={peopleOpen}
        badge={peopleOpen ? 0 : participantCount}
        onClick={onTogglePeople}
      >
        <Users className="h-5 w-5" />
      </CtrlButton>

      {onToggleInfo && (
        <CtrlButton label="Meeting details" active={infoOpen} onClick={onToggleInfo} className="hidden sm:flex">
          <Info className="h-5 w-5" />
        </CtrlButton>
      )}

      <CtrlButton label="Leave call" danger onClick={onLeave} className="ml-1 sm:ml-2">
        <PhoneOff className="h-5 w-5" />
      </CtrlButton>
    </div>
  );
}
