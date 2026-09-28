import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import type { TeamMember } from "@shared/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface LeaderboardEntry {
  member: TeamMember;
  rate: number;
  completed: number;
  total: number;
}

interface LeaderboardCardProps {
  entries: LeaderboardEntry[];
  className?: string;
}

const RANK_STYLES = [
  {
    badge: "bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-white shadow-sm shadow-amber-500/30",
    bar: "bg-gradient-to-r from-amber-400 to-yellow-500",
    label: "1st",
  },
  {
    badge: "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-700 shadow-sm shadow-slate-400/30",
    bar: "bg-gradient-to-r from-slate-300 to-slate-400",
    label: "2nd",
  },
  {
    badge: "bg-gradient-to-br from-orange-200 via-amber-400 to-orange-500 text-white shadow-sm shadow-orange-500/30",
    bar: "bg-gradient-to-r from-orange-300 to-amber-500",
    label: "3rd",
  },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Top-3 completion-rate leaderboard: avatar stack, gradient rank badges
 * and gradient progress bars.
 */
export function LeaderboardCard({ entries, className }: LeaderboardCardProps) {
  return (
    <Card
      className={
        "relative overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border " +
        (className || "")
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl"
      />
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Top Performers
            </CardTitle>
            <CardDescription>Completion rate leaders across all tasks</CardDescription>
          </div>
          {/* Avatar stack */}
          {entries.length > 0 && (
            <div className="flex -space-x-2" aria-hidden="true">
              {entries.map((entry) => (
                <Avatar
                  key={entry.member.id}
                  className="h-8 w-8 border-2 border-background"
                >
                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                    {initials(entry.member.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No completed tasks yet — the podium is waiting.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {entries.map((entry, index) => {
              const style = RANK_STYLES[Math.min(index, RANK_STYLES.length - 1)];
              return (
                <div
                  key={entry.member.id}
                  className="group rounded-xl bg-muted/40 p-4 ring-1 ring-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/60"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        style.badge
                      )}
                    >
                      {index + 1}
                    </span>
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="text-xs font-bold">
                        {initials(entry.member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{entry.member.name}</p>
                      <p className="text-xs text-muted-foreground">{style.label} place</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", style.bar)}
                        style={{ width: `${Math.min(100, entry.rate)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {entry.completed}/{entry.total} tasks
                      </span>
                      <span className="font-semibold text-foreground">
                        {entry.rate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="pt-1 text-center">
          <Link
            to="/ranking"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View Full Ranking <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default LeaderboardCard;
