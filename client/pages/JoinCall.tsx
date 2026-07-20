import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/layout';
import VideoCallRoom from '@/components/VideoCallRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api-client';
import { unwrapApiData } from '@/lib/api-response';
import { TeamMember, Call } from '@shared/api';

const JoinCall = () => {
  const { callCode } = useParams<{ callCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [call, setCall] = useState<Call | null>(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [joinAttempted, setJoinAttempted] = useState(false);

  useEffect(() => {
    const fetchCall = async () => {
      if (!callCode) return;

      try {
        const response = await api.get(`/calls/code/${callCode}`);
        const data = unwrapApiData(response);
        setCall(data);

        if (data.password) {
          setPasswordRequired(true);
          setShowPasswordInput(true);
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to find call',
          variant: 'destructive'
        });
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    const fetchTeamMembers = async () => {
      try {
        const response = await api.get('/team');
        setTeamMembers(response.data);
      } catch (err) {
        console.error('Failed to fetch team members:', err);
      }
    };

    fetchCall();
    fetchTeamMembers();
  }, [callCode, navigate, toast]);

  const handlePasswordSubmit = async () => {
    if (!call) return;

    try {
      setJoinAttempted(true);
      if (password !== call.password) {
        toast({
          title: 'Error',
          description: 'Incorrect password',
          variant: 'destructive'
        });
        return;
      }
      setShowPasswordInput(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to verify password',
        variant: 'destructive'
      });
    }
  };

  const currentParticipantIds = call?.participants?.map((p: any) => p.userId) || [];
  const isHost = call?.hostId === localStorage.getItem('userId');

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  if (!call) {
    return null;
  }

  return (
    <Layout>
      {showPasswordInput ? (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <h1 className="text-2xl font-bold">{call.type === 'video' ? 'Video' : 'Audio'} Call</h1>
          <p className="text-muted-foreground">This call requires a password to join</p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Enter call password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={handlePasswordSubmit}>Join</Button>
          </div>
        </div>
      ) : (
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
        />
      )}
    </Layout>
  );
};

export default JoinCall;
