import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import VideoCallRoom from '@/components/VideoCallRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { unwrapApiData } from '@/lib/api-response';
import { TeamMember } from '@shared/api';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Loader2,
  Lock,
  Hourglass,
  XCircle,
  Users,
  Phone,
  PhoneOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * JoinCall — modern pre-join screen for 1:1 / group calls (route: /calls/:callCode)
 * Rebuilt for the 2026 revamp with a clean green-room experience.
 */

type AccessState =
  | 'allowed'
  | 'password_required'
  | 'waiting_room'
  | 'ended'
  | 'cancelled'
  | 'completed'
  | 'missed'
  | 'full'
  | null;

interface ValidateResult {
  id: string;
  title?: string;
  status: string;
  type: 'audio' | 'video';
  callCode: string;
  hasPassword: boolean;
  waitingRoomEnabled: boolean;
  maxParticipants?: number;
  isHost: boolean;
  accessState: AccessState;
  reasons?: string[];
}

const JoinCall = () => {
  const { callCode } = useParams<{ callCode: string }>();
  const navigate = useNavigate();

  const [validate, setValidate] = useState<ValidateResult | null>(null);
  const [validateState, setValidateState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [validateError, setValidateError] = useState<{ title: string; description: string } | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const isAuthed = !!localStorage.getItem('token');

  useEffect(() => {
    if (!isAuthed) {
      navigate(`/login?redirect=/calls/${callCode}`);
      return;
    }
    (async () => {
      setValidateState('loading');
      try {
        const res = await api.get(`/calls/validate/${callCode}`);
        const data = unwrapApiData<ValidateResult>(res);
        setValidate(data);
        setValidateState('ready');
      } catch (err: any) {
        const message = err?.response?.data?.error || err?.message || 'Call not found';
        setValidateState('error');
        setValidateError({
          title: message === 'Call not found' ? 'Call not found' : 'Unable to join',
          description: message,
        });
      }
    })();
  }, [callCode, isAuthed, navigate]);

  // team members (participant mapping for the room)
  useEffect(() => {
    if (!isAuthed) return;
    api
      .get('/team')
      .then((res) => {
        const rows = unwrapApiData<any[]>(res);
        setTeamMembers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => undefined);
  }, [isAuthed]);

  // camera preview
  useEffect(() => {
    if (joined || validateState !== 'ready' || validate?.type === 'audio') return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        stream = s;
        setPreviewStream(s);
      })
      .catch(() => undefined);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    };
  }, [joined, validateState, validate?.type]);

  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
      previewVideoRef.current.play().catch(() => undefined);
    }
  }, [previewStream]);

  const displayName = localStorage.getItem('userName') || 'You';

  const canJoin =
    validateState === 'ready' &&
    (validate?.accessState === 'allowed' || validate?.accessState === 'waiting_room' || validate?.accessState === 'password_required') &&
    (validate?.accessState !== 'password_required' || password.length > 0);

  const handleJoin = async () => {
    if (!canJoin || !validate) return;
    setJoining(true);
    try {
      await api.post(`/calls/${validate.id}/join`, { password: password || undefined });
      setJoined(true);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to join';
      if (String(message).toLowerCase().includes('password')) {
        setPasswordError('Incorrect call password');
      } else {
        setValidateError({ title: 'Cannot join call', description: message });
        setValidateState('error');
      }
    } finally {
      setJoining(false);
    }
  };

  const callType = validate?.type || 'video';
  const audioOnly = callType === 'audio';

  // ---------------------------------------------------------------- joined
  if (joined && validate) {
    return (
      <div className="h-screen w-full bg-[#111221]">
        <VideoCallRoom
          roomId={validate.callCode}
          callId={validate.id}
          callType={callType}
          onLeave={() => navigate('/calls')}
          userName={displayName}
          isHost={validate.isHost}
          waitingRoomEnabled={validate.waitingRoomEnabled}
          teamMembers={teamMembers}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------- error
  if (validateState === 'error' && validateError) {
    return (
      <CallShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15">
            <XCircle className="h-8 w-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">{validateError.title}</h1>
          <p className="mt-2 max-w-sm text-sm text-white/55">{validateError.description}</p>
          <Button onClick={() => navigate('/calls')} className="mt-6 rounded-full bg-indigo-500 text-white hover:bg-indigo-600">
            Back to calls
          </Button>
        </div>
      </CallShell>
    );
  }

  // ---------------------------------------------------------------- blocked
  if (validateState === 'ready' && validate) {
    const s = validate.accessState;
    if (s === 'cancelled' || s === 'ended' || s === 'completed' || s === 'missed') {
      return (
        <CallShell>
          <Blocked icon={<XCircle className="h-8 w-8 text-rose-400" />} title="This call has ended" description="Start a new call from the Calls page." />
        </CallShell>
      );
    }
    if (s === 'full') {
      return (
        <CallShell>
          <Blocked icon={<Users className="h-8 w-8 text-amber-400" />} title="Call is full" description={`This call reached its maximum of ${validate.maxParticipants} participants.`} />
        </CallShell>
      );
    }
  }

  const access = validate?.accessState;
  const showPasswordStep = access === 'password_required';

  return (
    <CallShell>
      <div className="w-full max-w-md">
        {validateState === 'loading' ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-white/55">Checking call…</p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {audioOnly ? 'Audio call' : 'Video call'}
              </h1>
              <p className="mt-1 font-mono text-sm tracking-widest text-indigo-300">{validate?.callCode}</p>
            </div>

            {/* preview */}
            <div className="relative mx-auto mb-5 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1f2033] shadow-2xl">
              {!audioOnly && camOn && previewStream ? (
                <video ref={previewVideoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-semibold text-white">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              )}
              {!audioOnly && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                  <button
                    onClick={() => setMicOn((m) => !m)}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition',
                      micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-500 text-white hover:bg-rose-600',
                    )}
                  >
                    {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => setCamOn((c) => !c)}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition',
                      camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-500 text-white hover:bg-rose-600',
                    )}
                  >
                    {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                </div>
              )}
            </div>

            {showPasswordStep && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-white/60">Call password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Enter password"
                    className="h-12 rounded-xl border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30"
                    onKeyDown={(e) => e.key === 'Enter' && void handleJoin()}
                  />
                </div>
                {passwordError && <p className="mt-1.5 text-xs text-rose-400">{passwordError}</p>}
              </div>
            )}

            {access === 'waiting_room' && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-xs leading-relaxed text-amber-100/90">The host will let you in shortly.</p>
              </div>
            )}

            <Button
              onClick={() => void handleJoin()}
              disabled={!canJoin || joining}
              className="w-full rounded-full bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 disabled:opacity-40"
            >
              {joining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" /> Join call
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </CallShell>
  );
};

function CallShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-[#111221] via-[#141527] to-[#0d0e1a] p-6">
      {children}
    </div>
  );
}

function Blocked({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">{icon}</div>
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-white/55">{description}</p>
    </div>
  );
}

export default JoinCall;
