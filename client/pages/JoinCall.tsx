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
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api-client';
import { getApiMessage, unwrapApiData } from '@/lib/api-response';
import { TeamMember, Call } from '@shared/api';
import { useJoinCall } from '@/lib/meetings-chat-calls';
import { AlertTriangle, Clock, Loader2, Lock, Users } from 'lucide-react';

const JoinCall = () => {
  const { callCode } = useParams<{ callCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const joinCallMutation = useJoinCall();

  const [loading, setLoading] = useState(true);
  const [call, setCall] = useState<Call | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [isRoomOpen, setIsRoomOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [errorScreen, setErrorScreen] = useState<{
    title: string;
    description: string;
    canRetry?: boolean;
  } | null>(null);

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';
  const isHost =
    call?.hostId === CURRENT_USER_ID() ||
    (call as any)?.coHostId === CURRENT_USER_ID();
  const currentParticipantIds = call?.participants?.map((p: any) => p.userId) || [];

  const doJoinCall = useCallback(
    async (passwordVal?: string) => {
      if (!call) return;

      try {
        const result = await joinCallMutation.mutateAsync({
          callId: call.id,
          password: passwordVal,
        });
        setCall(result);
        setIsRoomOpen(true);
        setPasswordRequired(false);
        setPasswordError('');
        toast({ title: 'Joined Call', description: 'Connecting to call room…' });
      } catch (err: any) {
        const code = err?.response?.data?.code;
        if (code === 'PASSWORD_REQUIRED' || code === 'INVALID_PASSWORD') {
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
        if (code === 'CALL_COMPLETED') {
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
    [call, joinCallMutation, toast]
  );

  useEffect(() => {
    const fetchCall = async () => {
      if (!callCode) return;

      try {
        const response = await api.get(`/calls/code/${callCode}`);
        const data = unwrapApiData<Call>(response.data, 'Failed to find call');
        setCall(data);

        if (
          data.status === 'completed' ||
          data.status === 'cancelled'
        ) {
          setErrorScreen({
            title:
              data.status === 'completed' ? 'Call has Ended' : 'Call Cancelled',
            description:
              data.status === 'completed'
                ? 'This call is no longer active.'
                : 'This call has been cancelled by the host.',
          });
          return;
        }

        if (data.password && !isHost) {
          setPasswordRequired(true);
        } else {
          await doJoinCall();
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setErrorScreen({
            title: 'Call Not Found',
            description: 'The call link you used may be expired or invalid.',
          });
          return;
        }
        toast({
          title: 'Error',
          description: getApiMessage(err, 'Failed to find call'),
          variant: 'destructive',
        });
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

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

    fetchCall();
    fetchTeamMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callCode, navigate, toast]);

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    setPasswordError('');
    await doJoinCall(password);
  };

  if (loading) {
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
            {errorScreen.canRetry && call && (
              <Button
                className="w-full"
                onClick={() => {
                  setErrorScreen(null);
                  if (call.password && !isHost) {
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

  if (passwordRequired) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
              <Lock className="h-7 w-7 text-indigo-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {call?.type === 'video' ? 'Video' : 'Audio'} Call
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              This call requires a password to join
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {call && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {call.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0}{' '}
                    participant
                    {(call.participants?.filter((p) => p.status === 'joined')
                      ?.length ?? 0) === 1
                      ? ''
                      : 's'}
                    &nbsp;in call
                  </span>
                </div>
                {call.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {call.maxMeetingDuration} minute
                      {call.maxMeetingDuration === 1 ? '' : 's'}
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

  if (!call) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <VideoCallRoom
        roomId={call.callCode}
        callId={call.id}
        callType={call.type}
        onLeave={() => navigate('/dashboard')}
        userName={localStorage.getItem('userName') || 'User'}
        isHost={isHost}
        waitingRoomEnabled={call.waitingRoomEnabled}
        teamMembers={teamMembers}
        currentParticipantIds={currentParticipantIds}
        initialParticipants={call.participants?.map((p: any) => ({
          userId: p.userId,
          status: p.status,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          isHost: call.hostId === p.userId || (call as any).coHostId === p.userId,
          userName:
            teamMembers.find((m) => m.id === p.userId)?.name || (p as any).userName,
        }))}
      />
    </div>
  );
};

export default JoinCall;
