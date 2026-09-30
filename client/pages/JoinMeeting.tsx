import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CallRoom } from '@/components/call-room/CallRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api-client';
import { getApiMessage, getApiErrorCode, unwrapApiData } from '@/lib/api-response';
import { TeamMember, Meeting, ValidateAccessState } from '@shared/api';
import { useJoinMeeting, useValidateMeetingCode } from '@/lib/meetings-chat-calls';
import { guestValidateMeeting, guestJoinMeeting } from '@/lib/meetings-chat-calls';
import { setSocketAuth } from '@/hooks/useSocket';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  Lock,
  Users,
  Hourglass,
} from 'lucide-react';

const formatStartsIn = (ms: number) => {
  if (ms <= 0) return 'now';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const JoinMeeting = () => {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const joinMeetingMutation = useJoinMeeting();

  // Guests (no auth token) join via the public guest endpoints
  const isGuest = !localStorage.getItem('token');

  const {
    data: validateData,
    isLoading: validateLoading,
    error: validateError,
  } = useValidateMeetingCode(meetingCode || '', { enabled: !isGuest });

  // --- Guest state ---
  const [guestValidating, setGuestValidating] = useState(isGuest);
  const [guestValidateResult, setGuestValidateResult] = useState<any>(null);
  const [guestName, setGuestName] = useState('');
  const [guestJoining, setGuestJoining] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ guestId: string; guestName: string; meeting: any; calling?: any } | null>(null);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [errorScreen, setErrorScreen] = useState<{
    title: string;
    description: string;
    canRetry?: boolean;
  } | null>(null);
  const [waitingRoomScreen, setWaitingRoomScreen] = useState(false);
  // Watchdog: if nothing has resolved (joined / error / password / waiting
  // room) within 20s, offer a retry instead of an infinite "Preparing" spinner.
  const [joinStuck, setJoinStuck] = useState(false);
  const [notStartedCountdown, setNotStartedCountdown] = useState<number>(0);

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';

  // --- Guest validation (public endpoint) ---
  useEffect(() => {
    if (!isGuest || !meetingCode) return;
    let cancelled = false;
    (async () => {
      try {
        const inviteToken = new URLSearchParams(window.location.search).get('token') || undefined;
        const result = await guestValidateMeeting(meetingCode, inviteToken);
        if (!cancelled) {
          setGuestValidateResult(result);
          setGuestValidating(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setGuestValidating(false);
          const status = err?.response?.status;
          setErrorScreen({
            title: status === 404 ? 'Meeting Not Found' : 'Unable to Open Meeting',
            description:
              status === 404
                ? 'The meeting link you used may be expired or invalid.'
                : getApiMessage(err, 'Failed to validate meeting link'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGuest, meetingCode]);

  // Guest join via public endpoint; establishes a guest socket identity
  const doGuestJoin = useCallback(
    async (passwordVal?: string) => {
      if (!meetingCode) return;
      const name = guestName.trim();
      if (!name) return;

      setPasswordError('');
      setErrorScreen(null);
      setGuestJoining(true);
      try {
        const result = await guestJoinMeeting(meetingCode, name, passwordVal);
        // Give the guest a temporary identity + socket handshake auth.
        // VideoCallRoom reads identity from localStorage.
        const prevUserId = localStorage.getItem('userId');
        const prevUserName = localStorage.getItem('userName');
        localStorage.setItem('userId', result.guestId);
        localStorage.setItem('userName', result.guestName);
        (window as any).__mfGuestRestore = { prevUserId, prevUserName };
        setSocketAuth({ guestToken: result.guestToken });
        setGuestInfo({ guestId: result.guestId, guestName: result.guestName, meeting: result.meeting, calling: (result as any).calling });
        setMeeting(result.meeting as any);
        // Always mount the VideoCallRoom: it renders its own waiting-room
        // screen AND emits `waiting-room:request` so the host actually gets
        // the approval prompt. The old static waiting card never emitted the
        // request, leaving guests stuck and hosts unnotified.
        setIsJoined(true);
        if (result.meeting?.waitingRoomEnabled) {
          toast({
            title: 'Waiting Room',
            description: 'Please wait — the host will admit you shortly.',
          });
        }
      } catch (err: any) {
        const code = getApiErrorCode(err);
        if (code === 'PASSWORD_REQUIRED') {
          setPasswordRequired(true);
          setPasswordError('');
        } else if (code === 'MAX_PARTICIPANTS_REACHED') {
          setErrorScreen({
            title: 'Meeting is Full',
            description: 'This meeting has reached its maximum capacity. Please try again later.',
            canRetry: true,
          });
        } else if (code === 'MEETING_CANCELLED' || code === 'MEETING_COMPLETED' || code === 'MEETING_ENDED') {
          setErrorScreen({
            title: 'Meeting has Ended',
            description: 'This meeting is no longer active.',
          });
        } else {
          setErrorScreen({
            title: 'Unable to Join',
            description: getApiMessage(err, 'Failed to join meeting as guest'),
            canRetry: true,
          });
        }
      } finally {
        setGuestJoining(false);
      }
    },
    [meetingCode, guestName, toast]
  );

  const accessState: ValidateAccessState | null = validateData?.accessState ?? null;
  const hasPassword =
    validateData?.hasPassword ?? meeting?.hasPassword ?? Boolean(meeting?.password);

  // The backend validate endpoint returns the meeting fields FLAT (no nested
  // `meeting` key) — effectiveMeeting was null forever, so the auto-join
  // effect never fired and participants sat on "Preparing to join…".
  const effectiveMeeting =
    meeting ?? validateData?.meeting ?? ((validateData as any)?.id ? (validateData as any) : null) ?? null;
  const effectiveIsHost =
    validateData?.isHost ??
    (effectiveMeeting
      ? effectiveMeeting.hostId === CURRENT_USER_ID() ||
        (effectiveMeeting as any)?.coHostId === CURRENT_USER_ID()
      : false);
  const effectiveInWaitingRoom =
    validateData?.inWaitingRoom ?? meeting?.inWaitingRoom ?? false;
  const currentParticipantIds =
    effectiveMeeting?.attendees?.map((a: any) => a.userId) || [];

  useEffect(() => {
    if (accessState === 'not_started' && validateData?.startsInMs != null) {
      setNotStartedCountdown(validateData.startsInMs);
      const startTs = Date.now();
      const startVal = validateData.startsInMs;
      const timer = setInterval(() => {
        const remaining = startVal - (Date.now() - startTs);
        if (remaining <= 0) {
          clearInterval(timer);
          setNotStartedCountdown(0);
        } else {
          setNotStartedCountdown(remaining);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [accessState, validateData]);

  const doJoinMeeting = useCallback(
    async (passwordVal?: string) => {
      if (!effectiveMeeting) return;

      setPasswordError('');
      setPasswordRequired(false);
      setErrorScreen(null);
      setWaitingRoomScreen(false);

      try {
        const result = await joinMeetingMutation.mutateAsync({
          meetingId: effectiveMeeting.id,
          password: passwordVal,
        });
        setMeeting(result);

        // Always mount the VideoCallRoom (see guest-flow note above): its
        // waiting-room screen emits `waiting-room:request` to the host and
        // upgrades to the full room on `waiting-room:admitted`.
        setIsJoined(true);
        if (result.inWaitingRoom) {
          toast({
            title: 'Waiting Room',
            description: 'Please wait — the host will admit you shortly.',
          });
        } else {
          toast({
            title: 'Joined Meeting',
            description: 'Connecting to meeting room…',
          });
        }
      } catch (err: any) {
        const code = getApiErrorCode(err);
        if (code === 'PASSWORD_REQUIRED' || code === 'INVALID_PASSWORD' || code === 'MEETING_PASSWORD_REQUIRED') {
          setPasswordRequired(true);
          setPasswordError(
            code === 'INVALID_PASSWORD'
              ? 'Incorrect password. Please try again.'
              : ''
          );
          return;
        }
        if (code === 'MAX_PARTICIPANTS_REACHED') {
          setErrorScreen({
            title: 'Meeting is Full',
            description:
              'This meeting has reached its maximum capacity. Please ask the host to increase the limit or try again later.',
            canRetry: true,
          });
          return;
        }
        if (
          code === 'MEETING_COMPLETED' ||
          code === 'MEETING_CANCELLED' ||
          code === 'MEETING_ENDED'
        ) {
          setErrorScreen({
            title: 'Meeting has Ended',
            description: 'This meeting is no longer active.',
          });
          return;
        }
        toast({
          title: 'Error',
          description: getApiMessage(err, 'Failed to join meeting'),
          variant: 'destructive',
        });
      }
    },
    [effectiveMeeting, joinMeetingMutation, toast]
  );

  useEffect(() => {
    if (!accessState || !validateData) return;

    switch (accessState) {
      case 'allowed':
        if (effectiveMeeting && !isJoined && !waitingRoomScreen) {
          doJoinMeeting();
        }
        break;
      case 'password_required':
        setPasswordRequired(true);
        break;
      case 'waiting_room':
        if (effectiveMeeting && !isJoined && !waitingRoomScreen) {
          doJoinMeeting();
        }
        break;
      case 'not_started':
        break;
      case 'full':
        setErrorScreen({
          title: 'Meeting is Full',
          description:
            'This meeting has reached its maximum participant capacity. Please try again later.',
          canRetry: true,
        });
        break;
      case 'ended':
      case 'completed':
        setErrorScreen({
          title: 'Meeting has Ended',
          description: 'This meeting is no longer active.',
        });
        break;
      case 'cancelled':
        setErrorScreen({
          title: 'Meeting Cancelled',
          description: 'This meeting has been cancelled by the host.',
        });
        break;
      case 'missed':
        setErrorScreen({
          title: 'Meeting Missed',
          description: 'You missed this meeting.',
        });
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessState, validateData]);

  // Join watchdog: resolve or offer a retry within 20s.
  useEffect(() => {
    if (isJoined || errorScreen || passwordRequired || waitingRoomScreen) {
      setJoinStuck(false);
      return;
    }
    const t = setTimeout(() => setJoinStuck(true), 20000);
    return () => clearTimeout(t);
  }, [isJoined, errorScreen, passwordRequired, waitingRoomScreen]);

  useEffect(() => {
    // Guests have no session - skip the authed team fetch (a 401 here would
    // trigger the global logout/redirect in the axios interceptor).
    if (isGuest) return;
    const fetchTeamMembers = async () => {
      try {
        const response = await api.get('/team');
        setTeamMembers(
          unwrapApiData<TeamMember[]>(
            response.data,
            'Failed to fetch team members'
          )
        );
      } catch (err) {
        console.error('Failed to fetch team members:', err);
      }
    };

    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (validateError) {
      const status = (validateError as any)?.response?.status;
      if (status === 404) {
        setErrorScreen({
          title: 'Meeting Not Found',
          description:
            'The meeting link you used may be expired or invalid.',
        });
      } else {
        toast({
          title: 'Error',
          description: getApiMessage(validateError, 'Failed to validate meeting link'),
          variant: 'destructive',
        });
        navigate('/dashboard');
      }
    }
  }, [validateError, navigate, toast]);

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    await doJoinMeeting(password);
  };

  // Restore any pre-guest identity and drop the guest socket auth
  const leaveGuestRoom = useCallback(() => {
    const restore = (window as any).__mfGuestRestore;
    if (restore) {
      if (restore.prevUserId) localStorage.setItem('userId', restore.prevUserId);
      else localStorage.removeItem('userId');
      if (restore.prevUserName) localStorage.setItem('userName', restore.prevUserName);
      else localStorage.removeItem('userName');
      (window as any).__mfGuestRestore = null;
    }
    setSocketAuth(null);
    navigate('/');
  }, [navigate]);

  if (validateLoading || guestValidating || (!isGuest && !accessState && !validateError)) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
          <p className="text-muted-foreground">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (errorScreen) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-destructive/20 p-3 w-fit">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <CardTitle className="text-xl text-white">
              {errorScreen.title}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {errorScreen.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {errorScreen.canRetry && effectiveMeeting && (
              <Button
                className="w-full"
                onClick={() => {
                  setErrorScreen(null);
                  if (accessState === 'password_required') {
                    setPasswordRequired(true);
                  } else {
                    doJoinMeeting();
                  }
                }}
              >
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/dashboard')}
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Guest flow: render name/password form and the guest room ---
  if (isGuest && !errorScreen && !isJoined && !waitingRoomScreen) {
    const guestAccess = guestValidateResult?.accessState as string | undefined;
    const gMeeting = guestValidateResult?.meeting;
    const needsPassword = passwordRequired || guestAccess === 'password_required';

    if (guestAccess === 'ended' || guestAccess === 'completed') {
      return (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl text-white">Meeting has Ended</CardTitle>
              <CardDescription className="text-muted-foreground">This meeting is no longer active.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    if (guestAccess === 'cancelled') {
      return (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl text-white">Meeting Cancelled</CardTitle>
              <CardDescription className="text-muted-foreground">This meeting has been cancelled by the host.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    if (guestAccess === 'full') {
      return (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl text-white">Meeting is Full</CardTitle>
              <CardDescription className="text-muted-foreground">This meeting has reached its maximum capacity.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
              <Users className="h-7 w-7 text-indigo-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {gMeeting?.title || 'Meeting'}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {gMeeting?.hostName ? `Hosted by ${gMeeting.hostName} · ` : ''}Join as a guest
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="guest-name" className="text-white">Your name</Label>
              <Input
                id="guest-name"
                placeholder="Enter your name"
                value={guestName}
                maxLength={60}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && guestName.trim()) doGuestJoin(needsPassword ? password : undefined);
                }}
                autoFocus
              />
              {needsPassword && (
                <>
                  <Label htmlFor="guest-password" className="text-white">Meeting password</Label>
                  <Input
                    id="guest-password"
                    type="password"
                    placeholder="Enter meeting password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                  />
                  {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                </>
              )}
            </div>
            <Button
              className="w-full"
              disabled={guestJoining || !guestName.trim() || (needsPassword && !password.trim())}
              onClick={() => doGuestJoin(needsPassword ? password : undefined)}
            >
              {guestJoining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Meeting
            </Button>
            {gMeeting?.waitingRoomEnabled && (
              <p className="text-xs text-muted-foreground text-center">
                The host may need to admit you from the waiting room.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isGuest && isJoined && guestInfo) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden">
        <CallRoom
          roomId={guestInfo.meeting?.meetingCode || meetingCode}
          meetingId={guestInfo.meeting?.id}
          onLeave={leaveGuestRoom}
          userName={guestInfo.guestName}
          isHost={false}
          waitingRoomEnabled={guestInfo.meeting?.waitingRoomEnabled}
          calling={(guestInfo as any).calling || null}
          inviteDetails={{
            title: guestInfo.meeting?.title,
            code: guestInfo.meeting?.meetingCode || meetingCode,
            password: null,
            waitingRoomEnabled: guestInfo.meeting?.waitingRoomEnabled,
            startTime: guestInfo.meeting?.startTime,
          }}
        />
      </div>
    );
  }

  // NOTE: the old static waiting-room screens (guest + authed) were removed —
  // they never emitted `waiting-room:request`, so hosts were never notified and
  // participants waited forever. VideoCallRoom owns the full waiting flow now.

  if (accessState === 'not_started') {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
              <Hourglass className="h-7 w-7 text-indigo-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {effectiveMeeting?.title || 'Meeting'} has not started
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Please wait until the scheduled start time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent p-5 text-center border border-white/5">
              <Badge variant="outline" className="mb-3 bg-white/5">
                <Clock className="h-3 w-3 mr-1" />
                Starts in
              </Badge>
              <div className="text-5xl font-bold tracking-tight text-white tabular-nums">
                {formatStartsIn(notStartedCountdown)}
              </div>
            </div>
            {effectiveMeeting && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  <span>
                    {new Date(effectiveMeeting.startTime).toLocaleString()}
                    {effectiveMeeting.endTime ? (
                      <>
                        {' '}
                        &mdash;{' '}
                        {new Date(effectiveMeeting.endTime).toLocaleTimeString()}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {effectiveMeeting.maxParticipants} participant capacity
                    {effectiveMeeting.attendees?.length
                      ? ` (${effectiveMeeting.attendees.length} invited)`
                      : ''}
                  </span>
                </div>
                {effectiveMeeting.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {effectiveMeeting.maxMeetingDuration} minute
                      {effectiveMeeting.maxMeetingDuration === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => doJoinMeeting()}
                disabled={joinMeetingMutation.isPending}
              >
                {joinMeetingMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Join Early
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
                className="flex-1"
              >
                Back Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
              <Lock className="h-7 w-7 text-indigo-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {effectiveMeeting?.title || 'Meeting'}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              This meeting requires a password to join
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {effectiveMeeting && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  <span>
                    {new Date(effectiveMeeting.startTime).toLocaleString()}
                    {effectiveMeeting.endTime ? (
                      <>
                        {' '}
                        &mdash;{' '}
                        {new Date(effectiveMeeting.endTime).toLocaleTimeString()}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {effectiveMeeting.maxParticipants} participant capacity
                    {effectiveMeeting.attendees?.length
                      ? ` (${effectiveMeeting.attendees.length} invited)`
                      : ''}
                  </span>
                </div>
                {effectiveMeeting.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {effectiveMeeting.maxMeetingDuration} minute
                      {effectiveMeeting.maxMeetingDuration === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="join-meeting-password" className="text-white">
                Password
              </Label>
              <Input
                id="join-meeting-password"
                type="password"
                placeholder="Enter meeting password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password.trim())
                    handlePasswordSubmit();
                }}
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <Button
              onClick={handlePasswordSubmit}
              className="w-full"
              disabled={
                joinMeetingMutation.isPending || !password.trim()
              }
            >
              {joinMeetingMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Join Meeting
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
              disabled={joinMeetingMutation.isPending}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isJoined && effectiveMeeting) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden">
        <CallRoom
          roomId={effectiveMeeting.meetingCode}
          meetingId={effectiveMeeting.id}
          onLeave={() => navigate('/dashboard')}
          userName={localStorage.getItem('userName') || 'User'}
          isHost={effectiveIsHost}
          waitingRoomEnabled={effectiveMeeting.waitingRoomEnabled}
          calling={(meeting as any)?.calling || (effectiveMeeting as any)?.calling || null}
          title={effectiveMeeting.title}
          inviteDetails={{
            title: effectiveMeeting.title,
            code: effectiveMeeting.meetingCode,
            password: effectiveIsHost ? (effectiveMeeting as any).password || null : null,
            waitingRoomEnabled: effectiveMeeting.waitingRoomEnabled,
            startTime: effectiveMeeting.startTime,
          }}
          teamMembers={teamMembers}
          currentParticipantIds={currentParticipantIds}
          initialParticipants={(effectiveMeeting.participants ??
            effectiveMeeting.attendees ??
            []
          ).map((a: any): {
            userId: string;
            status: 'invited' | 'joined' | 'left';
            joinedAt?: string;
            leftAt?: string;
            isHost?: boolean;
            userName?: string;
          } => ({
            userId: a.userId,
            status:
              a.status === 'accepted' || a.status === 'joined'
                ? 'joined'
                : a.status === 'left'
                ? 'left'
                : 'invited',
            isHost:
              Boolean(a.isHost) ||
              effectiveMeeting.hostId === a.userId ||
              (effectiveMeeting as any).coHostId === a.userId,
            userName:
              teamMembers.find((m) => m.id === a.userId)?.name || a.userName,
            joinedAt: a.joinedAt,
            leftAt: a.leftAt,
          }))}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50">
      {joinStuck ? (
        <div className="mx-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white shadow-xl">
          <p className="font-semibold">Having trouble joining?</p>
          <p className="mt-2 text-sm text-white/70">
            This is taking longer than usual. Check your connection, then try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
          <p className="text-muted-foreground">Preparing to join…</p>
        </div>
      )}
    </div>
  );
};

export default JoinMeeting;
