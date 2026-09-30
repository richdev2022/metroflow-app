import { useMemo, useState } from "react";
import { AtSign, Ban, Briefcase, Crown, Loader2, Mail, MessageSquare, ShieldCheck, UserCheck, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media-url";

/** Minimal profile shape consumed by the modal (participant / member data). */
export interface ChatProfilePerson {
  userId: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  lastSeen?: string | null;
}

interface ChatProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person the modal is about (direct chat partner or clicked member). */
  person: ChatProfilePerson | null;
  /** When true the modal shows the group header + member list. */
  isGroup?: boolean;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  /** Group members rendered under the group header. */
  members?: ChatProfilePerson[];
  /** Status line for direct chats ("Online", "Last seen today at 7:46 PM", ...). */
  presenceLabel?: string | null;
  /** Quick action: closes the modal and focuses the chat composer. */
  onMessage?: () => void;
  /** Block state for direct chats (hydrated from conversation flags / /users/blocked). */
  isBlockedByMe?: boolean;
  /** Toggle block; when provided the Block/Unblock button renders with confirm. */
  onToggleBlock?: () => void;
  /** True while the block request is in flight. */
  blockBusy?: boolean;
}

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  manager: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  member: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

function initialsOf(name: string): string {
  const trimmed = (name || "?").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.substring(0, 2).toUpperCase();
}

/**
 * Chat profile view: large avatar, full name, email, role/job title and a
 * "Message" quick action that hands focus back to the composer. For group
 * conversations a member list is rendered instead of a single identity.
 */
export function ChatProfileModal({
  open,
  onOpenChange,
  person,
  isGroup = false,
  groupName,
  groupAvatarUrl,
  members = [],
  presenceLabel,
  onMessage,
  isBlockedByMe = false,
  onToggleBlock,
  blockBusy = false,
}: ChatProfileModalProps) {
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const avatarSrc = useMemo(
    () => (isGroup ? resolveMediaUrl(groupAvatarUrl) : resolveMediaUrl(person?.avatarUrl)),
    [isGroup, groupAvatarUrl, person?.avatarUrl]
  );
  const memberAvatarSrcs = useMemo(
    () => members.map((m) => ({ userId: m.userId, src: resolveMediaUrl(m.avatarUrl) })),
    [members]
  );

  const displayName = isGroup
    ? (groupName?.trim() || "Group chat")
    : (person?.name?.trim() || "Unknown");

  const role = person?.role && ROLE_STYLES[person.role] ? person.role : person?.role || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Gradient header band */}
        <div className="relative h-24 bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:14px_14px]" />
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-10 mb-3 flex items-end justify-between">
            <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
              {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} />}
              <AvatarFallback
                className={cn(
                  "bg-gradient-to-br text-white font-bold text-xl",
                  "from-blue-500 to-violet-600"
                )}
              >
                {isGroup ? <Users className="h-8 w-8" /> : initialsOf(displayName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && presenceLabel && (
              <span className="mb-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {presenceLabel}
              </span>
            )}
          </div>

          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl leading-tight">{displayName}</DialogTitle>
            <DialogDescription className="sr-only">
              {isGroup ? "Group profile and members" : "User profile"}
            </DialogDescription>
          </DialogHeader>

          {!isGroup && (
            <div className="mt-3 space-y-2 text-sm">
              {person?.email && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate text-foreground/90">{person.email}</span>
                </div>
              )}
              {(role || person?.jobTitle) && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Briefcase className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate text-foreground/90">
                    {person?.jobTitle || null}
                    {person?.jobTitle && role ? " · " : ""}
                    {role ? <span className="capitalize">{role}</span> : null}
                  </span>
                </div>
              )}
              {role && (
                <div className="pt-1">
                  <Badge variant="outline" className={cn("capitalize border", ROLE_STYLES[role] || "")}>
                    {role === "admin" && <Crown className="mr-1 h-3 w-3" />}
                    {role !== "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                    {role}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {isGroup && (
            <p className="mt-1 text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          )}

          {/* Quick actions */}
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 shadow-sm"
              onClick={() => {
                onOpenChange(false);
                onMessage?.();
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Message
            </Button>
            {!isGroup && person?.email && (
              <Button
                variant="outline"
                className="rounded-xl"
                title="Copy email"
                aria-label="Copy email"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(person.email || "");
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                <AtSign className="h-4 w-4" />
              </Button>
            )}
            {!isGroup && onToggleBlock && (
              <Button
                variant="outline"
                className={cn(
                  "rounded-xl",
                  isBlockedByMe
                    ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
                    : "border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400",
                )}
                title={isBlockedByMe ? "Unblock contact" : "Block contact"}
                aria-label={isBlockedByMe ? "Unblock contact" : "Block contact"}
                disabled={blockBusy}
                onClick={() => setBlockConfirmOpen(true)}
              >
                {blockBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isBlockedByMe ? (
                  <UserCheck className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {/* Group member list */}
          {isGroup && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Members
              </p>
              <ScrollArea className="max-h-64 pr-2">
                <div className="space-y-1">
                  {members.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No members to show
                    </p>
                  )}
                  {members.map((member, idx) => {
                    const mSrc = memberAvatarSrcs[idx]?.src;
                    const isYou = !!member.userId && member.userId === localStorage.getItem("userId");
                    return (
                      <div
                        key={member.userId || `${member.name}-${idx}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                      >
                        <Avatar className="h-9 w-9">
                          {mSrc && <AvatarImage src={mSrc} alt={member.name || "Member"} />}
                          <AvatarFallback
                            className={cn(
                              "bg-gradient-to-br text-white font-semibold text-[11px]",
                              "from-blue-500 to-indigo-600"
                            )}
                          >
                            {initialsOf(member.name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {member.name || "Unknown"}
                            {isYou && (
                              <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-500 dark:text-blue-400">
                                You
                              </span>
                            )}
                          </p>
                          {member.email && (
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          )}
                        </div>
                        {member.role && ROLE_STYLES[member.role] && (
                          <Badge
                            variant="outline"
                            className={cn("shrink-0 capitalize border text-[10px]", ROLE_STYLES[member.role])}
                          >
                            {member.role}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Block / unblock confirmation */}
        <AlertDialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isBlockedByMe ? `Unblock ${person?.name || "this contact"}?` : `Block ${person?.name || "this contact"}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isBlockedByMe
                  ? "They'll be able to send you messages and call you again."
                  : "They won't be able to send you messages or call you. You can unblock them anytime."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={cn(
                  isBlockedByMe
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setBlockConfirmOpen(false);
                  onToggleBlock?.();
                }}
              >
                {isBlockedByMe ? "Unblock" : "Block"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export default ChatProfileModal;
