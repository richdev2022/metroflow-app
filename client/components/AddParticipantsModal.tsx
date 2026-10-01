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
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import type { AddParticipantsInput, AddParticipantsResponse, TeamMember } from '@shared/api';
import { api } from '../lib/api-client';
import { unwrapApiData, getApiMessage } from '../lib/api-response';
import { UserPlus, CheckCircle2, AlertCircle, Loader2, Mail, X, Copy, Check } from 'lucide-react';
import { useToast } from './ui/use-toast';

type RoomType = 'meeting' | 'call';

export interface InviteDetails {
  title?: string;
  code?: string;
  password?: string | null;
  waitingRoomEnabled?: boolean;
  startTime?: string;
}

interface AddParticipantsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomType: RoomType;
  currentParticipantIds: string[];
  allTeamMembers: TeamMember[];
  /** Info used to build the "Copy invite details" text */
  inviteDetails?: InviteDetails | null;
  onParticipantsAdded?: (addedIds: string[]) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AddParticipantsModal: React.FC<AddParticipantsModalProps> = ({
  open,
  onOpenChange,
  roomId,
  roomType,
  currentParticipantIds = [],
  allTeamMembers = [],
  inviteDetails = null,
  onParticipantsAdded,
}) => {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const availableUsers = allTeamMembers.filter(
    (user) => !currentParticipantIds.includes(user.id)
  );

  // Email→identity lookup while typing: a matching team member is invited as a
  // real participant; anything else stays a guest email. Mirrors the picker
  // used by the schedule dialog.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const typedQuery = emailInput.trim().toLowerCase();
  const typedMember = typedQuery
    ? allTeamMembers.find((m) => (m.email || "").toLowerCase() === typedQuery)
    : undefined;
  const memberSuggestions =
    typedQuery.length >= 2
      ? availableUsers
          .filter(
            (m) =>
              (m.name || "").toLowerCase().includes(typedQuery) ||
              (m.email || "").toLowerCase().includes(typedQuery)
          )
          .slice(0, 5)
      : [];

  const commitTypedValue = () => {
    const value = emailInput.trim().toLowerCase();
    if (!value) return;
    if (typedMember) {
      // Team member — select as a real participant (roster + notification).
      if (!selectedUserIds.includes(typedMember.id) && !currentParticipantIds.includes(typedMember.id)) {
        setSelectedUserIds((prev) => [...prev, typedMember.id]);
      }
      setEmailInput("");
      setEmailError(null);
      return;
    }
    addEmail();
  };

  const addEmail = () => {
    const value = emailInput.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_REGEX.test(value)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (emails.includes(value)) {
      setEmailError('This email was already added');
      return;
    }
    setEmails((prev) => [...prev, value]);
    setEmailInput('');
    setEmailError(null);
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const buildInviteText = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const code = inviteDetails?.code || roomId;
    const link = `${origin}/${roomType === 'meeting' ? 'meetings' : 'calls'}/${code}`;
    const lines: string[] = [
      `Join my ${roomType} on Metricorex!`,
    ];
    if (inviteDetails?.title) lines.push(`Title: ${inviteDetails.title}`);
    if (inviteDetails?.startTime) {
      try {
        lines.push(`When: ${new Date(inviteDetails.startTime).toLocaleString()}`);
      } catch { /* skip */ }
    }
    if (code) lines.push(`${roomType === 'meeting' ? 'Meeting' : 'Call'} code: ${code}`);
    lines.push(`Link: ${link}`);
    if (inviteDetails?.password) lines.push(`Password: ${inviteDetails.password}`);
    if (inviteDetails?.waitingRoomEnabled) {
      lines.push('Note: waiting room is enabled - the host will admit you.');
    }
    lines.push('', 'No account needed - open the link and join as a guest.');
    return lines.join('\n');
  };

  const handleCopyInvite = async () => {
    const text = buildInviteText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast({
        title: 'Invite copied',
        description: 'Full details copied (code, link, password) — paste anywhere to share.',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Clipboard access was blocked by the browser.',
      });
    }
  };

  const handleAddParticipants = async () => {
    if (selectedUserIds.length === 0 && emails.length === 0) {
      setError('Select at least one team member or add one email address');
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

      const payload: AddParticipantsInput = {};
      if (selectedUserIds.length > 0) payload.participantIds = selectedUserIds;
      if (emails.length > 0) payload.emails = emails;

      const response = await api.post<AddParticipantsResponse>(endpoint, payload);

      // The full response is the ApiEnvelope with success, message, data
      const fullResponse = response.data;
      setSuccess(fullResponse.message || 'Invitations sent');
      setSelectedUserIds([]);
      setEmails([]);
      setEmailInput('');
      onParticipantsAdded?.(fullResponse.data?.added || []);

      // Close after a short delay so the user can read the result
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      setError(getApiMessage(err, 'Failed to add participants'));
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
    setEmails([]);
    setEmailInput('');
    setEmailError(null);
    setError(null);
    setSuccess(null);
    onOpenChange(false);
  };

  const canSubmit = !loading && (selectedUserIds.length > 0 || emails.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        overlayClassName="z-[96]"
        className="z-[96] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Participants
          </DialogTitle>
          <DialogDescription>
            Add team members, invite by email, or copy the full invite details to share
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-600">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <p className="text-sm">{success}</p>
          </div>
        )}

        {/* ===== Copy full invite details ===== */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Share this {roomType}</p>
              <p className="text-xs text-muted-foreground truncate">
                {inviteDetails?.code || roomId}
                {inviteDetails?.password ? ' · password protected' : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={handleCopyInvite}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            Copies the full invite — link, {roomType} code{inviteDetails?.password ? ', password' : ''} and notes — ready to paste in chat or email.
          </p>
        </div>

        {/* ===== Invite by email ===== */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Mail className="h-4 w-4" /> Invite by email
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Type a name or email — team members are detected automatically"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setEmailError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  commitTypedValue();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={commitTypedValue} className="shrink-0">
              Add
            </Button>
          </div>
          {/* Smart lookup: show live team-member suggestions while typing */}
          {(memberSuggestions.length > 0 || (emailPattern.test(typedQuery) && !typedMember)) && (
            <div className="rounded-md border bg-popover shadow-sm overflow-hidden">
              {memberSuggestions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!selectedUserIds.includes(m.id)) {
                      setSelectedUserIds((prev) => [...prev, m.id]);
                    }
                    setEmailInput("");
                    setEmailError(null);
                  }}
                >
                  <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {(m.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground text-xs">{m.email}</span>
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-blue-600">Team</span>
                </button>
              ))}
              {emailPattern.test(typedQuery) && !typedMember && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commitTypedValue}
                >
                  <span className="h-6 w-6 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    <Mail className="h-3 w-3" />
                  </span>
                  <span className="font-medium">{typedQuery}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600">Add as guest</span>
                </button>
              )}
            </div>
          )}
          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {emails.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    className="rounded-full outline-none hover:bg-destructive/20 p-0.5"
                    onClick={() => removeEmail(email)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground px-1">
            They receive an email with the join link and can join as a guest — no account needed.
          </p>
        </div>

        {/* ===== Team members ===== */}
        <div className="py-1">
          <p className="text-sm font-medium mb-2">Team members</p>
          <ScrollArea className="h-[220px] rounded-md border">
            <div className="p-3 space-y-2">
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
            disabled={!canSubmit}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading
              ? 'Adding...'
              : `Invite ${selectedUserIds.length + emails.length} participant${selectedUserIds.length + emails.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
