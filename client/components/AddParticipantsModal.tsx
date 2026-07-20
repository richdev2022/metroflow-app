import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import type { AddParticipantsInput, AddParticipantsResponse, TeamMember } from '@shared/api';
import { api } from '../lib/api-client';
import { unwrapApiData } from '../lib/api-response';
import { UserPlus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

type RoomType = 'meeting' | 'call';

interface AddParticipantsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomType: RoomType;
  currentParticipantIds: string[];
  allTeamMembers: TeamMember[];
  onParticipantsAdded?: (addedIds: string[]) => void;
}

export const AddParticipantsModal: React.FC<AddParticipantsModalProps> = ({
  open,
  onOpenChange,
  roomId,
  roomType,
  currentParticipantIds = [],
  allTeamMembers = [],
  onParticipantsAdded,
}) => {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableUsers = allTeamMembers.filter(
    (user) => !currentParticipantIds.includes(user.id)
  );

  const handleAddParticipants = async () => {
    if (selectedUserIds.length === 0) {
      setError('Please select at least one participant');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const endpoint =
        roomType === 'meeting'
          ? `/meetings/${roomId}/participants`
          : `/calls/${roomId}/participants`;

      const response = await api.post<AddParticipantsResponse>(
          endpoint,
          { participantIds: selectedUserIds } as AddParticipantsInput
        );

        // The full response is the ApiEnvelope with success, message, data
        const fullResponse = response.data;
        setSuccess(fullResponse.message);
        setSelectedUserIds([]);
        onParticipantsAdded?.(fullResponse.data.added);
      
      // Close after a short delay
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to add participants');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleClose = () => {
    setSelectedUserIds([]);
    setError(null);
    setSuccess(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Participants
          </DialogTitle>
          <DialogDescription>
            Select team members to add to this {roomType}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm">{success}</p>
          </div>
        )}

        <div className="py-4">
          <ScrollArea className="h-[300px] rounded-md border">
            <div className="p-4 space-y-2">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  All team members are already in this {roomType}
                </p>
              ) : (
                availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 rounded-md p-2 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => toggleUserSelection(user.id)}
                  >
                    <Checkbox
                      id={`user-${user.id}`}
                      checked={selectedUserIds.includes(user.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedUserIds((prev) => [...prev, user.id]);
                        } else {
                          setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));
                        }
                      }}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleAddParticipants}
            disabled={loading || selectedUserIds.length === 0}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Adding...' : `Add ${selectedUserIds.length} Participant${selectedUserIds.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
