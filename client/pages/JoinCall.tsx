import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import VideoCallRoom from '@/components/VideoCallRoom';
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
import { TeamMember, Call, ValidateAccessState } from '@shared/api';
import { useJoinCall, useValidateCallCode } from '@/lib/meetings-chat-calls';
import { guestValidateCall, guestJoinCall } from '@/lib/meetings-chat-calls';
import { setSocketAuth } from '@/hooks/useSocket';
import {
  AlertTriangle,
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

const JoinCall = () => {
  const { callCode } = useParams<{ callCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const joinCallMutation = useJoinCall();

  // Guests (no auth token) join via the public guest endpoints
  const isGuest = !localStorage.getItem('token');

  const {
    data: validateData,
    isLoading: validateLoading,
    error: validateError,
  } = useValidateCallCode(callCode || '', { enabled: !isGuest });

  // --- Guest state ---
  const [guestValidating, setGuestValidating] = useState(isGuest);
  const [guestValidateResult, setGuestValidateResult] = useState<any>(null);
  const [guestName, setGuestName] = useState('');
  const [guestJoining, setGuestJoining] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ guestId: string; guestName: string; call: any } | null>(null);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [call, setCall] = useState<Call | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [errorScreen, setErrorScreen] = useState<{
    title: string;
    description: string;
    canRetry?: boolean;
  } | null>(null);
  const [waitingRoomScreen, setWaitingRoomScreen] = useState(false);
  const [notStartedCountdown, setNotStartedCountdown] = useState<number>(0);
  // Watchdog: if nothing has resolved (joined / error / password / waiting
  // room) within 20s, offer a retry instead of an infinite "Preparing" spinner.
  const [joinStuck, setJoinStuck] = useState(false);

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';

  // --- Guest validation (public endpoint) ---
  useEffect(() => {
    if (!isGuest || !callCode) return;
    let cancelled = false;
    (async () => {
      try {
        const inviteToken = new URLSearchParams(window.location.search).get('token') || undefined;
        const result = await guestValidateCall(callCode, inviteToken);
        if (!cancelled) {
          setGuestValidateResult(result);
          setGuestValidating(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setGuestValidating(false);
          const status = err?.response?.status;
          setErrorScreen({
            title: status === 404 ? 'Call Not Found' : 'Unable to Open Call',
            description:
              status === 404
                ? 'The call link you used may be expired or invalid.'
                : getApiMessage(err, 'Failed to validate call link'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGuest, callCode]);

  // Guest join via public endpoint; establishes a guest socket identity
  const doGuestJoin = useCallback(
    async (passwordVal?: string) => {
      if (!callCode) return;
      const name = guestName.trim();
      if (!name) return;

      setPasswordError('');
      setErrorScreen(null);
      setGuestJoining(true);
      try {
        const result = await guestJoinCall(callCode, name, passwordVal);
        const prevUserId = localStorage.getItem('userId');
        const prevUserName = localStorage.getItem('userName');
        localStorage.setItem('userId', result.guestId);
        localStorage.setItem('userName', result.guestName);
        (window as any).__mfGuestRestore = { prevUserId, prevUserName };
        setSocketAuth({ guestToken: result.guestToken });
        setGuestInfo({ guestId: result.guestId, guestName: result.guestName, call: result.call });
        setCall(result.call as any);
        // Always mount the VideoCallRoom: it renders its own waiting-room
        // screen AND emits `waiting-room:request` so the host actually gets
        // the approval prompt. The old static waiting card never emitted the
        // request, leaving guests stuck and hosts unnotified.
        setIsJoined(true);
        if (result.call?.waitingRoomEnabled) {
          toast({
            title: 'Waiting Room',
            description: 'Please wait — the host will admit you shortly.',
          });
        }
      } catch (err: any) {
        const code = err?.response?.data?.errorCode ?? err?.response?.data?.code;
        if (code === 'PASSWORD_REQUIRED') {
          setPasswordRequired(true);
          setPasswordError('');
        } else if (code === 'MAX_PARTICIPANTS_REACHED') {
          setErrorScreen({
            title: 'Call is Full',
            description: 'This call has reached its maximum capacity. Please try again later.',
            canRetry: true,
          });
        } else if (code === 'CALL_CANCELLED' || code === 'CALL_COMPLETED' || code === 'CALL_ENDED') {
          setErrorScreen({
            title: 'Call has Ended',
            description: 'This call is no longer active.',
          });
        } else {
          setErrorScreen({
            title: 'Unable to Join',
            description: getApiMessage(err, 'Failed to join call as guest'),
            canRetry: true,
          });
        }
      } finally {
        setGuestJoining(false);
      }
    },
    [callCode, guestName, toast]
  );

  const accessState: ValidateAccessState | null = validateData?.accessState ?? null;
  const hasPassword = validateData?.hasPassword ?? call?.hasPassword ?? Boolean(call?.password);

  // Backend validate returns call fields FLAT (no nested `call` key) —
  // effectiveCall was null forever -> auto-join never fired ("Preparing to join…").
  const effectiveCall =
    call ?? validateData?.call ?? ((validateData as any)?.id ? (validateData as any) : null) ?? null;
  const effectiveIsHost =
    validateData?.isHost ??
    (effectiveCall
      ? effectiveCall.hostId === CURRENT_USER_ID() ||
        (effectiveCall as any)?.coHostId === CURRENT_USER_ID()
      : false);
  const effectiveInWaitingRoom = validateData?.inWaitingRoom ?? call?.inWaitingRoom ?? false;
  const currentParticipantIds =
    effectiveCall?.participants?.map((p: any) => p.userId) || [];

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

  const doJoinCall = useCallback(
    async (passwordVal?: string) => {
      if (!effectiveCall) return;

      setPasswordError('');
      setPasswordRequired(false);
      setErrorScreen(null);
      setWaitingRoomScreen(false);

      try {
        const result = await joinCallMutation.mutateAsync({
          callId: effectiveCall.id,
          password: passwordVal,
        });
        setCall(result);

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
          toast({ title: 'Joined Call', description: 'Connecting to call room…' });
        }
      } catch (err: any) {
        // Normalize backend error codes (errorCode/code, lower/UPPER) so the
        // password / full / ended branches below always match.
        const code = getApiErrorCode(err);
        if (code === 'PASSWORD_REQUIRED' || code === 'INVALID_PASSWORD' || code === 'CALL_PASSWORD_REQUIRED') {
          setPasswordRequired(true);
          setPasswordError(
            code === 'INVALID_PASSWORD' ? 'Incorrect password. Please try again.' : ''
          );
          return;
        }
        if (code === 'MAX_PARTICIPANTS_REACHED') {
          setErrorScreen({
            title: 'Call is Full',
            description:
              'This call has reached its maximum capacity. Please ask the host to increase the limit or try again later.',
            canRetry: true,
          });
          return;
        }
        if (code === 'CALL_COMPLETED' || code === 'CALL_CANCELLED' || code === 'CALL_MISSED' || code === 'CALL_ENDED') {
          setErrorScreen({
            title: 'Call has Ended',
            description: 'This call is no longer active.',
          });
          return;
        }
        toast({
          title: 'Error',
          description: getApiMessage(err, 'Failed to join call'),
          variant: 'destructive',
        });
      }
    },
    [effectiveCall, joinCallMutation, toast]
  );

  useEffect(() => {
    if (!accessState || !validateData) return;

    switch (accessState) {
      case 'allowed':
        if (effectiveCall && !isJoined && !waitingRoomScreen) {
          doJoinCall();
        }
        break;
      case 'password_required':
        setPasswordRequired(true);
        break;
      case 'waiting_room':
        if (effectiveCall && !isJoined && !waitingRoomScreen) {
          doJoinCall();
        }
        break;
      case 'not_started':
        break;
      case 'full':
        setErrorScreen({
          title: 'Call is Full',
          description:
            'This call has reached its maximum participant capacity. Please try again later.',
          canRetry: true,
        });
        break;
      case 'ended':
      case 'completed':
        setErrorScreen({
          title: 'Call has Ended',
          description: 'This call is no longer active.',
        });
        break;
      case 'cancelled':
        setErrorScreen({
          title: 'Call Cancelled',
          description: 'This call has been cancelled by the host.',
        });
        break;
      case 'missed':
        setErrorScreen({
          title: 'Call Missed',
          description: 'You missed this call.',
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
  }, [isJoined, errorScreen, passwordRequired, waitingRoomScreen, validateLoading, guestValidating]);

  useEffect(() => {
    // Guests have no session - skip the authed team fetch (a 401 here would
    // trigger the global logout/redirect in the axios interceptor).
    if (isGuest) return;
    const fetchTeamMembers = async () => {
      try {
        const response = await api.get('/team');
        setTeamMembers(
          unwrapApiData<TeamMember[]>(response.data, 'Failed to fetch team members')
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
          title: 'Call Not Found',
          description: 'The call link you used may be expired or invalid.',
        });
      } else {
        toast({
          title: 'Error',
          description: getApiMessage(validateError, 'Failed to validate call link'),
          variant: 'destructive',
        });
        navigate('/dashboard');
      }
    }
  }, [validateError, navigate, toast]);

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    await doJoinCall(password);
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
          <p className="text-muted-foreground">Loading call…</p>
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
            <CardTitle className="text-xl text-white">{errorScreen.title}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {errorScreen.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {errorScreen.canRetry && effectiveCall && (
              <Button
                className="w-full"
                onClick={() => {
                  setErrorScreen(null);
                  if (accessState === 'password_required') {
                    setPasswordRequired(true);
                  } else {
                    doJoinCall();
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
    const gCall = guestValidateResult?.call;
    const needsPassword = passwordRequired || guestAccess === 'password_required';

    if (guestAccess === 'ended' || guestAccess === 'completed' || guestAccess === 'missed') {
      return (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-xl text-white">Call has Ended</CardTitle>
              <CardDescription className="text-muted-foreground">This call is no longer active.</CardDescription>
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
              <CardTitle className="text-xl text-white">Call Cancelled</CardTitle>
              <CardDescription className="text-muted-foreground">This call has been cancelled by the host.</CardDescription>
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
              <CardTitle className="text-xl text-white">Call is Full</CardTitle>
              <CardDescription className="text-muted-foreground">This call has reached its maximum capacity.</CardDescription>
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
              {gCall?.type === 'video' ? 'Video' : 'Audio'} Call
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {gCall?.hostName ? `Hosted by ${gCall.hostName} · ` : ''}Join as a guest
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
                  <Label htmlFor="guest-password" className="text-white">Call password</Label>
                  <Input
                    id="guest-password"
                    type="password"
                    placeholder="Enter call password"
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
              Join Call
            </Button>
            {gCall?.waitingRoomEnabled && (
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
        <VideoCallRoom
          roomId={guestInfo.call?.callCode || callCode}
          callId={guestInfo.call?.id}
          callType={(guestInfo.call?.type as 'audio' | 'video') || 'video'}
          onLeave={leaveGuestRoom}
          userName={guestInfo.guestName}
          isHost={false}
          waitingRoomEnabled={guestInfo.call?.waitingRoomEnabled}
          inviteDetails={{
            code: guestInfo.call?.callCode || callCode,
            password: null,
            waitingRoomEnabled: guestInfo.call?.waitingRoomEnabled,
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
              {effectiveCall?.type === 'video' ? 'Video' : 'Audio'} Call has not started
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
            {effectiveCall && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {effectiveCall.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0}{' '}
                    participant
                    {(effectiveCall.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0) === 1
                      ? ''
                      : 's'}
                    &nbsp;waiting
                  </span>
                </div>
                {effectiveCall.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {effectiveCall.maxMeetingDuration} minute
                      {effectiveCall.maxMeetingDuration === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => doJoinCall()}
                disabled={joinCallMutation.isPending}
              >
                {joinCallMutation.isPending ? (
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
              {effectiveCall?.type === 'video' ? 'Video' : 'Audio'} Call
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              This call requires a password to join
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {effectiveCall && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {effectiveCall.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0}{' '}
                    participant
                    {(effectiveCall.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0) === 1
                      ? ''
                      : 's'}
                    &nbsp;in call
                  </span>
                </div>
                {effectiveCall.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {effectiveCall.maxMeetingDuration} minute
                      {effectiveCall.maxMeetingDuration === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="join-call-password" className="text-white">
                Password
              </Label>
              <Input
                id="join-call-password"
                type="password"
                placeholder="Enter call password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password.trim()) handlePasswordSubmit();
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
              disabled={joinCallMutation.isPending || !password.trim()}
            >
              {joinCallMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Join Call
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
              disabled={joinCallMutation.isPending}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isJoined && effectiveCall) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden">
        <VideoCallRoom
          roomId={effectiveCall.callCode}
          callId={effectiveCall.id}
          callType={effectiveCall.type}
          onLeave={() => navigate('/dashboard')}
          userName={localStorage.getItem('userName') || 'User'}
          isHost={effectiveIsHost}
          waitingRoomEnabled={effectiveCall.waitingRoomEnabled}
          inviteDetails={{
            code: effectiveCall.callCode,
            password: effectiveIsHost ? (effectiveCall as any).password || null : null,
            waitingRoomEnabled: effectiveCall.waitingRoomEnabled,
          }}
          teamMembers={teamMembers}
          currentParticipantIds={currentParticipantIds}
          initialParticipants={effectiveCall.participants?.map((p: any) => ({
            userId: p.userId,
            status: p.status,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            isHost:
              Boolean(p.isHost) ||
              effectiveCall.hostId === p.userId ||
              (effectiveCall as any).coHostId === p.userId,
            userName:
              teamMembers.find((m) => m.id === p.userId)?.name || p.userName,
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

export default JoinCall;
