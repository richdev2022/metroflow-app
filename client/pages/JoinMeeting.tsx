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
import { TeamMember, Meeting } from '@shared/api';
import { useJoinMeeting } from '@/lib/meetings-chat-calls';
import { AlertTriangle, Calendar, Clock, Loader2, Lock, Users } from 'lucide-react';

const JoinMeeting = () => {
  const { meetingCode } = useParams<{ meetingCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const joinMeetingMutation = useJoinMeeting();

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [errorScreen, setErrorScreen] = useState<{
    title: string;
    description: string;
    canRetry?: boolean;
  } | null>(null);

  const CURRENT_USER_ID = () => localStorage.getItem('userId') || '';
  const isHost =
    meeting?.hostId === CURRENT_USER_ID() ||
    (meeting as any)?.coHostId === CURRENT_USER_ID();
  const currentParticipantIds =
    meeting?.attendees?.map((a: any) => a.userId) || [];

  const doJoinMeeting = useCallback(
    async (passwordVal?: string) => {
      if (!meeting) return;

      try {
        const result = await joinMeetingMutation.mutateAsync({
          meetingId: meeting.id,
          password: passwordVal,
        });
        setMeeting(result);
        setPasswordRequired(false);
        setPasswordError('');
        toast({
          title: 'Joined Meeting',
          description: 'Connecting to meeting room…',
        });
      } catch (err: any) {
        const code = err?.response?.data?.code;
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
        if (code === 'MEETING_COMPLETED') {
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
    [meeting, joinMeetingMutation, toast]
  );

  useEffect(() => {
    const fetchMeeting = async () => {
      if (!meetingCode) return;

      try {
        const response = await api.get(`/meetings/code/${meetingCode}`);
        const data = unwrapApiData<Meeting>(
          response.data,
          'Failed to find meeting'
        );
        setMeeting(data);

        if (
          data.status === 'completed' ||
          data.status === 'cancelled'
        ) {
          setErrorScreen({
            title:
              data.status === 'completed'
                ? 'Meeting has Ended'
                : 'Meeting Cancelled',
            description:
              data.status === 'completed'
                ? 'This meeting is no longer active.'
                : 'This meeting has been cancelled by the host.',
          });
          return;
        }

        if (data.password && !isHost) {
          setPasswordRequired(true);
        } else {
          await doJoinMeeting();
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setErrorScreen({
            title: 'Meeting Not Found',
            description:
              'The meeting link you used may be expired or invalid.',
          });
          return;
        }
        toast({
          title: 'Error',
          description: getApiMessage(err, 'Failed to find meeting'),
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
          unwrapApiData<TeamMember[]>(
            response.data,
            'Failed to fetch team members'
          )
        );
      } catch (err) {
        console.error('Failed to fetch team members:', err);
      }
    };

    fetchMeeting();
    fetchTeamMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, navigate, toast]);

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    setPasswordError('');
    await doJoinMeeting(password);
  };

  if (loading) {
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
            {errorScreen.canRetry && meeting && (
              <Button
                className="w-full"
                onClick={() => {
                  setErrorScreen(null);
                  if (meeting.password && !isHost) {
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

  if (passwordRequired) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
              <Lock className="h-7 w-7 text-indigo-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              {meeting?.title || 'Meeting'}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              This meeting requires a password to join
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {meeting && (
              <div className="space-y-2 rounded-lg bg-gray-900/60 p-4 text-sm text-muted-foreground border border-white/5">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  <span>
                    {new Date(meeting.startTime).toLocaleString()}
                    {meeting.endTime ? (
                      <>
                        {' '}
                        &mdash; {new Date(meeting.endTime).toLocaleTimeString()}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  <span>
                    {meeting.maxParticipants} participant capacity
                    {meeting.attendees?.length ? ` (${meeting.attendees.length} invited)` : ''}
                  </span>
                </div>
                {meeting.maxMeetingDuration && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span>
                      Max duration: {meeting.maxMeetingDuration} minute
                      {meeting.maxMeetingDuration === 1 ? '' : 's'}
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

  if (!meeting) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <VideoCallRoom
        roomId={meeting.meetingCode}
        meetingId={meeting.id}
        onLeave={() => navigate('/dashboard')}
        userName={localStorage.getItem('userName') || 'User'}
        isHost={isHost}
        waitingRoomEnabled={meeting.waitingRoomEnabled}
        teamMembers={teamMembers}
        currentParticipantIds={currentParticipantIds}
        initialParticipants={(meeting.attendees ?? []).map((a: any) => ({
          userId: a.userId,
          status:
            a.status === 'accepted' ? 'joined' : 'invited',
          isHost:
            meeting.hostId === a.userId ||
            (meeting as any).coHostId === a.userId,
          userName:
            teamMembers.find((m) => m.id === a.userId)?.name || a.userName,
        }))}
      />
    </div>
  );
};

export default JoinMeeting;
