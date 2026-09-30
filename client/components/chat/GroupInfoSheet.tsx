import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Crown, Loader2, LogOut, MoreVertical, ShieldCheck, UserMinus, UserCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import { useToast } from "@/components/ui/use-toast";
import { isRecent, parseDateSafe } from "@/lib/last-seen";

// ==========================================
// Backend contract (GET /chat/conversations/:cid/participants)
// ==========================================

export interface GroupParticipant {
  userId: string;
  name?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  presenceStatus?: string | null;
  lastSeenAt?: string | null;
  joinedAt?: string | null;
}

const ACTIVE_PRESENCE = ["online", "busy", "in-meeting", "calling", "do-not-disturb"];

function initialsOf(name?: string | null): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

function presenceLabel(p: GroupParticipant): string {
  if (p.presenceStatus && ACTIVE_PRESENCE.includes(p.presenceStatus)) {
    if (p.presenceStatus === "online") return "Online";
    if (p.presenceStatus === "busy") return "Busy";
    if (p.presenceStatus === "calling") return "In a call";
    if (p.presenceStatus === "in-meeting") return "In a meeting";
    if (p.presenceStatus === "do-not-disturb") return "Do not disturb";
  }
  if (isRecent(p.lastSeenAt)) return "Online";
  const d = parseDateSafe(p.lastSeenAt);
  if (d) return `Last seen ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return "Offline";
}

function isOnline(p: GroupParticipant): boolean {
  return (!!p.presenceStatus && ACTIVE_PRESENCE.includes(p.presenceStatus)) || isRecent(p.lastSeenAt);
}

interface GroupInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  groupName: string;
  groupAvatarUrl?: string | null;
  /** My role in this conversation ('admin' unlocks member management). */
  myRole?: string | null;
  /** Called after the current user leaves the group (clears selection). */
  onLeft: () => void;
  /** Blocked-user ids (hydrated in Chat) so member rows show Un/Block. */
  blockedUserIds?: Set<string>;
  /** Refresh Chat's blocked-users state after a block/unblock. */
  onBlockedChanged?: () => void;
}

/**
 * WhatsApp-style group info sheet: members list (GET participants) with
 * presence dots, admin promote/demote/remove actions, per-member block, and
 * a destructive "Leave group" action with confirmation.
 */
export function GroupInfoSheet({
  open,
  onOpenChange,
  conversationId,
  groupName,
  groupAvatarUrl,
  myRole,
  onLeft,
  blockedUserIds,
  onBlockedChanged,
}: GroupInfoSheetProps) {
  const { toast } = useToast();
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<GroupParticipant | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const currentUserId = localStorage.getItem("userId") || "";
  const amAdmin = myRole === "admin";

  const fetchParticipants = useCallback(() => {
    if (!conversationId) return;
    setLoading(true);
    api
      .get(`/chat/conversations/${conversationId}/participants`)
      .then((res) => {
        const data = unwrapApiData<{ participants?: GroupParticipant[] }>(res.data, "");
        setParticipants(data?.participants || []);
      })
      .catch((err) => {
        toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to load members") });
      })
      .finally(() => setLoading(false));
  }, [conversationId, toast]);

  useEffect(() => {
    if (open && conversationId) fetchParticipants();
  }, [open, conversationId, fetchParticipants]);

  const onlineCount = useMemo(() => participants.filter(isOnline).length, [participants]);

  const setRole = async (p: GroupParticipant, role: "admin" | "member") => {
    setBusyUserId(p.userId);
    try {
      await api.patch(`/chat/conversations/${conversationId}/participants/${p.userId}`, { role });
      setParticipants((prev) => prev.map((m) => (m.userId === p.userId ? { ...m, role } : m)));
      toast({ title: role === "admin" ? "Promoted to admin" : "Changed to member" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to update role") });
    } finally {
      setBusyUserId(null);
    }
  };

  const removeMember = async (p: GroupParticipant) => {
    setBusyUserId(p.userId);
    try {
      await api.delete(`/chat/conversations/${conversationId}/participants/${p.userId}`);
      setParticipants((prev) => prev.filter((m) => m.userId !== p.userId));
      toast({ title: "Member removed", description: `${p.name || "Member"} was removed from the group.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to remove member") });
    } finally {
      setBusyUserId(null);
      setMemberToRemove(null);
    }
  };

  const toggleBlock = async (p: GroupParticipant) => {
    const blocked = blockedUserIds?.has(p.userId);
    setBusyUserId(p.userId);
    try {
      if (blocked) {
        await api.delete(`/users/${p.userId}/block`);
        toast({ title: "Unblocked", description: `${p.name || "Member"} can message you again.` });
      } else {
        await api.post(`/users/${p.userId}/block`);
        toast({ title: "Blocked", description: `${p.name || "Member"} can no longer message you.` });
      }
      onBlockedChanged?.();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to update block") });
    } finally {
      setBusyUserId(null);
    }
  };

  const leaveGroup = async () => {
    setLeaving(true);
    try {
      await api.post(`/chat/conversations/${conversationId}/leave`);
      toast({ title: "You left the group" });
      onOpenChange(false);
      onLeft();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to leave group") });
    } finally {
      setLeaving(false);
      setConfirmLeaveOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/70">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              {groupAvatarUrl && <AvatarImage src={resolveMediaUrl(groupAvatarUrl)} alt={groupName} />}
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-600 font-semibold text-white">
                {initialsOf(groupName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg leading-tight">{groupName || "Group"}</SheetTitle>
              <SheetDescription className="text-xs">
                {loading
                  ? "Loading members…"
                  : `${participants.length} ${participants.length === 1 ? "member" : "members"} · ${onlineCount} online`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-3 py-3">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </p>
            {loading && participants.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-0.5">
                {participants.map((p) => {
                  const isYou = p.userId === currentUserId;
                  const online = isOnline(p);
                  const role = p.role || "member";
                  const blocked = !!blockedUserIds?.has(p.userId);
                  const busy = busyUserId === p.userId;
                  return (
                    <div
                      key={p.userId}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          {p.avatarUrl && (
                            <AvatarImage src={resolveMediaUrl(p.avatarUrl)} alt={p.name || "Member"} />
                          )}
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-semibold text-white">
                            {initialsOf(p.name)}
                          </AvatarFallback>
                        </Avatar>
                        {online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                          {p.name || "Unknown"}
                          {isYou && (
                            <span className="text-[10px] font-semibold uppercase text-blue-500 dark:text-blue-400">
                              You
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{presenceLabel(p)}</p>
                      </div>
                      {role === "admin" && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-violet-500/30 bg-violet-500/15 text-[10px] text-violet-600 dark:text-violet-400"
                        >
                          <Crown className="mr-1 h-3 w-3" />
                          Admin
                        </Badge>
                      )}
                      {/* Member actions (admin controls + block) — hidden for yourself */}
                      {!isYou && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              disabled={busy}
                              aria-label={`Actions for ${p.name || "member"}`}
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {amAdmin && role !== "admin" && (
                              <DropdownMenuItem onClick={() => setRole(p, "admin")}>
                                <Crown className="h-4 w-4 mr-2" /> Promote to admin
                              </DropdownMenuItem>
                            )}
                            {amAdmin && role === "admin" && (
                              <DropdownMenuItem onClick={() => setRole(p, "member")}>
                                <ShieldCheck className="h-4 w-4 mr-2" /> Demote to member
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => toggleBlock(p)}>
                              {blocked ? (
                                <>
                                  <UserCheck className="h-4 w-4 mr-2" /> Unblock
                                </>
                              ) : (
                                <>
                                  <Ban className="h-4 w-4 mr-2" /> Block
                                </>
                              )}
                            </DropdownMenuItem>
                            {amAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => setMemberToRemove(p)}
                                >
                                  <UserMinus className="h-4 w-4 mr-2" /> Remove from group
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Leave group */}
        <div className="border-t border-border/70 p-4">
          <Button
            variant="outline"
            className="w-full rounded-xl border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
            onClick={() => setConfirmLeaveOpen(true)}
          >
            <LogOut className="mr-2 h-4 w-4" /> Leave group
          </Button>
        </div>

        {/* Remove-member confirm */}
        <AlertDialog open={!!memberToRemove} onOpenChange={(o) => !o && setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {memberToRemove?.name || "this member"}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will no longer receive messages from this group. You can add them back later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={(e) => {
                  e.preventDefault();
                  if (memberToRemove) removeMember(memberToRemove);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Leave-group confirm */}
        <AlertDialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave this group?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll no longer receive messages from this group.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={leaving}
                onClick={(e) => {
                  e.preventDefault();
                  leaveGroup();
                }}
              >
                {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Leave group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
