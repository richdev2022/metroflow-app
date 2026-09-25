import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import {
  connectAsGuest,
  disconnectAsGuest,
  getSingletonSocket,
} from '@/hooks/useSocket';
import {
  AlertTriangle,
  Loader2,
  Lock,
  LogIn,
  Users,
  Video,
} from 'lucide-react';

export interface JoinAsGuestProps {
  kind: 'meeting' | 'call';
}

interface GuestMeetingData {
  id: string;
  title?: string;
  meetingCode?: string;
  status?: string;
  hostName?: string;
  hasPassword?: boolean;
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  screenSharingEnabled?: boolean;
}

interface GuestCallData {
  id: string;
  type?: 'audio' | 'video';
  callCode?: string;
  status?: string;
  hostName?: string;
  hasPassword?: boolean;
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  isGroupCall?: boolean;
}

interface GuestJoinData {
  meeting?: GuestMeetingData;
  call?: GuestCallData;
  guestToken: string;
  guestId: string;
  guestName: string;
  roomId?: string;
  socketRoom?: string;
  expiresAt?: string;
}

interface ErrorScreen {
  title: string;
  description: string;
  canRetry?: boolean;
}

const JoinAsGuest: React.FC<JoinAsGuestProps> = ({ kind }) => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinedData, setJoinedData] = useState<GuestJoinData | null>(null);
  const [errorScreen, setErrorScreen] = useState<ErrorScreen | null>(null);

  const roomCode = code || '';
  const noun = kind === 'meeting' ? 'meeting' : 'call';

  const describeJoinError = (
    errorCode: string,
    fallbackMessage: string
  ): ErrorScreen => {
    if (errorCode.endsWith('_NOT_FOUND')) {
      return {
        title: kind === 'meeting' ? 'Meeting Not Found' : 'Call Not Found',
        description: `This ${noun} link is invalid or has expired. Please double-check the link and try again.`,
      };
    }
    if (errorCode.endsWith('_CANCELLED')) {
      return {
        title: kind === 'meeting' ? 'Meeting Cancelled' : 'Call Cancelled',
        description: `This ${noun} has been cancelled by the host.`,
      };
    }
    if (errorCode.endsWith('_COMPLETED') || errorCode.endsWith('_ENDED')) {
      return {
        title: kind === 'meeting' ? 'Meeting Has Ended' : 'Call Has Ended',
        description: `This ${noun} is no longer active.`,
      };
    }
    if (errorCode === 'MAX_PARTICIPANTS_REACHED') {
      return {
        title: `${kind === 'meeting' ? 'Meeting' : 'Call'} Is Full`,
        description: `This ${noun} has reached its maximum capacity. Please ask the host for help or try again later.`,
        canRetry: true,
      };
    }
    return {
      title: 'Unable to Join',
      description: fallbackMessage,
      canRetry: true,
    };
  };

  const handleGuestJoin = async (passwordVal?: string) => {
    if (!roomCode) {
      setErrorScreen({
        title: 'Invalid Link',
        description: `No ${noun} code was provided in this link.`,
      });
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) return;

    setJoining(true);
    setPasswordError('');
    setErrorScreen(null);

    try {
      const body: { name: string; password?: string } = { name: trimmedName };
      const trimmedPassword = (passwordVal ?? password).trim();
      if (passwordRequired && trimmedPassword) {
        body.password = trimmedPassword;
      }

      const endpoint =
        kind === 'meeting'
          ? `/meetings/guest/${encodeURIComponent(roomCode)}/join`
          : `/calls/guest/${encodeURIComponent(roomCode)}/join`;
      const response = await api.post(endpoint, body);
      const data = unwrapApiData<GuestJoinData>(
        response.data,
        'Failed to join as guest'
      );

      if (!data?.guestToken || !data?.guestId) {
        throw new Error('Guest join response was invalid');
      }

      // Connect the socket singleton with guest auth and join the room
      const socket = connectAsGuest(data.guestToken);
      const emitRoomJoin = () => {
        try {
          if (kind === 'call') {
            socket.emit('call:join', {
              roomId: data.call?.callCode || roomCode,
              userId: data.guestId,
              userName: data.guestName,
              isHost: false,
            });
          } else {
            socket.emit('meeting:join', {
              meetingId: data.meeting?.meetingCode || roomCode,
              userId: data.guestId,
              userName: data.guestName,
              isHost: false,
            });
          }
        } catch (e) {
          console.warn('Failed to emit room join:', e);
        }
      };
      if (socket.connected) {
        emitRoomJoin();
      } else {
        socket.once('connect', emitRoomJoin);
      }

      setPasswordRequired(false);
      setPassword('');
      setJoinedData(data);
      toast({
        title: 'Joined as guest',
        description: `Connecting to the ${noun} room…`,
      });
    } catch (err: any) {
      const errorCode: string =
        err?.response?.data?.code ??
        err?.response?.data?.errorCode ??
        err?.response?.data?.error?.code ??
        '';
      const status = err?.response?.status;

      if (errorCode === 'PASSWORD_REQUIRED' || status === 403) {
        setPasswordRequired(true);
        // If we already sent a password, it was wrong — inline retry
        setPasswordError(
          password.trim() || passwordVal
            ? 'Incorrect password. Please try again.'
            : ''
        );
        return;
      }

      const mappedCode =
        errorCode ||
        (status === 404
          ? `${kind === 'meeting' ? 'MEETING' : 'CALL'}_NOT_FOUND`
          : status === 410
            ? `${kind === 'meeting' ? 'MEETING' : 'CALL'}_ENDED`
            : status === 409
              ? 'MAX_PARTICIPANTS_REACHED'
              : 'UNKNOWN');
      setErrorScreen(describeJoinError(mappedCode, getApiMessage(err, `Failed to join the ${noun}`)));
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = () => {
    try {
      const socket = getSingletonSocket();
      if (socket) {
        if (kind === 'call') {
          socket.emit('call:leave', {
            roomId: roomCode,
            userId: joinedData?.guestId || '',
            userName: joinedData?.guestName || '',
          });
        } else {
          socket.emit('meeting:leave', {
            meetingId: roomCode,
            userId: joinedData?.guestId || '',
            userName: joinedData?.guestName || '',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to emit leave:', e);
    }
    disconnectAsGuest();
    navigate('/');
  };

  if (joinedData) {
    return (
      <div className="fixed inset-0 bg-black z-50 overflow-hidden">
        <VideoCallRoom
          roomId={roomCode}
          meetingId={kind === 'meeting' ? joinedData.meeting?.id || joinedData.roomId : undefined}
          callId={kind === 'call' ? joinedData.call?.id || joinedData.roomId : undefined}
          callType={
            kind === 'call'
              ? joinedData.call?.type === 'audio'
                ? 'audio'
                : 'video'
              : 'video'
          }
          userName={joinedData.guestName}
          isHost={false}
          waitingRoomEnabled={
            joinedData.meeting?.waitingRoomEnabled ??
            joinedData.call?.waitingRoomEnabled
          }
          onLeave={handleLeave}
        />
      </div>
    );
  }

  if (errorScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-4">
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
            {errorScreen.canRetry && (
              <Button
                className="w-full"
                onClick={() => {
                  setErrorScreen(null);
                  setPasswordRequired(false);
                }}
              >
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/')}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const roomIcon =
    kind === 'call' ? (
      <Video className="h-7 w-7 text-indigo-400" />
    ) : (
      <Users className="h-7 w-7 text-indigo-400" />
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-gray-800/70 backdrop-blur border-0 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 rounded-full bg-indigo-500/20 p-3 w-fit">
            {roomIcon}
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            Join {kind === 'meeting' ? 'Meeting' : 'Call'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {roomCode ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-2">
                <span>
                  You've been invited to join{' '}
                  {kind === 'meeting' ? 'a meeting' : 'a call'}.
                </span>
                <Badge variant="outline" className="bg-white/5 font-mono">
                  {roomCode}
                </Badge>
              </span>
            ) : (
              'This invite link is missing its room code.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guest-name" className="text-white">
              Your name
            </Label>
            <Input
              id="guest-name"
              type="text"
              placeholder="e.g. Jane Doe"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && !joining) {
                  handleGuestJoin();
                }
              }}
              autoFocus
              disabled={joining}
            />
          </div>

          {passwordRequired && (
            <div className="space-y-2">
              <Label htmlFor="guest-password" className="text-white">
                Room password
              </Label>
              <Input
                id="guest-password"
                type="password"
                placeholder="Enter the room password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim() && !joining) {
                    handleGuestJoin();
                  }
                }}
                autoFocus
                disabled={joining}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => handleGuestJoin()}
            disabled={joining || !name.trim() || !roomCode}
          >
            {joining ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            {joining ? 'Joining…' : 'Join now'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            <Lock className="inline h-3 w-3 mr-1" />
            You're joining as a guest — no account required.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinAsGuest;
