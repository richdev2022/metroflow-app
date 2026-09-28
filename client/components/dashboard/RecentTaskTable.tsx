import React from "react";
import { Copy } from "lucide-react";
import type { Task, TeamMember, Epic } from "@shared/api";
import { Button } from "@/components/ui/button";
import { StatusPill, DueDateLabel, AssigneeAvatars } from "./task-bits";

interface RecentTaskTableProps {
  tasks: Task[];
  teamMembers: TeamMember[];
  epicsList?: Epic[];
  onOpenTask: (task: Task) => void;
  onCopyId?: (displayId: string | number) => void;
  showEpicColumn?: boolean;
}

/**
 * Polished recent-tasks table used on the dashboard (md+ screens get the
 * full table; below md it gracefully scrolls horizontally).
 */
export function RecentTaskTable({
  tasks,
  teamMembers,
  epicsList,
  onOpenTask,
  onCopyId,
  showEpicColumn = false,
}: RecentTaskTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="w-[90px] px-3 py-3 font-medium text-muted-foreground first:pl-4">ID</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">Title</th>
            {showEpicColumn && (
              <th className="px-3 py-3 font-medium text-muted-foreground">Epic</th>
            )}
            <th className="px-3 py-3 font-medium text-muted-foreground">Assignees</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-3 font-medium text-muted-foreground last:pr-4">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="group cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
              onClick={() => onOpenTask(task)}
            >
              <td className="px-3 py-3 first:pl-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{(task as any).displayId ?? task.id.slice(0, 6)}
                  </span>
                  {onCopyId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Copy task ID"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyId((task as any).displayId ?? task.id);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </td>
              <td className="max-w-[260px] px-3 py-3 font-medium">
                <div className="truncate" title={task.title}>
                  {task.title}
                </div>
              </td>
              {showEpicColumn && (
                <td className="px-3 py-3 text-muted-foreground">
                  {epicsList?.find((e) => e.id === task.epicId)?.name || task.epic || "—"}
                </td>
              )}
              <td className="px-3 py-3">
                <AssigneeAvatars
                  assigneeIds={task.assignedTo}
                  members={teamMembers}
                  max={3}
                />
              </td>
              <td className="px-3 py-3">
                <StatusPill status={task.status} />
              </td>
              <td className="px-3 py-3 last:pr-4">
                <DueDateLabel endDate={task.endDate} status={task.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RecentTaskTable;
