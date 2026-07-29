import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mic, MicOff, Video, PhoneOff, Loader2 } from 'lucide-react';
import { AudioUtils } from '@/lib/audio-utils';
import { api } from '@/lib/api-client';
import { unwrapApiData } from '@/lib/api-response';
import { TeamMember } from '@shared/api';
import { useNavigate } from 'react-router-dom';
import { getSingletonSocket } from '@/hooks/useSocket';

export interface IncomingCallData {
  callId: string;
  callCode?: string;
  from: string;
  fromName?: string;
  type: 'audio' | 'video';
  roomId?: string;
  callerName?: string;
}

interface IncomingCallModalProps {
  call: IncomingCallData | null;
  onClose: () => void;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
};

export default function IncomingCallModal({ call, onClose }: IncomingCallModalProps) {
  const navigate = useNavigate();
  const [ringStopFn, setRingStopFn] = useState<(() => void) | null>(null);
  const [callerName, setCallerName] = useState<string>('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const autoCloseRef = useRef<number | null>(null);

  useEffect(() => {
    if (!call) {
      if (ringStopFn) {
        ringStopFn();
        setRingStopFn(null);
      }
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
      return;
    }

    const startRinging = async () => {
      try {
        const stop = await AudioUtils.playRingtone();
        setRingStopFn(() => stop);
      } catch (e) {
        console.warn('Ringtone play failed:', e);
      }
    };
    startRinging();

    const fetchCallerName = async () => {
      const name = call.fromName || call.callerName;
      if (name) {
        setCallerName(name);
        return;
      }
      try {
        const res = await api.get('/team');
        const members = unwrapApiData<TeamMember[]>(res.data, '') || [];
        const member = members.find(m => m.id === call.from);
        setCallerName(member?.name || call.from || 'Unknown Caller');
      } catch {
        setCallerName(call.from || 'Unknown Caller');
      }
    };
    fetchCallerName();

    autoCloseRef.current = window.setTimeout(() => {
      handleReject(true);
    }, 30000);

    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.callId]);

  useEffect(() => {
    return () => {
      if (ringStopFn) ringStopFn();
    };
  }, [ringStopFn]);

  if (!call) return null;

  const stopRing = () => {
    if (ringStopFn) {
      ringStopFn();
      setRingStopFn(null);
    }
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };

  const handleAccept = async () => {
    if (!call || isAccepting) return;
    setIsAccepting(true);
    stopRing();
    AudioUtils.stopAllRingtones();
    try {
      const socket = getSingletonSocket();
      socket?.emit('call:accept', { callId: call.callId });
    } catch (e) {
      console.warn(e);
    }
    const roomId = call.roomId || call.callId || call.callCode || '';
    onClose();
    navigate(`/calls?roomId=${encodeURIComponent(roomId)}&autoJoin=1&callType=${call.type}`);
  };

  const handleReject = (silent = false) => {
    if (!call || isRejecting) return;
    setIsRejecting(true);
    stopRing();
    AudioUtils.stopAllRingtones();
    if (!silent) {
      try {
        const socket = getSingletonSocket();
        socket?.emit('call:reject', { callId: call.callId });
      } catch (e) {
        console.warn(e);
      }
    }
    onClose();
  };

  const displayName = callerName || call.callerName || call.fromName || 'Unknown Caller';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping" style={{ animationDuration: '1.5s' }} />
            <Avatar className="relative h-24 w-24 border-4 border-white/20 shadow-xl">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex items-center gap-2 mb-2">
            {call.type === 'video' ? (
              <Video className="h-5 w-5 text-blue-400" />
            ) : (
              <Mic className="h-5 w-5 text-green-400" />
            )}
            <span className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Incoming {call.type === 'video' ? 'Video' : 'Audio'} Call
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
          <p className="text-sm text-slate-400 mb-8 animate-pulse">is calling...</p>

          <div className="flex items-center gap-6 w-full justify-center">
            <Button
              type="button"
              size="icon"
              className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
              onClick={() => handleReject(false)}
              disabled={isAccepting || isRejecting}
            >
              {isRejecting ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <PhoneOff className="h-7 w-7" />
              )}
            </Button>

            <Button
              type="button"
              size="icon"
              className={cn(
                "h-16 w-16 rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95",
                call.type === 'video'
                  ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/30"
                  : "bg-green-600 hover:bg-green-700 shadow-green-500/30"
              )}
              onClick={handleAccept}
              disabled={isAccepting || isRejecting}
            >
              {isAccepting ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : call.type === 'video' ? (
                <Video className="h-7 w-7" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </Button>
          </div>

          <div className="mt-6 flex gap-8">
            <p className="text-[11px] text-slate-500">Decline</p>
            <p className="text-[11px] text-slate-500">Accept</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}
