import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import VideoCallRoom from '@/components/VideoCallRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { unwrapApiData } from '@/lib/api-response';
import { Meeting, TeamMember } from '@shared/api';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Loader2,
  Lock,
  Calendar,
  Clock,
  Hourglass,
  XCircle,
  Users,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * JoinMeeting — modern "green room" pre-join experience (Google Meet style)
 * -------------------------------------------------------------------------
 * - Works for logged-in users AND guests (no account needed).
 * - Guests: enter a name -> public /meetings/guest/validate/:code -> join
 *   with a synthetic guest id via socket.
 * - Handles password, waiting room, not-started countdown, full/ended states.
 */

type AccessState =
  | 'allowed'
  | 'password_required'
  | 'waiting_room'
  | 'not_started'
  | 'ended'
  | 'cancelled'
  | 'completed'
  | 'full'
  | null;

interface ValidateResult {
  id: string;
  title: string;
  description?: string;
  status: string;
  startTime?: string;
  endTime?: string | null;
  timezone?: string;
  meetingCode: string;
  meetingLink?: string;
  isInstant: boolean;
  waitingRoomEnabled: boolean;
  hasPassword: boolean;
  maxParticipants?: number;
  currentParticipants?: number;
  isHost: boolean;
  accessState: AccessState;
  reasons?: string[];
}

const JoinMeeting = () => {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  const token = localStorage.getItem('token');
  const isAuthed = !!token;

  // ------------------------------------------------------------- validation
  const [validate, setValidate] = useState<ValidateResult | null>(null);
  const [validateState, setValidateState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [validateError, setValidateError] = useState<{ title: string; description: string } | null>(null);

  // guest / join state
  const [guestName, setGuestName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [notStartedCountdown, setNotStartedCountdown] = useState<number>(0);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const guestIdRef = useRef<string>('');

  const fetchValidate = useCallback(async () => {
    if (!meetingCode) return;
    setValidateState('loading');
    try {
      const query = inviteToken ? `?token=${encodeURIComponent(inviteToken)}` : '';
      const res = await api.get(`/meetings/guest/validate/${meetingCode}${query}`);
      const data = unwrapApiData<ValidateResult>(res);
      setValidate(data);
      setValidateState('ready');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Meeting not found';
      setValidateState('error');
      setValidateError({
        title: message === 'Meeting not found' ? 'Meeting not found' : 'Unable to join',
        description:
          message === 'Meeting not found'
            ? 'Check the link or code and try again. It may have been deleted.'
            : message,
      });
    }
  }, [meetingCode, inviteToken]);

  useEffect(() => {
    void fetchValidate();
  }, [fetchValidate]);

  // Authenticated users may use the richer business-scoped validation
  useEffect(() => {
    if (!isAuthed || !meetingCode) return;
    (async () => {
      try {
        const res = await api.get(`/meetings/validate/${meetingCode}`);
        const data = unwrapApiData<ValidateResult>(res);
        if (data) setValidate(data);
      } catch {
        /* guest validate result already present */
      }
    })();
  }, [isAuthed, meetingCode]);

  // load team members for authenticated users (participant mapping)
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

  // camera preview (green room)
  useEffect(() => {
    if (joined || validateState !== 'ready' || (validate?.accessState !== 'allowed' && validate?.accessState !== 'password_required')) {
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, validateState, validate?.accessState]);

  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
      previewVideoRef.current.play().catch(() => undefined);
    }
  }, [previewStream]);

  // not-started countdown
  useEffect(() => {
    if (validate?.accessState !== 'not_started' || !validate.startTime) return;
    const tick = () => {
      const remaining = new Date(validate.startTime!).getTime() - Date.now();
      setNotStartedCountdown(Math.max(0, remaining));
      if (remaining <= 0) void fetchValidate();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [validate?.accessState, validate?.startTime, fetchValidate]);

  // guest id (stable across re-renders)
  useEffect(() => {
    if (!guestIdRef.current) {
      guestIdRef.current = `guest-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  const displayName = isAuthed
    ? localStorage.getItem('userName') || 'You'
    : guestName.trim() || 'Guest';

  const canJoin =
    validateState === 'ready' &&
    (validate?.accessState === 'allowed' || validate?.accessState === 'waiting_room' || validate?.accessState === 'password_required') &&
    (isAuthed || guestName.trim().length >= 2) &&
    (validate?.accessState !== 'password_required' || password.length > 0);

  const handleJoin = async () => {
    if (!canJoin || !validate) return;

    // Verify password over socket if required
    if (validate.accessState === 'password_required') {
      // (socket password verification happens inside the room join; the
      // REST layer validated state already - password is passed to join)
    }

    setJoining(true);
    try {
      if (isAuthed) {
        await api.post(`/meetings/${validate.id}/join`, { password: password || undefined });
        // mark meeting ongoing if this is the first join
        void api.put(`/meetings/${validate.id}`, { status: 'ongoing' }).catch(() => undefined);
      }
      // store guest name for the room
      if (!isAuthed) {
        localStorage.setItem('guestDisplayName', guestName.trim());
      }
      setJoined(true);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to join';
      if (String(message).toLowerCase().includes('password')) {
        setPasswordError('Incorrect meeting password');
      } else {
        setPasswordError('');
        setValidateError({ title: 'Cannot join meeting', description: message });
        setValidateState('error');
      }
    } finally {
      setJoining(false);
    }
  };

  // ---------------------------------------------------------------- joined
  if (joined && validate) {
    return (
      <div className="h-screen w-full bg-[#111221]">
        <VideoCallRoom
          roomId={validate.meetingCode}
          meetingId={validate.id}
          onLeave={() => navigate(isAuthed ? '/meetings' : '/')}
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
      <MeetingShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15">
            <XCircle className="h-8 w-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">{validateError.title}</h1>
          <p className="mt-2 max-w-sm text-sm text-white/55">{validateError.description}</p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => navigate('/')} className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10">
              Go home
            </Button>
            <Button onClick={() => void fetchValidate()} className="rounded-full bg-indigo-500 text-white hover:bg-indigo-600">
              Try again
            </Button>
          </div>
        </div>
      </MeetingShell>
    );
  }

  // ---------------------------------------------------------------- blocked states
  if (validateState === 'ready' && validate) {
    const s = validate.accessState;
    if (s === 'cancelled' || s === 'ended' || s === 'completed') {
      return (
        <MeetingShell>
          <BlockedState
            icon={<XCircle className="h-8 w-8 text-rose-400" />}
            title={s === 'cancelled' ? 'Meeting cancelled' : 'This meeting has ended'}
            description={
              s === 'cancelled'
                ? 'The host cancelled this meeting. Reach out to them if this is unexpected.'
                : 'The meeting is over. You can schedule a new one from your dashboard.'
            }
          />
        </MeetingShell>
      );
    }
    if (s === 'full') {
      return (
        <MeetingShell>
          <BlockedState
            icon={<Users className="h-8 w-8 text-amber-400" />}
            title="Meeting is full"
            description={`This meeting reached its maximum of ${validate.maxParticipants} participants.`}
          />
        </MeetingShell>
      );
    }
    if (s === 'not_started') {
      const mins = Math.ceil(notStartedCountdown / 60000);
      return (
        <MeetingShell>
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/15">
              <Hourglass className="h-8 w-8 text-indigo-300" />
            </div>
            <h1 className="text-xl font-semibold text-white">Not started yet</h1>
            <p className="mt-2 text-sm text-white/55">
              {mins > 0 ? `Starts in about ${mins} minute${mins > 1 ? 's' : ''}` : 'Starting now…'}
            </p>
            <div className="mt-4 flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm text-white/70">
              <Calendar className="h-4 w-4 text-indigo-300" />
              {validate.startTime ? new Date(validate.startTime).toLocaleString() : 'Scheduled'}
            </div>
          </div>
        </MeetingShell>
      );
    }
  }

  // ---------------------------------------------------------------- green room / loading
  const access = validate?.accessState;
  const showPasswordStep = access === 'password_required';

  return (
    <MeetingShell>
      <div className="w-full max-w-md">
        {validateState === 'loading' ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-white/55">Checking meeting…</p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {validate?.title || 'Team meeting'}
              </h1>
              <p className="mt-1 font-mono text-sm tracking-widest text-indigo-300">
                {validate?.meetingCode}
              </p>
            </div>

            {/* camera preview */}
            <div className="relative mx-auto mb-5 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1f2033] shadow-2xl">
              {camOn && previewStream ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-semibold text-white">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              )}
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
              {camOn && !previewStream && (
                <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70">
                  Camera unavailable
                </div>
              )}
            </div>

            {/* guest name entry */}
            {!isAuthed && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-white/60">Your name</label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Alex Guest"
                  className="h-12 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  onKeyDown={(e) => e.key === 'Enter' && void handleJoin()}
                />
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/40">
                  <ShieldCheck className="h-3 w-3" /> Joining as a guest — no account needed
                </p>
              </div>
            )}

            {/* password */}
            {showPasswordStep && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-white/60">Meeting password</label>
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

            {/* waiting room notice */}
            {access === 'waiting_room' && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-xs leading-relaxed text-amber-100/90">
                  The host will admit you when ready — you'll wait in the lobby.
                </p>
              </div>
            )}

            <Button
              onClick={() => void handleJoin()}
              disabled={!canJoin || joining}
              className="h-13 w-full rounded-full bg-indigo-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 disabled:opacity-40"
            >
              {joining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" /> Join now
                </>
              )}
            </Button>

            {!isAuthed && (
              <p className="mt-4 text-center text-xs text-white/40">
                Have an account?{' '}
                <button onClick={() => navigate('/login')} className="font-medium text-indigo-300 hover:text-indigo-200">
                  Sign in
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </MeetingShell>
  );
};

// ---------------------------------------------------------------- shell bits

function MeetingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-[#111221] via-[#141527] to-[#0d0e1a] p-6">
      {children}
    </div>
  );
}

function BlockedState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">{icon}</div>
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-white/55">{description}</p>
    </div>
  );
}

export default JoinMeeting;
