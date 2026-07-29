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
import { getApiMessage, unwrapApiData } from '@/lib/api-response';
import { TeamMember, Meeting, ValidateAccessState } from '@shared/api';
import { useJoinMeeting, useValidateMeetingCode } from '@/lib/meetings-chat-calls';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  Lock,
  Users,
  CheckCircle2,
  Hourglass,
  PhoneOff,
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

  const {
    data: validateData,
    isLoading: validateLoading,
    error: validateError,
  } = useValidateMeetingCode(meetingCode || '');

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
  const [notStartedCountdown, setNotStartedCountdown] = useState<number>(0);

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';

  const accessState: ValidateAccessState | null = validateData?.accessState ?? null;
  const hasPassword =
    validateData?.hasPassword ?? meeting?.hasPassword ?? Boolean(meeting?.password);

  const effectiveMeeting = meeting ?? validateData?.meeting ?? null;
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

        if (result.inWaitingRoom) {
          setWaitingRoomScreen(true);
          toast({
            title: 'Waiting Room',
            description: 'Please wait — the host will admit you shortly.',
          });
        } else {
          setIsJoined(true);
          toast({
            title: 'Joined Meeting',
            description: 'Connecting to meeting room…',
          });
        }
      } catch (err: any) {
        const code = err?.response?.data?.code ?? err?.response?.data?.errorCode;
        if (code === 'PASSWORD_REQUIRED' || code === 'INVALID_PASSWORD') {
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
          code === 'MEETING_CANCELLED'
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

  useEffect(() => {
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

  if (validateLoading || (!accessState && !validateError)) {
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

  if (waitingRoomScreen || (isJoined && effectiveInWaitingRoom)) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-emerald-500/20 p-3 w-fit">
              <CheckCircle2 className="h-7 w-7 text-emerald-400 animate-pulse" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Waiting Room
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Please wait — the host has been notified and will admit you shortly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {effectiveMeeting && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {effectiveMeeting.attendees?.filter(
                      (a) => a.status === 'accepted'
                    )?.length ??
                      effectiveMeeting.participants?.filter(
                        (p) => p.status === 'joined'
                      )?.length ??
                      0}{' '}
                    participant
                    {(effectiveMeeting.attendees?.filter(
                        (a) => a.status === 'accepted'
                      )?.length ??
                      effectiveMeeting.participants?.filter(
                        (p) => p.status === 'joined'
                      )?.length ??
                      0) ===
                    1
                      ? ''
                      : 's'}
                    &nbsp;in meeting
                  </span>
                </div>
                {hasPassword && (
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-emerald-400" />
                    <span>Password verified</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Awaiting host approval…</span>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/dashboard')}
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Leave Waiting Room
            </Button>
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
        <VideoCallRoom
          roomId={effectiveMeeting.meetingCode}
          meetingId={effectiveMeeting.id}
          onLeave={() => navigate('/dashboard')}
          userName={localStorage.getItem('userName') || 'User'}
          isHost={effectiveIsHost}
          waitingRoomEnabled={effectiveMeeting.waitingRoomEnabled}
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
      <div className="flex flex-col items-center gap-4 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        <p className="text-muted-foreground">Preparing to join…</p>
      </div>
    </div>
  );
};

export default JoinMeeting;
