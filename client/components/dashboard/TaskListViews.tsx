import React from "react";
import { Copy, Edit, Trash2 } from "lucide-react";
import type { Task, TeamMember } from "@shared/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StatusPill, DueDateLabel, AssigneeAvatars } from "./task-bits";
import { cn } from "@/lib/utils";

export interface TaskRowHandlers {
  isSelected: boolean;
  onSelectToggle: (checked: boolean) => void;
  onOpen: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onCopyId?: (displayId: string | number) => void;
}

/** Numeric progress (0-100) from targetValue/accomplishedValue, or null. */
export function numericProgress(task: Task): number | null {
  const target = Number(task.targetValue);
  const done = Number(task.accomplishedValue);
  if (isNaN(target) || isNaN(done) || target <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((done / target) * 100)));
}

/* ------------------------------------------------------------------ */
/* Mobile: compact task card (below md breakpoint)                     */
/* ------------------------------------------------------------------ */

export function TaskCardMobile({
  task,
  teamMembers,
  handlers,
}: {
  task: Task;
  teamMembers: TeamMember[];
  handlers: TaskRowHandlers;
}) {
  const pct = numericProgress(task);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
      onClick={() => handlers.onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") handlers.onOpen(task);
      }}
      className={cn(
        "cursor-pointer rounded-xl border bg-card p-3.5 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        handlers.isSelected ? "border-primary/40 bg-primary/5" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Select task ${task.title}`}
            checked={handlers.isSelected}
            onCheckedChange={(checked) => handlers.onSelectToggle(checked as boolean)}
            className="mt-0.5"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="break-words text-sm font-medium leading-snug">{task.title}</p>
            <StatusPill status={task.status} className="shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <AssigneeAvatars assigneeIds={task.assignedTo} members={teamMembers} max={4} />
            <DueDateLabel endDate={task.endDate} status={task.status} />
          </div>

          {pct !== null && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                #{(task as any).displayId ?? task.id.slice(0, 6)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {new Date(task.startDate).toLocaleDateString()} –{" "}
                {new Date(task.endDate).toLocaleDateString()}
              </span>
            </div>
            <div
              className="flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {handlers.onCopyId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Copy task ID"
                  onClick={() => handlers.onCopyId!((task as any).displayId ?? task.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label="Edit task"
                onClick={() => handlers.onOpen(task)}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                aria-label="Delete task"
                onClick={() => handlers.onDelete(task.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* md+: polished table row                                             */
/* ------------------------------------------------------------------ */

export function TaskTableRow({
  task,
  teamMembers,
  handlers,
}: {
  task: Task;
  teamMembers: TeamMember[];
  handlers: TaskRowHandlers;
}) {
  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50",
        handlers.isSelected && "bg-primary/5"
      )}
      onClick={() => handlers.onOpen(task)}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select task ${task.title}`}
          checked={handlers.isSelected}
          onCheckedChange={(checked) => handlers.onSelectToggle(checked as boolean)}
        />
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 group/id">
          <span className="font-mono text-xs text-muted-foreground">
            #{(task as any).displayId}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 transition-opacity group-hover/id:opacity-100"
            aria-label="Copy task ID"
            onClick={() =>
              handlers.onCopyId?.((task as any).displayId)
            }
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </td>
      <td className="max-w-[240px] px-4 py-3 font-medium">
        <div className="break-words whitespace-normal" title={task.title}>
          {task.title}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{task.sprint || "—"}</td>
      <td className="px-4 py-3">
        <StatusPill status={task.status} />
      </td>
      <td className="px-4 py-3">
        <AssigneeAvatars assigneeIds={task.assignedTo} members={teamMembers} max={3} />
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {new Date(task.startDate).toLocaleDateString()} –{" "}
          {new Date(task.endDate).toLocaleDateString()}
        </div>
        <DueDateLabel endDate={task.endDate} status={task.status} className="mt-0.5" />
      </td>
      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Edit task"
            onClick={() => handlers.onOpen(task)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            aria-label="Delete task"
            onClick={() => handlers.onDelete(task.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
