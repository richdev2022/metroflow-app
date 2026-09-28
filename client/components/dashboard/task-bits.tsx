import React from "react";
import { AlertCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Status pill with dot indicator                                      */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, { dot: string; pill: string; label: string }> = {
  completed: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400",
    label: "Completed",
  },
  in_progress: {
    dot: "bg-violet-500",
    pill: "bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-500/20 dark:text-violet-400",
    label: "In Progress",
  },
  todo: {
    dot: "bg-sky-500",
    pill: "bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400",
    label: "To Do",
  },
  pending: {
    dot: "bg-amber-500",
    pill: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400",
    label: "Pending",
  },
  blocked: {
    dot: "bg-red-500",
    pill: "bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400",
    label: "Blocked",
  },
};

const FALLBACK_STYLE = {
  dot: "bg-muted-foreground",
  pill: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] || {
    ...FALLBACK_STYLE,
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.pill,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Relative due-date label                                             */
/* ------------------------------------------------------------------ */

export type DueTone = "overdue" | "today" | "soon" | "normal";

export function getDueLabel(
  endDate?: string | null,
  status?: string
): { text: string; tone: DueTone } | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(end);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (status === "completed") {
    return { text: `Done · ${target.toLocaleDateString()}`, tone: "normal" };
  }
  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, tone: "overdue" };
  }
  if (diffDays === 0) return { text: "Due today", tone: "today" };
  if (diffDays === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${diffDays} days`, tone: "normal" };
}

const toneClasses: Record<DueTone, string> = {
  overdue: "text-red-600 dark:text-red-400 font-medium",
  today: "text-amber-600 dark:text-amber-400 font-medium",
  soon: "text-amber-600/90 dark:text-amber-400/90",
  normal: "text-muted-foreground",
};

export function DueDateLabel({
  endDate,
  status,
  className,
  showIcon = true,
}: {
  endDate?: string | null;
  status?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const label = getDueLabel(endDate, status);
  if (!label) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        toneClasses[label.tone],
        className
      )}
    >
      {showIcon && label.tone === "overdue" && (
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {label.text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Assignee avatar stack                                               */
/* ------------------------------------------------------------------ */

export function AssigneeAvatars({
  assigneeIds,
  members,
  max = 3,
  className,
}: {
  assigneeIds?: string[];
  members: { id: string; name: string }[];
  max?: number;
  className?: string;
}) {
  const resolved = (assigneeIds || [])
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as { id: string; name: string }[];

  if (resolved.length === 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Unassigned</span>;
  }

  const visible = resolved.slice(0, max);
  const extra = resolved.length - visible.length;

  return (
    <div className={cn("flex -space-x-1.5", className)}>
      {visible.map((m) => (
        <Avatar key={m.id} className="h-6 w-6 border border-background" title={m.name}>
          <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
            {m.name
              .trim()
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}
