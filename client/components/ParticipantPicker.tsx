import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X } from "lucide-react";
import type { TeamMember } from "@shared/api";

/**
 * Google-style unified participant picker.
 *
 * Type a name or email — if it belongs to a team member the chip shows their
 * NAME (and they join the roster as a real attendee), otherwise the address is
 * marked as a GUEST and invited by email. Used by the schedule-meeting dialog.
 */
export function ParticipantPicker({
  teamMembers,
  selectedAttendeeIds,
  guests,
  onAttendeesChange,
  onGuestsChange,
}: {
  teamMembers: TeamMember[];
  selectedAttendeeIds: string[];
  guests: string[];
  onAttendeesChange: (ids: string[]) => void;
  onGuestsChange: (emails: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const suggestions =
    query.trim().length >= 1
      ? teamMembers
          .filter((m) => {
            const q = query.trim().toLowerCase();
            const name = (m.name || "").toLowerCase();
            const email = (m.email || "").toLowerCase();
            return name.includes(q) || email.includes(q);
          })
          .filter((m) => !selectedAttendeeIds.includes(m.id))
          .slice(0, 5)
      : [];

  const commitEmail = () => {
    const value = query.trim().toLowerCase();
    if (!value) return;
    const member = teamMembers.find((m) => (m.email || "").toLowerCase() === value);
    if (member) {
      if (!selectedAttendeeIds.includes(member.id)) {
        onAttendeesChange([...selectedAttendeeIds, member.id]);
      }
    } else if (emailPattern.test(value)) {
      if (!guests.includes(value)) {
        onGuestsChange([...guests, value]);
      }
    }
    setQuery("");
  };

  const removeParticipant = (value: string, isTeam: boolean) => {
    if (isTeam) {
      onAttendeesChange(selectedAttendeeIds.filter((id) => id !== value));
    } else {
      onGuestsChange(guests.filter((email) => email !== value));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2.25rem] w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm">
        {selectedAttendeeIds.map((id) => {
          const member = teamMembers.find((m) => m.id === id);
          return (
            <Badge key={`team-${id}`} className="pl-1 pr-1 py-0.5 gap-1 bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-600/15">
              <span className="h-4 w-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                {(member?.name || "?").slice(0, 1).toUpperCase()}
              </span>
              {member?.name || "Team member"}
              <button type="button" aria-label="Remove" onClick={() => removeParticipant(id, true)} className="ml-0.5 rounded-full hover:bg-blue-600/20 p-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {guests.map((email) => (
          <Badge key={`guest-${email}`} className="pl-1 pr-1 py-0.5 gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/15">
            <UserPlus className="h-3 w-3" />
            {email}
            <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">Guest</span>
            <button type="button" aria-label="Remove" onClick={() => removeParticipant(email, false)} className="ml-0.5 rounded-full hover:bg-amber-600/20 p-0.5">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitEmail();
            } else if (e.key === "Backspace" && !query && (guests.length > 0 || selectedAttendeeIds.length > 0)) {
              if (guests.length > 0) removeParticipant(guests[guests.length - 1], false);
              else removeParticipant(selectedAttendeeIds[selectedAttendeeIds.length - 1], true);
            }
          }}
          placeholder={selectedAttendeeIds.length + guests.length === 0 ? "Add people by name or email…" : "Add more people…"}
          className="flex-1 min-w-[10rem] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
        />
      </div>
      {focused && (suggestions.length > 0 || emailPattern.test(query.trim().toLowerCase())) && (
        <div className="rounded-md border bg-popover shadow-md overflow-hidden">
          {suggestions.map((member) => (
            <button
              key={member.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAttendeesChange([...selectedAttendeeIds, member.id]);
                setQuery("");
              }}
            >
              <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {(member.name || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="font-medium">{member.name}</span>
              <span className="text-muted-foreground text-xs">{member.email}</span>
            </button>
          ))}
          {emailPattern.test(query.trim().toLowerCase()) &&
            !teamMembers.some((m) => (m.email || "").toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  commitEmail();
                }}
              >
                <span className="h-6 w-6 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  <UserPlus className="h-3 w-3" />
                </span>
                <span className="font-medium">{query.trim().toLowerCase()}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600">Add as guest</span>
              </button>
            )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Team members show their name · anyone else joins by email as a guest
      </p>
    </div>
  );
}

export default ParticipantPicker;
